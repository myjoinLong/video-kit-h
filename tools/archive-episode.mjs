// Archive one episode: contact sheets, hashes, ffprobe facts, verification
// results, commands and honest caveats -> manifest.json, then refresh INDEX.md.
//   node tools/archive-episode.mjs --episode episodes/<slug>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); const v = i >= 0 ? process.argv[i + 1] : undefined; return v && !v.startsWith('--') ? v : d; };
const EP_REL = String(arg('episode', ''));
if (!EP_REL) { console.error('Usage: node tools/archive-episode.mjs --episode episodes/<slug>'); process.exit(1); }
const EP = path.isAbsolute(EP_REL) ? EP_REL : path.resolve(ROOT, EP_REL);
const REL = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const resolve = (p) => path.isAbsolute(p) ? p : path.resolve(ROOT, p);
const ep = JSON.parse(fs.readFileSync(path.join(EP, 'episode.json'), 'utf8'));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const probe = (p) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', p], { encoding: 'utf8' }));

const p16 = JSON.parse(fs.readFileSync(path.join(EP, 'project.json'), 'utf8'));
const p9 = JSON.parse(fs.readFileSync(path.join(EP, 'project-9x16.json'), 'utf8'));
const p9raw = resolve(p9.out), e9 = path.extname(p9raw);
const films = [
  { layout: '16x9', cfg: p16, file: resolve(p16.out), W: 1920, H: 1080, cw: 480, ch: 270 },
  { layout: '9x16', cfg: p9, file: p9raw.slice(0, -e9.length) + '-9x16' + e9, W: 1080, H: 1920, cw: 180, ch: 320 },
];

// ---- contact sheets: one frame per shot, decoded from the FINAL mp4 ----------
async function contactSheet(f) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const mids = ep.shots.map((s) => +(s.a + (s.b - s.a) * 0.55).toFixed(3));
  const cols = 5, rows = Math.ceil(mids.length / cols);
  const c = createCanvas(f.cw * cols, f.ch * rows), g = c.getContext('2d');
  g.fillStyle = '#F4EAD6'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < mids.length; i++) {
    const tmp = path.join(EP, 'out', `_contact_${f.layout}_${i}.jpg`);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(mids[i]), '-i', f.file, '-frames:v', '1',
      '-vf', `scale=${f.cw}:${f.ch}`, '-q:v', '3', tmp]);
    const img = await loadImage(tmp);
    g.drawImage(img, (i % cols) * f.cw, Math.floor(i / cols) * f.ch, f.cw, f.ch);
    g.fillStyle = 'rgba(46,42,51,0.75)';
    g.fillRect((i % cols) * f.cw + 5, Math.floor(i / cols) * f.ch + 5, 90, 22);
    g.fillStyle = '#FBF3E2'; g.font = '14px sans-serif';
    g.fillText(`${mids[i]}s S${i + 1}`, (i % cols) * f.cw + 10, Math.floor(i / cols) * f.ch + 21);
    fs.unlinkSync(tmp);
  }
  const dest = path.join(EP, 'out', `contact-${f.layout}.jpg`);
  fs.writeFileSync(dest, c.toBuffer('image/jpeg'));
  return dest;
}

const layoutRecords = [];
for (const f of films) {
  if (!fs.existsSync(f.file)) { console.warn(`[archive] missing film ${f.file} — layout ${f.layout} recorded as pending`); }
  const p = fs.existsSync(f.file) ? probe(f.file) : null;
  const v = p?.streams?.find((s) => s.codec_type === 'video') || {};
  const a = p?.streams?.find((s) => s.codec_type === 'audio') || {};
  const rp = path.join(EP, 'out', `verify-report-${f.layout}.json`);
  const vr = fs.existsSync(rp) ? JSON.parse(fs.readFileSync(rp, 'utf8')) : null;
  layoutRecords.push({
    layout: f.layout,
    film: fs.existsSync(f.file) ? REL(f.file) : null,
    sizeBytes: fs.existsSync(f.file) ? fs.statSync(f.file).size : null,
    sha256: fs.existsSync(f.file) ? sha(f.file) : null,
    ffprobe: p ? {
      duration: Number(p.format.duration), size: Number(p.format.size),
      codec: v.codec_name, width: v.width, height: v.height,
      frameRate: v.r_frame_rate, frames: Number(v.nb_frames),
      audioCodec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels,
    } : null,
    contactSheet: fs.existsSync(f.file) ? REL(await contactSheet(f)) : null,
    verification: vr ? { passed: vr.passed, total: vr.total, report: REL(rp) } : null,
    config: REL(path.join(EP, f.layout === '9x16' ? 'project-9x16.json' : 'project.json')),
    generatedDir: f.cfg.generated.spec.split('/').slice(0, -1).join('/'),
  });
}

