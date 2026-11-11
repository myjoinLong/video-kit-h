// Scaffold a new talking-head episode. Everything after this is data editing.
//   node tools/new-episode.mjs --slug 2026-12-01-my-topic --title "我的新口播" --duration 210 --chapters 6 --shots 8
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); const v = i >= 0 ? process.argv[i + 1] : undefined; return v && !v.startsWith('--') ? v : d; };
const slug = String(arg('slug', ''));
if (!slug) { console.error('Usage: node tools/new-episode.mjs --slug YYYY-MM-DD-slug --title "..." [--duration 210] [--chapters 6] [--shots 8]'); process.exit(1); }
const EP = path.resolve(ROOT, 'episodes', slug);
if (fs.existsSync(EP)) { console.error('Episode folder already exists: ' + EP); process.exit(1); }
const title = String(arg('title', slug));
const duration = Number(arg('duration', 210));
const nCh = Number(arg('chapters', 6));
const nSh = Number(arg('shots', 8));
const bpm = Number(arg('bpm', 90));
const date = slug.slice(0, 10);

const POOL = ['coldOpen', 'waveform', 'beatGrid', 'specSheet', 'boundaryTable', 'pipeline', 'subtitleGallery', 'bugCompare', 'checklist', 'outro'];
const CAMS = ['drift', 'push', 'pull', 'panR', 'panL', 'follow'];
const TRANS = ['matchCut', 'brushWipe35', 'irisCircle', 'actionCut', 'pageTear', 'brushWipeH', 'whipPan', 'irisPlane'];
const TEXS = ['dry', 'mid', 'wet', 'bright'];
const r3 = (v) => +v.toFixed(3);
const bounds = (n) => Array.from({ length: n + 1 }, (_, i) => r3(duration * i / n));

const cb = bounds(nCh), sb = bounds(nSh);
const chapters = Array.from({ length: nCh }, (_, i) => ({
  id: i + 1, in: cb[i], out: cb[i + 1],
  title: `第 ${i + 1} 段 · 待填标题`,
  shots: Array.from({ length: nSh }, (_, j) => j + 1).filter((j) => sb[j - 1] >= cb[i] && sb[j - 1] < cb[i + 1]),
  screen: '待填：这一段画面上观众看到什么',
  narration: '待填：这一段要念的口播正文。中文约 220 字每分钟，按段落时长控制字数。',
}));
const shots = Array.from({ length: nSh }, (_, i) => {
  const warm = r3(0.08 + 0.7 * (i / Math.max(1, nSh - 1)));
  return {
    a: sb[i], b: sb[i + 1],
    scene: ['intro', 'audio', 'spec', 'boundary', 'pipeline', 'subtitle', 'verify', 'outro'][i % 8],
    cam: CAMS[i % CAMS.length], z0: 1, z1: 1, mood: 'curious', emote: null,
    elements: [POOL[i % POOL.length]],
    points: ['要点一：待填', '要点二：待填', '要点三：待填', '要点四：待填'],
    arc: { warm, cool: r3(0.7 - 0.6 * (i / Math.max(1, nSh - 1))), bright: r3(0.92 + 0.22 * i / Math.max(1, nSh - 1)), name: `seg${i + 1}`, texture: TEXS[i % 4] },
    transition: TRANS[i % TRANS.length],
  };
});
// evenly spaced on-screen anchors; replace with real key phrases before rendering
const anchors = Array.from({ length: Math.max(8, Math.round(duration / 8)) }, (_, i) => {
  const t = r3(2 + i * (duration - 6) / Math.max(1, Math.round(duration / 8) - 1));
  return `[${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(3).padStart(6, '0')}]待填画面要点 ${i + 1}`;
}).join('\n') + '\n';

const ep = {
  schema: 1, id: slug, date, title,
  topic: '待填：内容类型（产品讲解 / 方法论 / 复盘 / 教程）',
  tags: ['待填'], status: 'draft',
  duration, fps: 24, bpm, offset: 0.400, softEndingAt: r3(duration - 1.6),
  keywords: ['待填'], closingLine: '待填：最后一句收尾',
  narration: { mode: 'post-record', voice: '后期补录', silentPlaceholder: true, paceWordsPerMinute: 220, note: '成片自带静音占位轨，按章节时间码对齐配音。' },
  style: { palette: 'warm-handdrawn', boilHz: 12, softEnding: true, interactions: true, portraitInfographics: true, heroU: 'auto' },
  layouts: {
    '16x9': {
      heroPlacement: { x: 250, y: 880, u: 22 },
      cardBand: { xMin: 400, xMax: 1560, y: 905, jitterY: 26 },
      out: `episodes/${slug}/out/${slug}-16x9.mp4`,
      generatedDir: `episodes/${slug}/generated`,
    },
    '9x16': {
      heroPlacement: { x: 514, y: 1010, u: 22 },
      cardBand: { xMin: 110, xMax: 970, y: 1730, jitterY: 22, rows: 3, rowGap: 76 },
      out: `episodes/${slug}/out/${slug}.mp4`,   // renderer appends -9x16 automatically
      generatedDir: `episodes/${slug}/generated-9x16`,
      kfScale: 0.72,
    },
  },
  chapters, shots,
  portraitSubtitle: '手绘讲解 · 逐帧可验收',
  notes: { source: '待填：素材与参考来源', honesty: '待填：哪些没做、哪些需人工确认', next: '待填：下一步' },
};

fs.mkdirSync(path.join(EP, 'out'), { recursive: true });
fs.writeFileSync(path.join(EP, 'episode.json'), JSON.stringify(ep, null, 2));
fs.writeFileSync(path.join(EP, 'anchors.lrc'), `[ti:${title}]\n` + anchors);
fs.writeFileSync(path.join(EP, 'README.md'), [
  `# ${slug} · ${title}`,
  '',
  '状态：draft。请先编辑 `episode.json`（旁白正文、章节、分镜、元素）与 `anchors.lrc`（画面内要点时间码）。',
  '',
  '```bash',
  `node tools/build-episode.mjs --episode episodes/${slug}`,
  `node src/main.mjs --config episodes/${slug}/project.json --render`,
  `node src/main.mjs --config episodes/${slug}/project-9x16.json --render`,
  `node tools/verify-delivery.mjs --episode episodes/${slug}`,
  `node tools/archive-episode.mjs --episode episodes/${slug}`,
  '```',
  '',
].join('\n'));
touch(path.join(EP, 'out', '.gitkeep'));
function touch(p) { fs.writeFileSync(p, ''); }

console.log(`New episode scaffolded: episodes/${slug}
  ${nCh} chapters / ${nSh} shots / ${duration}s / ${bpm} BPM
  edit: episode.json + anchors.lrc
  then: node tools/build-episode.mjs --episode episodes/${slug}`);
