// Machine-checkable acceptance criteria, parameterised by the generated spec.
// Usage: npm run verify  |  node tools/verify.mjs --file out/demo.mp4
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FPS, DURATION, TOTAL_FRAMES, TRANSITIONS, COLOR_ARC, N_BEATS, N_SUBS, N_BARS, N_PHRASES, LYRICS, SHOTS } from '../src/timeline/spec.mjs';
import { W, H } from '../src/core/camera.mjs';
import { VERTICAL, LAYOUT_NAME } from '../src/core/layout.mjs';
import { CONFIG, cliArg, resolve, readGenerated } from '../src/core/config.mjs';

const argv = process.argv.slice(2);
function defaultFile() {
  const p = resolve(CONFIG.out), ext = path.extname(p);
  return VERTICAL ? p.slice(0, -ext.length) + '-9x16' + ext : p;
}
const FILE = resolve(String(cliArg('file', defaultFile())));
const AUDIO = resolve(cliArg('audio', CONFIG.audio));
const grid = readGenerated('grid');
const report = readGenerated('report');
const cards = readGenerated('cards').cards;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
if (!fs.existsSync(FILE)) { console.error(`Output not found: ${FILE}\nRun "npm run render" first.`); process.exit(1); }

const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', FILE], { encoding: 'utf8' }));
const v = probe.streams.find((s) => s.codec_type === 'video') || {};
const a = probe.streams.find((s) => s.codec_type === 'audio') || {};
const dur = Number(probe.format.duration);
check('1 duration within ±0.100 s', Math.abs(dur - DURATION) <= 0.1, `${dur.toFixed(6)} s (target ${DURATION})`);
check('1 frame count', Number(v.nb_frames) === TOTAL_FRAMES, `nb_frames=${v.nb_frames} / ${TOTAL_FRAMES}`);
check(`1 frame size ${W}×${H} (${LAYOUT_NAME})`, v.width === W && v.height === H, `${v.width}×${v.height}`);
check('1 frame rate', v.r_frame_rate === `${FPS}/1` || v.avg_frame_rate === `${FPS}/1`, `r=${v.r_frame_rate}`);
check('2 AAC 44.1 kHz stereo', a.codec_name === 'aac' && Number(a.sample_rate) === 44100 && a.channels === 2, `${a.codec_name} ${a.sample_rate}Hz ch${a.channels}`);
check('2 audio not longer than the film', Number(a.duration ?? dur) <= DURATION + 0.2, `audio=${a.duration}`);
check('2 audio starts at 0', Math.abs(Number(a.start_time || 0)) < 0.02, `start=${a.start_time}`);

check('3 beat grid counts', grid.beats.length === N_BEATS && grid.subs.length === N_SUBS && grid.bars.length === N_BARS && grid.phrases.length === N_PHRASES,
  `${grid.beats.length}/${grid.subs.length}/${grid.bars.length}/${grid.phrases.length}`);
check('3 lyric anchors', grid.lyricAnchors.length === LYRICS.length && LYRICS.length > 0, `${LYRICS.length}`);
check('3 shot count', grid.shotBounds.length === SHOTS.length, `${SHOTS.length}`);
check('3 one camera move per shot', SHOTS.every((s) => ['drift', 'push', 'pull', 'panR', 'panL', 'follow'].includes(s.cam)), SHOTS.map((s) => s.cam).join(','));
check('3 zoom ≤ 1.14', SHOTS.every((s) => s.z0 <= 1.14 && s.z1 <= 1.14), 'max 1.14');

const seq = TRANSITIONS.map((x) => x.type);
let run = 1, maxRun = 1;
for (let i = 1; i < seq.length; i++) { run = seq[i] === seq[i - 1] ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
check('4 transitions count', TRANSITIONS.length === SHOTS.length + 1, `${TRANSITIONS.length} for ${SHOTS.length} shots + 2 edges`);
check('4 no hard cuts', !seq.includes('hardCut'), 'none');
check('4 no 3 identical in a row', maxRun <= 2, `maxRun=${maxRun}`);
check('5 colour arc', COLOR_ARC.length === SHOTS.length, `${COLOR_ARC.length} segments`);

check('5 subtitle cards ≥ lines×2', report.cards >= Math.max(8, LYRICS.length * 2), `${report.cards}`);
check('5 form / enter / exit variety', report.forms >= 10 && report.enters >= 10 && report.exits >= 10, `${report.forms}/${report.enters}/${report.exits}`);
check('5 zone variety ≥ 8', report.zones >= 8, `${report.zones}`);
const minTex = Math.min(4, COLOR_ARC.length);
check(`5 texture variety ≥ ${minTex}`, report.textures.length >= minTex, report.textures.join(','));
check('5 max 3 cards on screen', report.maxOnScreen <= 3, `${report.maxOnScreen}`);
check('5 Z5 used exactly once', report.z5Uses === 1, `${report.z5Uses}`);
check('5 prepare assertions', report.problems.length === 0, report.problems.join('; ') || 'clean');
check('5 no enter==exit card', cards.every((c) => c.enter !== c.exit), `${cards.filter((c) => c.enter === c.exit).length}`);

// pixel checks: hand-drawn ink is redrawn on twos, so compare frame 1 vs frame 4
function framesAt(t, n = 4) {
  const b = execFileSync('ffmpeg', ['-v', 'error', '-ss', t.toFixed(3), '-i', FILE, '-frames:v', String(n), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 96 * 1024 * 1024 });
  const size = W * H * 3;
  return Array.from({ length: n }, (_, i) => b.subarray(i * size, (i + 1) * size));
}
const SAMPLES = [0.08, 0.30, 0.55, 0.78, 0.94].map((q) => Math.min(DURATION - 0.20, q * DURATION));
let black = 0, white = 0, minDiff = Infinity, diffSum = 0, pairs = 0;
for (const t of SAMPLES) {
  const ff = framesAt(t, 4), b = ff[0], b2 = ff[3];
  if (b.length < W * H * 3 || b2.length < W * H * 3) continue;
  for (let i = 0; i < b.length; i += 3) {
    const r = b[i], g = b[i + 1], bl = b[i + 2];
    if (r < 3 && g < 3 && bl < 3) black++;
    if (r > 252 && g > 252 && bl > 252) white++;
  }
  let d = 0, n = 0;
  for (let i = 0; i < b.length && i < b2.length; i += 111 * 3) {
    d += Math.abs(b[i] - b2[i]) + Math.abs(b[i + 1] - b2[i + 1]) + Math.abs(b[i + 2] - b2[i + 2]); n += 3;
  }
  const mean = d / Math.max(1, n);
  minDiff = Math.min(minDiff, mean); diffSum += mean; pairs++;
}
check('6 no pure black / pure white pixels', black === 0 && white === 0, `black=${black} white=${white}`);
check('6 every sampled 3-frame span changes', minDiff > 0.05, `min ${minDiff.toFixed(3)} / mean ${(diffSum / Math.max(1, pairs)).toFixed(3)}`);

const failed = results.filter((r) => !r.ok);
const out = resolve(String(cliArg('report', `out/verify-report-${LAYOUT_NAME}.json`)));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ file: FILE, layout: LAYOUT_NAME, passed: results.length - failed.length, total: results.length, results,
  manual: ['Artistic coherence / lyric-to-picture match — must be reviewed by eye',
           'Ink boiling at 12 Hz and 1–3 px jitter — must be reviewed frame by frame',
           'Licensing of the audio you supplied — see docs/06-版权与授权.md'] }, null, 2));
for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? '  ·  ' + r.detail : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed  ->  ${out}`);
if (failed.length) process.exit(1);