const genFiles = ['spec.json', 'subtitle-cards.json', 'beat-grid.json', 'prepare-report.json']
  .flatMap((n) => ['generated', 'generated-9x16'].map((d) => path.join(EP, d, n)))
  .filter((p) => fs.existsSync(p))
  .map((p) => ({ file: REL(p), sha256: sha(p) }));
const cues = JSON.parse(fs.readFileSync(path.join(EP, 'narration-cues.json'), 'utf8')).chapters;
let gitCommit = null;
try { gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* no git repo yet */ }

const manifest = {
  schema: 1,
  episode: ep.id, date: ep.date, title: ep.title, topic: ep.topic, tags: ep.tags, status: ep.status || 'draft',
  archivedAt: new Date().toISOString(),
  duration: ep.duration, fps: ep.fps, bpm: ep.bpm, offset: ep.offset,
  chapters: ep.chapters.length, shots: ep.shots.length,
  narration: {
    mode: ep.narration?.mode || 'post-record', voice: ep.narration?.voice || '后期补录',
    totalChars: cues.reduce((n, c) => n + c.chars, 0),
    paceByChapter: cues.map((c) => Math.round(c.chars / (c.duration / 60))),
    files: ['narration-script.md', 'narration-cues.json', 'narration.srt'].map((n) => REL(path.join(EP, n))),
  },
  layouts: layoutRecords,
  generatedFiles: genFiles,
  commands: [
    `node tools/build-episode.mjs --episode ${REL(EP)}`,
    `node src/main.mjs --config ${REL(EP)}/project.json --render`,
    `node src/main.mjs --config ${REL(EP)}/project-9x16.json --render`,
    `node tools/verify.mjs --config ${REL(EP)}/project.json --file ${REL(resolve(p16.out))} --report ${REL(EP)}/out/verify-report-16x9.json`,
    `node tools/verify.mjs --config ${REL(EP)}/project-9x16.json --file ${REL(films[1].file)} --report ${REL(EP)}/out/verify-report-9x16.json`,
    `node tools/verify-delivery.mjs --episode ${REL(EP)}`,
    `node tools/archive-episode.mjs --episode ${REL(EP)}`,
  ],
  notes: ep.notes || {},
  gitCommit,
};
fs.writeFileSync(path.join(EP, 'manifest.json'), JSON.stringify(manifest, null, 2));

// ---- INDEX.md ---------------------------------------------------------------
function refreshIndex() {
  const root = path.join(ROOT, 'episodes');
  const rows = [];
  for (const name of fs.readdirSync(root).sort()) {
    const mf = path.join(root, name, 'manifest.json');
    if (!fs.existsSync(mf)) continue;
    const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const ok = m.layouts.every((l) => l.verification && l.verification.passed === l.verification.total);
    const filmsTxt = m.layouts.map((l) => l.film ? `${l.layout} ${l.ffprobe?.width}×${l.ffprobe?.height}` : `${l.layout} 待渲染`).join(' / ');
    rows.push(`| ${m.date} | [${m.episode}](episodes/${m.episode}/README.md) | ${m.title} | ${m.duration}s | ${m.chapters} 段 / ${m.shots} 镜 | ${filmsTxt} | ${ok ? '✅ 全过' : '⚠️ 待验'} | [manifest](episodes/${m.episode}/manifest.json) |`);
  }
  const md = [
    '# 期次索引 · video-kit-h',
    '',
    '> 每做完一支片子，跑 `node tools/archive-episode.mjs --episode episodes/<slug>` 自动追加本表并写 `manifest.json`。',
    '> 成片文件不进 Git（体积大、且可能含授权音频），但 manifest 里留了 SHA-256 与 ffprobe 事实，本地 `episodes/<slug>/out/` 保留原件。',
    '',
    '| 日期 | 期次 | 标题 | 时长 | 结构 | 画幅 | 验收 | 留痕 |',
    '|---|---|---|---|---|---|---|---|',
    ...(rows.length ? rows : ['| — | — | 暂无归档期次 | — | — | — | — | — |']),
    '',
    `共 ${rows.length} 期。`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'INDEX.md'), md);
}
refreshIndex();

console.log(`Archived ${ep.id}
  ${layoutRecords.filter((l) => l.film).length}/2 films hashed, ${genFiles.length} generated files hashed
  contact sheets: ${layoutRecords.map((l) => l.contactSheet || 'pending').join(', ')}
  manifest: ${REL(path.join(EP, 'manifest.json'))}
  INDEX.md refreshed`);
