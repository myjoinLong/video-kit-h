// Delivery checks for a silent, voiceover-to-be-recorded episode.
//   node tools/verify-delivery.mjs --episode episodes/<slug>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); const v = i >= 0 ? process.argv[i + 1] : undefined; return v && !v.startsWith('--') ? v : d; };
const EP_REL = String(arg('episode', ''));
if (!EP_REL) { console.error('Usage: node tools/verify-delivery.mjs --episode episodes/<slug>'); process.exit(1); }
const EP = path.isAbsolute(EP_REL) ? EP_REL : path.resolve(ROOT, EP_REL);
const ep = JSON.parse(fs.readFileSync(path.join(EP, 'episode.json'), 'utf8'));
const D = Number(ep.duration);
const resolve = (p) => path.isAbsolute(p) ? p : path.resolve(ROOT, p);
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '  ·  ' + detail : ''}`); };

const p16 = JSON.parse(fs.readFileSync(path.join(EP, 'project.json'), 'utf8'));
const p9 = JSON.parse(fs.readFileSync(path.join(EP, 'project-9x16.json'), 'utf8'));
const films = [
  { layout: '16x9', file: resolve(p16.out), W: 1920, H: 1080 },
  { layout: '9x16', file: (() => { const p = resolve(p9.out), e = path.extname(p); return p.slice(0, -e.length) + '-9x16' + e; })(), W: 1080, H: 1920 },
];
for (const f of films) {
  if (!fs.existsSync(f.file)) { check(`${f.layout} 成片存在`, false, f.file); continue; }
  check(`${f.layout} 成片存在`, true, path.basename(f.file));
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f.file], { encoding: 'utf8' }));
  const v = probe.streams.find((s) => s.codec_type === 'video') || {};
  const a = probe.streams.find((s) => s.codec_type === 'audio') || {};
  check(`${f.layout} 时长 ${D}.000 ±0.100 s`, Math.abs(Number(probe.format.duration) - D) <= 0.1, `${probe.format.duration} s`);
  check(`${f.layout} ${D * ep.fps} 帧 / ${f.W}×${f.H} / ${ep.fps} fps`,
    Number(v.nb_frames) === D * ep.fps && v.width === f.W && v.height === f.H,
    `${v.nb_frames} / ${v.width}×${v.height} / ${v.r_frame_rate}`);
  check(`${f.layout} 音轨 AAC 44.1 kHz 立体声`, a.codec_name === 'aac' && Number(a.sample_rate) === 44100 && a.channels === 2, `${a.codec_name} ${a.sample_rate}Hz ch${a.channels}`);
  check(`${f.layout} 音轨等长且从 0 开始`, Math.abs(Number(a.duration ?? probe.format.duration) - D) <= 0.15 && Math.abs(Number(a.start_time || 0)) < 0.02, `${a.duration} s / start ${a.start_time}`);
  // volumedetect reports on stderr; AAC digital silence measures about -91 dB
  const vd = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'info', '-i', f.file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const log = String(vd.stderr || '');
  const mean = /mean_volume:\s*([^\s]+)\s*dB/.exec(log)?.[1] ?? 'n/a';
  const silent = mean === '-inf' || (Number.isFinite(Number(mean)) && Number(mean) <= -70);
  check(`${f.layout} 音轨为静音占位（可替换旁白）`, silent, `mean=${mean} dB`);
  // verify report, when present
  const rp = path.join(EP, 'out', `verify-report-${f.layout}.json`);
  if (fs.existsSync(rp)) {
    const r = JSON.parse(fs.readFileSync(rp, 'utf8'));
    check(`${f.layout} 26 项通用验收全过`, r.passed === r.total && r.total >= 20, `${r.passed}/${r.total}`);
  } else check(`${f.layout} 通用验收报告存在`, false, 'run: node tools/verify.mjs --config ... --report ...');
}

// narration pack
const script = fs.readFileSync(path.join(EP, 'narration-script.md'), 'utf8');
const cues = JSON.parse(fs.readFileSync(path.join(EP, 'narration-cues.json'), 'utf8')).chapters;
const srt = fs.readFileSync(path.join(EP, 'narration.srt'), 'utf8');
check('旁白稿 / cues / SRT 三件套齐全', script.includes('# 旁白稿') && cues.length === ep.chapters.length && srt.includes('-->'), `${cues.length} 段`);
check('旁白时间码连续覆盖全片',
  Math.abs(cues[0].in) < 0.001 && Math.abs(cues[cues.length - 1].out - D) < 0.001 && cues.every((c, i) => i === 0 || Math.abs(c.in - cues[i - 1].out) < 0.001),
  `${cues[0].in} → ${cues[cues.length - 1].out}`);
const paces = cues.map((c) => Math.round(c.chars / (c.duration / 60)));
check('每段语速在 120–300 字/分', paces.every((p) => p >= 120 && p <= 300), paces.join(' / '));
check('稿子标注了静音轨替换方式', script.includes('静音') && script.includes('时间码'), '');

const failed = results.filter((r) => !r.ok);
const out = path.join(EP, 'out', 'verify-report-delivery.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ episode: ep.id, passed: results.length - failed.length, total: results.length, results, films: films.map((f) => f.file) }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed  ->  ${out}`);
if (failed.length) process.exit(1);
