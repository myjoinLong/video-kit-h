#!/usr/bin/env node
/**
 * encode.mjs — 音乐动画成片编码工具（RAW RGBA 帧 -> H.264 / AAC MP4）
 *
 * 设计要点（对应本片硬性规格）：
 *   - 画幅 / 帧率由调用方传入（main.mjs 已按 config 显式传 width/height/fps）
 *   - 音频：显式 `-map 1:a:0` 取音频文件的第一条音频流。源 FLAC 里 index 1 是
 *     mjpeg 封面流（attached_pic），绝不能当作画面或音轨，所以绝不使用
 *     `-map 1:v` / `-map 1` 这类会顺带带出封面流的写法。
 *   - 音轨零点不移动、不变调不变速、不截尾：只做 `apad` 补静音，且用
 *     `-shortest`（默认）或 atrim+apad 精确封口，绝不 atrim 掉源音频尾部。
 *   - 背压：stdin.write 返回 false 时等 drain，否则 8.29 MB/帧会把内存打爆。
 *   - 进度：每 progressEvery 帧往 stderr 打一行 `frame N/M`。
 *
 * 注意：ffmpeg 9 已移除 `-vsync`，必须用 `-fps_mode cfr`（语义等价）。
 *       本模块会自动探测，老版本 ffmpeg 上回落 `-vsync cfr`。
 *
 * 用法（模块）：
 *   import { encodeFromRawFrames } from './tools/encode.mjs';
 *   await encodeFromRawFrames({ audioPath, outPath, frames: asyncIterableOfRGBA });
 *
 * 用法（CLI）：
 *   node tools/encode.mjs --audio audio/Swings.flac --out out/x.mp4 --raw frames.rgba
 *   node tools/encode.mjs --probe-nvenc
 */

