// Render CLI. All output goes through renderFrame, a pure function of (frame, config).
//   npm run stills        -> out/stills/*.png
//   npm run render        -> config.out
//   node src/main.mjs --range 0-48 --out out/clips/check.mp4
//   node src/main.mjs --config examples/full-length/project.json --render
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { W, H, renderFrame, TOTAL_FRAMES } from './render.mjs';
import { FPS, DURATION } from './timeline/spec.mjs';
import { CONFIG, cliArg, resolve, ROOT } from './core/config.mjs';
import { VERTICAL } from './core/layout.mjs';
import { encodeFromRawFrames } from '../tools/encode.mjs';

const argv = process.argv.slice(2);
const AUDIO = resolve(CONFIG.audio);

function ensureAudio() {
  if (fs.existsSync(AUDIO)) return AUDIO;
  const silent = resolve('out/silent.wav');
  fs.mkdirSync(path.dirname(silent), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(DURATION), '-c:a', 'pcm_s16le', silent]);
  console.warn(`[audio] ${CONFIG.audio} missing — using a silent ${DURATION.toFixed(3)}s track. Run "npm run demo:audio" for a real click-track demo.`);
  return silent;
}

/** Non-destructive tail fade: keeps the source file untouched. */
function audioForEncode() {
  const src = ensureAudio();
  const tail = Number(CONFIG.audioFade?.tail ?? 0);
  if (!(tail > 0)) return src;
  const start = Math.max(0, DURATION - tail);
  const out = resolve(`out/_audio-faded-${start.toFixed(3)}.wav`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const expr = `if(lt(t,${start.toFixed(3)}),1,0.5+0.5*cos(PI*(t-${start.toFixed(3)})/${tail.toFixed(3)}))`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-af', `volume='${expr}':eval=frame`,
    '-c:a', 'pcm_s16le', '-ar', '44100', '-ac', '2', '-t', String(DURATION), out]);
  return out;
}

function parseFrames(str) {
  const out = [];
  for (const part of String(str).split(',')) {
    const s = part.trim();
    if (!s) continue;
    if (s.startsWith('f')) out.push(parseInt(s.slice(1), 10));
    else if (s.includes(':')) { const [m, sec] = s.split(':').map(Number); out.push(Math.round((m * 60 + sec) * FPS)); }
    else out.push(Math.round(parseFloat(s) * FPS));
  }
  return out;
}

function frameStream(frames, { log = true, label = 'frame', subtitles = true } = {}) {
  const canvas = createCanvas(W, H), g = canvas.getContext('2d');
  const t0 = Date.now(); let done = 0;
  const source = async function* () {
    for (const f of frames) {
      renderFrame(g, canvas, f, { subtitles });
      const img = g.getImageData(0, 0, W, H).data;
      done++;
      if (log && done % 120 === 0) {
        const el = (Date.now() - t0) / 1000, rate = done / Math.max(0.001, el);
        process.stderr.write(`${label} ${done}/${frames.length}  ${rate.toFixed(1)} fps  eta ${((frames.length - done) / Math.max(0.001, rate)).toFixed(0)}s\n`);
      }
      yield Buffer.from(img.buffer, img.byteOffset, img.byteLength);
    }
  };
  return { source: source(), canvas, g };
}

async function encodeClip({ frames, outPath, crf = 20, preset = 'fast', mute = false }) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const startT = frames[0] / FPS;
  const args = ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', 'pipe:0',
    ...(mute ? [] : ['-ss', startT.toFixed(6), '-i', audioForEncode()]),
    '-map', '0:v:0', ...(mute ? [] : ['-map', '1:a:0']),
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-fps_mode', 'cfr',
    ...(mute ? [] : ['-c:a', 'aac', '-b:a', '320k', '-t', (frames.length / FPS).toFixed(6)]),
    '-movflags', '+faststart', outPath];
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = ''; ff.stderr.on('data', (d) => { err += d.toString(); });
  const done = once(ff, 'close');
  const { source } = frameStream(frames, { label: 'clip' });
  for await (const buf of source) if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
  ff.stdin.end();
  const [code] = await done;
  if (code !== 0) throw new Error('ffmpeg failed: ' + err);
}

function defaultOut() {
  const p = resolve(CONFIG.out);
  if (!VERTICAL) return p;
  const ext = path.extname(p);
  return p.slice(0, -ext.length) + '-9x16' + ext;
}

async function main() {
  const stills = cliArg('stills');
  if (stills) {
    const dir = resolve(VERTICAL ? 'out/stills-9x16' : 'out/stills');
    fs.mkdirSync(dir, { recursive: true });
    const canvas = createCanvas(W, H), g = canvas.getContext('2d');
    for (const f of parseFrames(stills)) {
      renderFrame(g, canvas, f);
      const p = path.join(dir, `f${String(f).padStart(5, '0')}.png`);
      fs.writeFileSync(p, canvas.toBuffer('image/png'));
      console.log(`f${f} (${(f / FPS).toFixed(3)}s) -> ${p}`);
    }
    return;
  }

  const range = cliArg('range');
  if (range) {
    const [a, b] = String(range).split('-').map((v) => parseInt(v, 10));
    const frames = []; for (let f = a; f < b; f++) frames.push(f);
    const outPath = resolve(String(cliArg('out', `out/clips/clip_${a}-${b}.mp4`)));
    await encodeClip({ frames, outPath, crf: Number(cliArg('crf', 20)), preset: String(cliArg('preset', 'fast')), mute: argv.includes('--mute') });
    console.log(`wrote ${outPath} (${frames.length} frames)`);
    return;
  }

  const frames = []; for (let f = 0; f < TOTAL_FRAMES; f++) frames.push(f);
  const outPath = resolve(String(cliArg('out', defaultOut())));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const { source } = frameStream(frames, { label: 'film', subtitles: true });
  const t0 = Date.now();
  await encodeFromRawFrames({
    audioPath: audioForEncode(), outPath, frameSource: source,
    frames: TOTAL_FRAMES, totalFrames: TOTAL_FRAMES, fps: FPS,
    width: W, height: H,
    crf: Number(cliArg('crf', 18)), preset: String(cliArg('preset', 'medium')),
    encoder: String(cliArg('encoder', 'libx264')),
    audioBitrate: '320k', audioPadMode: 'exact', logProgress: true,
  });
  console.log(`wrote ${outPath} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}

main().catch((e) => { console.error(e); process.exit(1); });
