// Portability / integrity self-check. No rendering, no network.
//   npm run check
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '  ·  ' + detail : ''}`); };
const walk = (dir, ext = ['.mjs', '.json', '.md', '.lrc', '.srt']) => {
  const out = [];
  const go = (d) => {
    for (const n of fs.readdirSync(d)) {
      if (['node_modules', '.git', 'out'].includes(n)) continue;
      const p = path.join(d, n), st = fs.statSync(p);
      if (st.isDirectory()) go(p);
      else if (ext.includes(path.extname(n))) out.push(p);
    }
  };
  go(dir);
  return out;
};

// 1. every source file parses
const srcFiles = fs.readdirSync(path.join(ROOT, 'src'), { recursive: true })
  .filter((n) => String(n).endsWith('.mjs')).map((n) => path.join(ROOT, 'src', String(n)));
const toolFiles = fs.readdirSync(path.join(ROOT, 'tools')).filter((n) => n.endsWith('.mjs')).map((n) => path.join(ROOT, 'tools', n));
const syntaxBad = [];
for (const f of [...srcFiles, ...toolFiles]) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch { syntaxBad.push(path.relative(ROOT, f).replace(/\\/g, '/')); }
}
check('全部 .mjs 语法通过', syntaxBad.length === 0, syntaxBad.join(', ') || `${srcFiles.length + toolFiles.length} files`);

// 2. no machine-specific absolute paths or third-party media committed
const textFiles = walk(ROOT);
const badPath = [], badMedia = [];
for (const f of textFiles) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (rel.endsWith('tools/selfcheck.mjs')) continue;   // it contains the very patterns it scans for
  const txt = fs.readFileSync(f, 'utf8');
  if (/[A-Za-z]:\\(Users|日常分析|WorkBuddy)|D:\/日常分析|\/Users\//.test(txt)) badPath.push(rel);
  if (/(JoshWoodward|AirplaneMode\.mp3|TheBeautifulMachine)/.test(txt)) badMedia.push(rel);
}
check('源码/文档无机器绝对路径', badPath.length === 0, badPath.slice(0, 4).join(', ') || 'clean');
check('不含第三方音频或曲目名', badMedia.length === 0, badMedia.slice(0, 4).join(', ') || 'clean');

// 3. runtime prerequisites
check('Node >= 20', Number(process.versions.node.split('.')[0]) >= 20, process.versions.node);
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); check('ffmpeg 可用', true); }
catch { check('ffmpeg 可用', false, 'install ffmpeg and put it on PATH'); }
try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); check('ffprobe 可用', true); }
catch { check('ffprobe 可用', false, 'install ffmpeg and put it on PATH'); }
try { execFileSync(process.execPath, ['-e', "import('@napi-rs/canvas').then(()=>{}).catch(e=>{console.error(e);process.exit(1)})"], { stdio: 'pipe', cwd: ROOT }); check('@napi-rs/canvas 已安装', true); }
catch { check('@napi-rs/canvas 已安装', false, 'run npm install'); }

// 4. episode integrity
const epRoot = path.join(ROOT, 'episodes');
const eps = fs.existsSync(epRoot) ? fs.readdirSync(epRoot).filter((n) => fs.existsSync(path.join(epRoot, n, 'episode.json'))) : [];
check('至少有一个期次', eps.length > 0, eps.join(', '));
for (const name of eps) {
  const dir = path.join(epRoot, name);
  const ep = JSON.parse(fs.readFileSync(path.join(dir, 'episode.json'), 'utf8'));
  const need = ['episode.json', 'anchors.lrc', 'narration-script.md', 'narration-cues.json', 'narration.srt', 'project.json', 'project-9x16.json', 'generated/spec.json', 'generated/subtitle-cards.json', 'generated-9x16/spec.json', 'generated-9x16/subtitle-cards.json'];
  const missing = need.filter((n) => !fs.existsSync(path.join(dir, n)));
  check(`期次 ${name} 文件齐全`, missing.length === 0, missing.join(', ') || `${need.length} files`);
  check(`期次 ${name} 章节 / 分镜覆盖全片`,
    Math.abs(ep.chapters[ep.chapters.length - 1].out - ep.duration) < 0.001 && Math.abs(ep.shots[ep.shots.length - 1].b - ep.duration) < 0.001,
    `${ep.chapters.length} chapters / ${ep.shots.length} shots`);
  const cues = JSON.parse(fs.readFileSync(path.join(dir, 'narration-cues.json'), 'utf8')).chapters;
  check(`期次 ${name} 旁白稿与 episode.json 一致`, cues.length === ep.chapters.length && cues.every((c, i) => c.text === ep.chapters[i].narration), `${cues.length} cues`);
}

// 5. archive record
if (fs.existsSync(path.join(ROOT, 'INDEX.md'))) {
  const idx = fs.readFileSync(path.join(ROOT, 'INDEX.md'), 'utf8');
  const manifests = eps.filter((n) => fs.existsSync(path.join(epRoot, n, 'manifest.json')));
  check('INDEX.md 列出全部已归档期次', manifests.every((n) => idx.includes(n)), `${manifests.length} archived`);
} else check('INDEX.md 存在', false, 'run archive-episode.mjs');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