import { spawn } from 'node:child_process';
import { open, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_FPS = 30;
export const DEFAULT_WIDTH = 1920;
export const DEFAULT_HEIGHT = 1080;
export const DEFAULT_CRF = 18;
export const DEFAULT_PRESET = 'medium';
export const DEFAULT_AUDIO_BITRATE = '320k';
export const DEFAULT_AUDIO_SAMPLE_RATE = 44100;
export const DEFAULT_AUDIO_CHANNELS = 2;

const STDERR_TAIL_LIMIT = 256 * 1024;

const NVENC_PRESET_MAP = {
  ultrafast: 'p1',
  superfast: 'p2',
  veryfast: 'p3',
  faster: 'p4',
  fast: 'p5',
  medium: 'p5',
  slow: 'p6',
  slower: 'p7',
  veryslow: 'p7',
  placebo: 'p7',
};

function tail(text, max = 4000) {
  if (typeof text !== 'string') return '';
  return text.length <= max ? text : text.slice(text.length - max);
}

function isEven(n) {
  return Number.isInteger(n) && n > 0 && n % 2 === 0;
}

// ---------------------------------------------------------------------------
// 子进程工具
// ---------------------------------------------------------------------------

/**
 * 跑一个子进程并收集输出。默认忽略 stdout（避免大缓冲）。
 * @returns {Promise<{code:number, stderr:string, stdout:Buffer}>}
 */
export function runProcess(command, args, { timeoutMs = 0, captureStdout = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', 'pipe'],
    });

    let stderr = '';
    let stdoutChunks = [];
    let timer = null;
    let done = false;

    const finish = (fn, value) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        finish(reject, new Error(`${command} 超时（${timeoutMs} ms）：${tail(stderr.trim(), 800)}`));
      }, timeoutMs);
    }

    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > STDERR_TAIL_LIMIT) stderr = tail(stderr, STDERR_TAIL_LIMIT);
    });
    if (captureStdout) {
      child.stdout.on('data', (d) => stdoutChunks.push(d));
    }

    child.on('error', (err) => {
      finish(reject, err);
    });
    child.on('close', (code) => {
      finish(resolve, {
        code,
        stderr,
        stdout: captureStdout ? Buffer.concat(stdoutChunks) : Buffer.alloc(0),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// 能力探测
// ---------------------------------------------------------------------------

const nvencProbeCache = new Map();

/**
 * 探测 h264_nvenc 是否真的能编码（不是只看 -encoders 列表里有没有）。
 * 结果按 ffmpegPath 缓存。
 * @returns {Promise<{available:boolean, detail:string}>}
 */
export function probeNvenc({ ffmpegPath = 'ffmpeg', timeoutMs = 30000 } = {}) {
  if (!nvencProbeCache.has(ffmpegPath)) {
    nvencProbeCache.set(
      ffmpegPath,
      (async () => {
        const args = [
          '-hide_banner', '-loglevel', 'error', '-nostdin',
          '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.1:r=30',
          '-c:v', 'h264_nvenc', '-f', 'null', '-',
        ];
        try {
          const res = await runProcess(ffmpegPath, args, { timeoutMs });
          if (res.code === 0) {
            return { available: true, detail: 'h264_nvenc 试编码 3 帧成功（256x256）' };
          }
          return {
            available: false,
            detail: `h264_nvenc 试编码失败（exit ${res.code}）：${tail(res.stderr.trim(), 800)}`,
          };
        } catch (err) {
          return { available: false, detail: `h264_nvenc 试编码异常：${String(err && err.message ? err.message : err)}` };
        }
      })(),
    );
  }
  return nvencProbeCache.get(ffmpegPath);
}

const fpsModeCache = new Map();

/**
 * 探测本机 ffmpeg 支持哪种恒定帧率开关。ffmpeg 9 移除了 -vsync。
 * @returns {Promise<string[]>} 例如 ['-fps_mode','cfr']
 */
export function detectFpsModeFlag({ ffmpegPath = 'ffmpeg', timeoutMs = 30000 } = {}) {
  if (!fpsModeCache.has(ffmpegPath)) {
    fpsModeCache.set(
      ffmpegPath,
      (async () => {
        try {
          const a = await runProcess(ffmpegPath, [
            '-hide_banner', '-loglevel', 'error', '-nostdin',
            '-f', 'lavfi', '-i', 'color=c=black:s=32x32:d=0.1:r=30',
            '-c:v', 'libx264', '-fps_mode', 'cfr', '-f', 'null', '-',
          ], { timeoutMs });
          if (a.code === 0) return ['-fps_mode', 'cfr'];
          const b = await runProcess(ffmpegPath, [
            '-hide_banner', '-loglevel', 'error', '-nostdin',
            '-f', 'lavfi', '-i', 'color=c=black:s=32x32:d=0.1:r=30',
            '-c:v', 'libx264', '-vsync', 'cfr', '-f', 'null', '-',
          ], { timeoutMs });
          if (b.code === 0) return ['-vsync', 'cfr'];
          return ['-fps_mode', 'cfr'];
        } catch {
          return ['-fps_mode', 'cfr'];
        }
      })(),
    );
  }
  return fpsModeCache.get(ffmpegPath);
}

/** 把 libx264 的 preset 名映射到 h264_nvenc 的 p1..p7。 */
export function resolveNvencPreset(preset) {
  if (typeof preset === 'string' && /^p[1-7]$/i.test(preset)) return preset.toLowerCase();
  return NVENC_PRESET_MAP[String(preset || '').toLowerCase()] || 'p5';
}

// ---------------------------------------------------------------------------
// 参数组装
// ---------------------------------------------------------------------------

/**
 * 组装 ffmpeg 参数。导出以便单测/排障（--print-args）。
 * @param {object} o 已完成默认值归一化的参数
 * @returns {string[]}
 */
export function buildFfmpegArgs(o) {
  const {
    audioPath,
    outPath,
    framesTotal = null,
    fps = DEFAULT_FPS,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    crf = DEFAULT_CRF,
    preset = DEFAULT_PRESET,
    encoder = 'libx264',
    audioBitrate = DEFAULT_AUDIO_BITRATE,
    audioSampleRate = DEFAULT_AUDIO_SAMPLE_RATE,
    audioChannels = DEFAULT_AUDIO_CHANNELS,
    audioPadMode = 'auto',
    tune = null,
    fpsModeFlags = ['-fps_mode', 'cfr'],
    extraVideoArgs = [],
    extraAudioArgs = [],
    extraOutputArgs = [],
  } = o;

  const args = [
    '-hide_banner', '-nostdin', '-nostats', '-loglevel', 'warning', '-y',
    // 输入 0：stdin 上的连续 raw RGBA 帧
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${width}x${height}`,
    '-r', String(fps),
    '-i', 'pipe:0',
    // 输入 1：音频文件（只取它的 0:a:0，封面流不会被选中）
    '-i', audioPath,
    // 显式映射：0 号输入的视频 + 1 号输入的第一条音频流
    '-map', '0:v',
    '-map', '1:a:0',
  ];

  // 视频编码
  if (encoder === 'nvenc') {
    args.push(
      '-c:v', 'h264_nvenc',
      '-preset', resolveNvencPreset(preset),
      '-rc', 'vbr',
      '-cq', String(crf),
      '-b:v', '0',
    );
  } else {
    args.push('-c:v', 'libx264', '-preset', String(preset), '-crf', String(crf));
    if (tune) args.push('-tune', String(tune));
  }

  args.push(
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    ...fpsModeFlags,
    '-profile:v', 'high',
    '-level', '4.2',
  );

  if (extraVideoArgs.length) args.push(...extraVideoArgs);

  // 音频编码：AAC 立体声，不低于 256 kbps
  args.push(
    '-c:a', 'aac',
    '-b:a', audioBitrate,
    '-ar', String(audioSampleRate),
    '-ac', String(audioChannels),
  );

  // 音频时长处理（default = auto）：
  //  exact = 先 atrim 到视频时长，再 apad 到同一时长；实测音轨时长与视频严格相等
  //          （90 帧片子：132300 样本 = 3.000000 s），源音频尾部不会被提前切断。
  //  shortest = apad 无限补静音 + -shortest，输出长度由视频封口；实测音轨只到
  //          132096 样本（2.995374 s），比视频短 4.6 ms，即 -shortest 会吞掉最后
  //          一点点真实音频，所以只在不知道总帧数时才用它。
  //  auto = 知道总帧数就用 exact，否则用 shortest。
  const padMode = audioPadMode === 'auto' ? (framesTotal ? 'exact' : 'shortest') : audioPadMode;

  if (padMode === 'exact') {
    if (!framesTotal) throw new Error("audioPadMode='exact' 需要已知总帧数（framesTotal）");
    const dur = (framesTotal / fps).toFixed(6);
    args.push('-af', `atrim=start=0:end=${dur},apad=whole_dur=${dur}`);
  } else {
    args.push('-af', 'apad');
  }

  if (extraAudioArgs.length) args.push(...extraAudioArgs);
  if (extraOutputArgs.length) args.push(...extraOutputArgs);

  // 注意：-shortest / -movflags 都必须放在输出文件之前，否则会被当成后续输出的选项
  if (padMode !== 'exact') args.push('-shortest');
  args.push('-movflags', '+faststart');
  args.push(outPath);

  return args;
}

// ---------------------------------------------------------------------------
// 帧迭代 / 背压
// ---------------------------------------------------------------------------

function toAsyncIterable(source) {
  if (source && typeof source[Symbol.asyncIterator] === 'function') return source;
  if (source && typeof source[Symbol.iterator] === 'function') return source;
  throw new TypeError('frames 必须是数组 / 同步或异步可迭代对象（每项为 RGBA Buffer）');
}

function toFrameBuffer(raw, expectedBytes, index) {
  if (raw instanceof ArrayBuffer) {
    if (raw.byteLength !== expectedBytes) {
      throw new Error(`第 ${index} 帧长度 ${raw.byteLength} 字节，期望 ${expectedBytes}（${expectedBytes / 4} 像素 x 4）`);
    }
    return Buffer.from(new Uint8Array(raw));
  }
  if (ArrayBuffer.isView(raw)) {
    if (raw.byteLength !== expectedBytes) {
      throw new Error(`第 ${index} 帧长度 ${raw.byteLength} 字节，期望 ${expectedBytes}（${expectedBytes / 4} 像素 x 4）`);
    }
    return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  throw new TypeError(`第 ${index} 帧类型不支持：${Object.prototype.toString.call(raw)}`);
}

function waitDrain(stream) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.off('drain', onDrain);
      stream.off('close', onClose);
      stream.off('error', onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error('ffmpeg stdin 已关闭，背压等待被中断（ffmpeg 提前退出）'));
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    stream.once('drain', onDrain);
    stream.once('close', onClose);
    stream.once('error', onError);
  });
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/**
 * 用 stdin 灌 RAW RGBA 帧 + 一条音轨，编码成一个 MP4。
 *
 * @param {object} options
 * @param {string} options.audioPath  音轨源文件（只使用其 0:a:0）
 * @param {string} options.outPath    输出 MP4 路径（目录会自动创建）
 * @param {number|Iterable|AsyncIterable} options.frames
 *        帧本身（数组 / 生成器 / 异步生成器），或帧总数（配合 frameSource 使用）
 * @param {number|Iterable|AsyncIterable} [options.frameSource] frames 为数字时的帧来源
 * @param {number} [options.fps=30]
 * @param {number} [options.width=1080]
 * @param {number} [options.height=1920]
 * @param {number} [options.crf=18]        libx264 的 CRF，或 nvenc 的 CQ
 * @param {string} [options.preset='medium']
 * @param {'libx264'|'nvenc'} [options.encoder='libx264']
 * @param {string} [options.audioBitrate='320k']
 * @param {number} [options.audioSampleRate=44100]
 * @param {number} [options.audioChannels=2]
 * @param {'auto'|'shortest'|'exact'} [options.audioPadMode='auto']
 * @param {string|null} [options.tune=null]  例如 'animation'
 * @param {number} [options.progressEvery=100]
 * @param {(p:{written:number,total:number|null,encoder:string})=>void} [options.onProgress]
 * @param {boolean} [options.logProgress=true] 是否默认往 stderr 打 `frame N/M`
 * @param {boolean} [options.copyFrames=true] 写入前是否复制帧缓冲（防调用方复用同一 Buffer）
 * @param {number|null} [options.totalFrames=null] 帧总数（仅用于进度与帧数校验）
 * @param {string} [options.ffmpegPath='ffmpeg']
 * @returns {Promise<{ok:boolean, outPath:string, stderr:string, encoder:string,
 *   encoderRequested:string, nvencAvailable:boolean|null, framesWritten:number,
 *   totalFrames:number|null, durationSeconds:number|null, elapsedMs:number,
 *   sizeBytes:number|null, args:string[]}>}
 */
export async function encodeFromRawFrames(options = {}) {
  const {
    audioPath,
    outPath,
    frames,
    frameSource = null,
    fps = DEFAULT_FPS,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    crf = DEFAULT_CRF,
    preset = DEFAULT_PRESET,
    encoder = 'libx264',
    audioBitrate = DEFAULT_AUDIO_BITRATE,
    audioSampleRate = DEFAULT_AUDIO_SAMPLE_RATE,
    audioChannels = DEFAULT_AUDIO_CHANNELS,
    audioPadMode = 'auto',
    tune = null,
    progressEvery = 100,
    onProgress = null,
    logProgress = true,
    copyFrames = true,
    totalFrames = null,
    ffmpegPath = 'ffmpeg',
    extraVideoArgs = [],
    extraAudioArgs = [],
    extraOutputArgs = [],
  } = options;

  if (!audioPath || typeof audioPath !== 'string') throw new TypeError('audioPath 必填');
  if (!outPath || typeof outPath !== 'string') throw new TypeError('outPath 必填');
  if (!isEven(width) || !isEven(height)) {
    throw new RangeError(`H.264 yuv420p 要求宽高为正偶数，收到 ${width}x${height}`);
  }
  if (!(fps > 0)) throw new RangeError(`fps 非法：${fps}`);

  const encoderRequested = String(encoder || 'libx264').toLowerCase();
  const wantsNvenc = encoderRequested === 'nvenc' || encoderRequested === 'h264_nvenc';
  let nvencInfo = null;
  let encoderUsed = wantsNvenc ? 'nvenc' : 'libx264';
  let fallbackNote = '';

  if (wantsNvenc) {
    nvencInfo = await probeNvenc({ ffmpegPath });
    if (!nvencInfo.available) {
      encoderUsed = 'libx264';
      fallbackNote = '[encode] 提示：h264_nvenc 不可用，已自动回落到 libx264。原因：' + nvencInfo.detail;
      process.stderr.write(fallbackNote + '\n');
    }
  }

  // 帧来源解析
  let source = frames;
  let total = totalFrames;
  if (typeof frames === 'number') {
    if (!frameSource) throw new TypeError('frames 为数字时必须同时提供 frameSource');
    total = frames;
    source = frameSource;
  } else if (Array.isArray(frames)) {
    total = frames.length;
  }

  const expectedBytes = width * height * 4;
  const fpsModeFlags = await detectFpsModeFlag({ ffmpegPath });

  await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });

  const args = buildFfmpegArgs({
    audioPath,
    outPath,
    framesTotal: total,
    fps,
    width,
    height,
    crf,
    preset,
    encoder: encoderUsed,
    audioBitrate,
    audioSampleRate,
    audioChannels,
    audioPadMode,
    tune,
    fpsModeFlags,
    extraVideoArgs,
    extraAudioArgs,
    extraOutputArgs,
  });

  const started = Date.now();

  const attempt = async (encoderForRun) => {
    const runArgs =
      encoderForRun === encoderUsed
        ? args
        : buildFfmpegArgs({
            audioPath,
            outPath,
            framesTotal: total,
            fps,
            width,
            height,
            crf,
            preset,
            encoder: encoderForRun,
            audioBitrate,
            audioSampleRate,
            audioChannels,
            audioPadMode,
            tune,
            fpsModeFlags,
            extraVideoArgs,
            extraAudioArgs,
            extraOutputArgs,
          });

    const child = spawn(ffmpegPath, runArgs, {
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > STDERR_TAIL_LIMIT) stderr = tail(stderr, STDERR_TAIL_LIMIT);
    });

    let exitCode = null;
    let exitSignal = null;
    const closed = new Promise((resolve, reject) => {
      child.on('close', (code, signal) => {
        exitCode = code;
        exitSignal = signal;
        resolve(code);
      });
      child.on('error', reject);
    });
    closed.catch(() => {}); // 避免未处理拒绝；真正结果由 await 得到

    let stdinBroken = null;
    child.stdin.on('error', (err) => {
      stdinBroken = err;
    });

    let written = 0;
    try {
      for await (const raw of toAsyncIterable(source)) {
        if (exitCode !== null) {
          throw new Error(`ffmpeg 在写入第 ${written} 帧后已退出（exit ${exitCode}）`);
        }
        if (stdinBroken) throw stdinBroken;

        let buf = toFrameBuffer(raw, expectedBytes, written);
        if (copyFrames) buf = Buffer.from(buf);

        const flushed = child.stdin.write(buf);
        if (!flushed) await waitDrain(child.stdin);

        written += 1;
        if (onProgress) onProgress({ written, total, encoder: encoderForRun });
        if (logProgress && progressEvery > 0 && written % progressEvery === 0) {
          process.stderr.write(`frame ${written}${total ? '/' + total : ''}\n`);
        }
      }

      if (total && written !== total) {
        throw new Error(`写入帧数不符：期望 ${total} 帧，实际 ${written} 帧`);
      }
      // 收尾进度（不足 progressEvery 整数倍时也补一行，便于确认写完）
      if (logProgress && progressEvery > 0 && total && written % progressEvery !== 0) {
        process.stderr.write(`frame ${written}/${total}\n`);
      }
      child.stdin.end();
    } catch (err) {
      try {
        child.stdin.destroy();
      } catch {
        /* ignore */
      }
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      await closed.catch(() => {});
      const reason = err && err.message ? err.message : String(err);
      // 把 ffmpeg 最后一行有效错误提到标题里，避免只看到 "write EOF" 这种间接症状
      const lastLine = stderr
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(-1)[0];
      const headline = lastLine && !reason.includes(lastLine) ? `编码失败：${reason}（ffmpeg: ${lastLine}）` : `编码失败：${reason}`;
      const error = new Error(`${headline}\n--- ffmpeg stderr 尾部 ---\n${tail(stderr.trim(), 4000)}`);
      error.stderrTail = tail(stderr.trim(), 4000);
      error.args = runArgs;
      error.framesWritten = written;
      throw error;
    }

    const code = await closed;
    if (code !== 0) {
      const error = new Error(
        `ffmpeg 退出码 ${code}${exitSignal ? `（signal ${exitSignal}）` : ''}\n--- ffmpeg stderr 尾部 ---\n${tail(stderr.trim(), 4000)}`,
      );
      error.stderrTail = tail(stderr.trim(), 4000);
      error.args = runArgs;
      error.framesWritten = written;
      throw error;
    }

    let sizeBytes = null;
    try {
      sizeBytes = (await stat(outPath)).size;
    } catch {
      /* ignore */
    }

    return {
      ok: true,
      outPath: path.resolve(outPath),
      stderr,
      encoder: encoderForRun,
      encoderRequested,
      nvencAvailable: nvencInfo ? nvencInfo.available : null,
      nvencDetail: nvencInfo ? nvencInfo.detail : null,
      framesWritten: written,
      totalFrames: total,
      durationSeconds: total ? total / fps : written / fps,
      audioPadMode: audioPadMode === 'auto' ? (total ? 'exact' : 'shortest') : audioPadMode,
      elapsedMs: Date.now() - started,
      sizeBytes,
      args: runArgs,
    };
  };

  // nvenc 编码本身失败时，若帧源可重放（数组），自动回落 libx264 重试一次
  if (encoderUsed === 'nvenc') {
    try {
      return await attempt('nvenc');
    } catch (err) {
      if (!Array.isArray(source)) throw err;
      process.stderr.write('[encode] 提示：nvenc 编码失败，回落 libx264 重试一次。\n');
      process.stderr.write(tail(String(err.stderrTail || ''), 1200) + '\n');
      const retried = await attempt('libx264');
      retried.fallbackNote = 'nvenc 编码失败，已回落 libx264';
      return retried;
    }
  }

  return await attempt(encoderUsed);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const CLI_HELP = `encode.mjs — RAW RGBA 帧 + 音轨 -> MP4

用法：
  node tools/encode.mjs --audio <音轨文件> --out <输出.mp4> --raw <raw RGBA 文件> [选项]
  node tools/encode.mjs --probe-nvenc
  node tools/encode.mjs --print-args --audio ... --out ...

选项：
  --raw <file>     连续 RAW RGBA 帧文件（按 --width * --height * 4 切帧）
  --frames <n>     只取前 n 帧（默认按文件大小自动计算）
  --fps <n>        默认 30
  --width <n>      默认 1080
  --height <n>     默认 1920
  --crf <n>        默认 18（nvenc 时为 -cq）
  --preset <name>  默认 medium（nvenc 自动映射到 p1..p7）
  --encoder <name> libx264（默认）或 nvenc
  --tune <name>    可选，例如 animation
  --pad <mode>     auto（默认，知帧数时用 exact）/ exact / shortest
  --no-progress    不打印 frame N/M
`;

async function cliMain(argv) {
  const a = parseArgs(argv);

  if (a.help) {
    process.stdout.write(CLI_HELP);
    return 0;
  }

  if (a['probe-nvenc']) {
    const info = await probeNvenc({ ffmpegPath: a.ffmpeg || 'ffmpeg' });
    process.stdout.write(
      JSON.stringify({ encoder: 'h264_nvenc', available: info.available, detail: info.detail }, null, 2) + '\n',
    );
    return info.available ? 0 : 2;
  }

  const audioPath = a.audio;
  const outPath = a.out;
  if (!audioPath || !outPath) {
    process.stderr.write(CLI_HELP);
    return 1;
  }

  const width = Number(a.width || DEFAULT_WIDTH);
  const height = Number(a.height || DEFAULT_HEIGHT);
  const fps = Number(a.fps || DEFAULT_FPS);
  const frameBytes = width * height * 4;

  if (a['print-args']) {
    const fpsModeFlags = await detectFpsModeFlag({ ffmpegPath: a.ffmpeg || 'ffmpeg' });
    const args = buildFfmpegArgs({
      audioPath,
      outPath,
      framesTotal: a.frames ? Number(a.frames) : null,
      fps,
      width,
      height,
      crf: Number(a.crf || DEFAULT_CRF),
      preset: a.preset || DEFAULT_PRESET,
      encoder: a.encoder === 'nvenc' ? 'nvenc' : 'libx264',
      tune: a.tune || null,
      audioPadMode: a.pad === 'exact' ? 'exact' : a.pad === 'shortest' ? 'shortest' : 'auto',
      fpsModeFlags,
    });
    process.stdout.write(JSON.stringify(args, null, 2) + '\n');
    return 0;
  }

  const rawPath = a.raw;
  if (!rawPath) {
    process.stderr.write('缺少 --raw <raw RGBA 文件>\n\n' + CLI_HELP);
    return 1;
  }

  const info = await stat(rawPath);
  const availableFrames = Math.floor(info.size / frameBytes);
  if (availableFrames < 1) {
    process.stderr.write(`raw 文件太小：${info.size} 字节，不足一帧 ${frameBytes} 字节\n`);
    return 1;
  }
  const total = a.frames ? Math.min(Number(a.frames), availableFrames) : availableFrames;

  const fh = await open(rawPath, 'r');
  const readFrames = async function* readFramesGen() {
    const reusable = Buffer.allocUnsafe(frameBytes);
    try {
      for (let i = 0; i < total; i += 1) {
        const { bytesRead } = await fh.read(reusable, 0, frameBytes, i * frameBytes);
        if (bytesRead !== frameBytes) throw new Error(`读取第 ${i} 帧不完整：${bytesRead}/${frameBytes} 字节`);
        yield Buffer.from(reusable);
      }
    } finally {
      await fh.close();
    }
  };

  const result = await encodeFromRawFrames({
    audioPath,
    outPath,
    frames: total,
    frameSource: readFrames(),
    fps,
    width,
    height,
    crf: Number(a.crf || DEFAULT_CRF),
    preset: a.preset || DEFAULT_PRESET,
    encoder: a.encoder === 'nvenc' ? 'nvenc' : 'libx264',
    tune: a.tune || null,
    audioPadMode: a.pad === 'exact' ? 'exact' : a.pad === 'shortest' ? 'shortest' : 'auto',
    logProgress: !a['no-progress'],
    ffmpegPath: a.ffmpeg || 'ffmpeg',
  });

  process.stdout.write(
    JSON.stringify(
      {
        ok: result.ok,
        outPath: result.outPath,
        encoder: result.encoder,
        encoderRequested: result.encoderRequested,
        nvencAvailable: result.nvencAvailable,
        framesWritten: result.framesWritten,
        durationSeconds: Number(result.durationSeconds.toFixed(6)),
        elapsedMs: result.elapsedMs,
        sizeBytes: result.sizeBytes,
      },
      null,
      2,
    ) + '\n',
  );
  return 0;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  cliMain(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
      process.exitCode = 1;
    });
}
