// Episode data compiler — the heart of the standard workflow.
//   episode.json + anchors.lrc  ->  16x9 / 9x16 specs, subtitle cards, beat grid,
//                                   narration script / cues / SRT, project configs
//
// One file (episode.json) is BOTH the narration source and the shot list. A new
// talking-head film of any topic only needs a new episode folder; no renderer
// changes. Run: node tools/build-episode.mjs --episode episodes/<slug>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : def;
};
const EP_REL = String(arg('episode', ''));
if (!EP_REL) { console.error('Usage: node tools/build-episode.mjs --episode episodes/<slug>'); process.exit(1); }
const EP = path.isAbsolute(EP_REL) ? EP_REL : path.resolve(ROOT, EP_REL);
if (!fs.existsSync(path.join(EP, 'episode.json'))) { console.error('episode.json not found in ' + EP); process.exit(1); }
const REL = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const w = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); };
const r3 = (v) => +v.toFixed(3);

const ep = JSON.parse(fs.readFileSync(path.join(EP, 'episode.json'), 'utf8'));
const DURATION = Number(ep.duration);
const FPS = Number(ep.fps ?? 24);
const BPM = Number(ep.bpm ?? 90);
const BEAT = 60 / BPM;
const SUB = BEAT / 2;
const BAR = BEAT * 4;
const PHRASE = BEAT * 8;
const OFFSET = Number(ep.offset ?? 0.400);
const SOFT_AT = Number(ep.softEndingAt ?? DURATION - 1.6);
const N_BEATS = Math.max(0, Math.floor((DURATION - OFFSET) / BEAT) + 1);
const N_SUBS = Math.max(0, Math.floor((DURATION - OFFSET) / SUB) + 1);
const N_BARS = Math.max(0, Math.floor((DURATION - OFFSET) / BAR) + 1);
const N_PHRASES = Math.max(0, Math.floor((DURATION - OFFSET) / PHRASE) + 1);

// ------------------------------------------------------------------ validation
const problems = [];
const chapters = ep.chapters || [];
if (!chapters.length) problems.push('no chapters');
if (chapters[0].in !== 0) problems.push('first chapter must start at 0');
if (Math.abs(chapters[chapters.length - 1].out - DURATION) > 0.001) problems.push('last chapter must end at duration');
for (let i = 1; i < chapters.length; i++) {
  if (Math.abs(chapters[i].in - chapters[i - 1].out) > 0.001) problems.push(`chapter gap at ${chapters[i].in}`);
}
const shots = ep.shots || [];
if (!shots.length) problems.push('no shots');
if (shots[0].a !== 0 || Math.abs(shots[shots.length - 1].b - DURATION) > 0.001) problems.push('shot bounds must cover 0..duration');
for (let i = 1; i < shots.length; i++) {
  if (Math.abs(shots[i].a - shots[i - 1].b) > 0.001) problems.push(`shot gap at ${shots[i].a}`);
}
const pace = chapters.map((c) => ({
  id: c.id, chars: [...c.narration].length, wpm: Math.round([...c.narration].length / ((c.out - c.in) / 60)),
}));
for (const p of pace) if (p.wpm > 300 || p.wpm < 120) problems.push(`chapter ${p.id} pace ${p.wpm} words/min outside 120–300`);

// ------------------------------------------------------------- on-screen text
function parseLRC(txt) {
  const out = [];
  for (const line of txt.split(/\r?\n/)) {
    const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const body = line.replace(/\[[^\]]*\]/g, '').trim();
    if (!tags.length || !body || /^(ti|ar|al|by|offset):/.test(body)) continue;
    for (const m of tags) out.push({ t: r3(Number(m[1]) * 60 + Number(m[2])), text: body });
  }
  return out.sort((a, b) => a.t - b.t);
}
const anchors = parseLRC(fs.readFileSync(path.join(EP, 'anchors.lrc'), 'utf8'))
  .filter((a) => a.t >= 0 && a.t < DURATION - 0.15);
if (anchors.length < 8) problems.push(`only ${anchors.length} on-screen anchors (need >= 8)`);
const chapterAt = (t) => chapters.find((c) => t >= c.in && t < c.out) || chapters[chapters.length - 1];
const shotAt = (t) => shots.find((s) => t >= s.a && t < s.b) || shots[shots.length - 1];
const LYRICS = anchors.map((a, i) => {
  const len = [...a.text].length;
  const n = len <= 5 ? 2 : 3;
  const c = chapterAt(a.t);
  const first = !anchors.slice(0, i).some((x) => chapterAt(x.t).id === c.id);
  return { t: a.t, text: a.text, n, sec: `C${c.id}`, kf: first ? 1.9 : 1.0, chapter: c.id, first };
});

// ------------------------------------------------------------------- shot list
const PHONE_FIRST = { signal: 4, battery: 1, planeOn: false, mode: 'default' };
const PHONE_LAST = { signal: 0, battery: 4, planeOn: true, mode: 'default' };
const SHOTS = shots.map((s, i) => {
  const c = chapterAt((s.a + s.b) / 2);
  return {
    id: i + 1, ...s, action: s.scene, gaze: s.gaze ?? 0,
    portraitTitle: s.portraitTitle || c.title,
    portraitSubtitle: s.portraitSubtitle || ep.portraitSubtitle || '手绘讲解 · 逐帧可验收',
    points: s.points || null,
    propOpts: {
      ...(s.propOpts || {}),
      ...(s.elements.includes('phone') ? { phone: i === shots.length - 1 ? PHONE_LAST : PHONE_FIRST } : {}),
      ...(s.elements.includes('noise') ? { noise: { count: 14, alpha: 0.35, decay: true } } : {}),
      ...(s.elements.includes('plane') ? { plane: { x0: 380, x1: 1520, y0: 520, y1: 260, arc: 180, scale0: 1.0, scale1: 1.5 } } : {}),
      ...(s.elements.includes('sun') ? { sun: { mode: 'finale', r: 96 } } : {}),
      ...(s.elements.includes('waves') ? { waves: { count: 3, baseY: 880, amplitude: 22, alpha: 0.9 } } : {}),
    },
  };
});
const COLOR_ARC = SHOTS.map((s) => ({ at: s.a, warm: s.arc.warm, cool: s.arc.cool, bright: s.arc.bright, name: s.arc.name, texture: s.arc.texture }));
function textureAt(t) { let x = COLOR_ARC[0].texture; for (const a of COLOR_ARC) if (t >= a.at) x = a.texture; return x; }
const TRANSITIONS = [
  { at: 0, type: 'paperFade+brushWipe', dur: 0.400 },
  ...SHOTS.slice(1).map((s) => ({ at: s.a, type: s.transition, dur: ['whipPan', 'matchCut', 'actionCut'].includes(s.transition) ? 0.250 : 0.400 })),
  { at: SOFT_AT, type: 'softLanding', dur: +(DURATION - SOFT_AT).toFixed(3) },
];

// ------------------------------------------------------------ subtitle cards
const FORMS = Array.from({ length: 12 }, (_, i) => `F${i + 1}`);
const ES = Array.from({ length: 12 }, (_, i) => `E${i + 1}`);
const ZS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z6', 'Z7', 'Z8', 'Z9', 'Z10', 'Z11', 'Z12'];
const TEX = ['dry', 'wet', 'mid', 'bright'];
function splitText(text, n) {
  const chars = [...text], parts = [];
  const base = Math.floor(chars.length / n), extra = chars.length % n;
  let p = 0;
  for (let i = 0; i < n; i++) {
    const len = base + (i < extra ? 1 : 0);
    parts.push(chars.slice(p, p + len).join('').trim());
    p += len;
  }
  return parts.filter(Boolean);
}
function makeCards(kfScale = 1, portrait = false) {
  const cards = [];
  let ci = 0;
  for (let li = 0; li < LYRICS.length; li++) {
    const L = LYRICS[li], parts = splitText(L.text, L.n);
    const base = (li * 3) % 4;
    for (let k = 0; k < parts.length; k++) {
      const start = r3(L.t + k * (2 * SUB));
      const end = r3(Math.min(DURATION, start + 1.600));
      const slot = (base + k * (parts.length === 2 ? 6 : 4)) % 12;
      const kf = L.first && k === 0 ? 1.9 : +(0.92 + (ci % 4) * 0.11).toFixed(3);
      cards.push({
        id: ci + 1, line: li + 1, part: k + 1, parts: parts.length,
        text: parts[k], sec: L.sec, anchor: L.t, start, end, dwell: r3(end - start),
        zone: ZS[(ci * 5) % ZS.length], slot,
        form: FORMS[(ci * 5) % 12], enter: ES[(ci * 7) % 12], exit: ES[(ci * 7 + 5) % 12],
        texture: TEX[(ci + Math.floor(L.t / 40)) % 4], kf: +(kf * kfScale).toFixed(3),
        keyword: L.first && k === 0, tailException: false,
      });
      ci++;
    }
  }
  cards.push({
    id: ci + 1, line: LYRICS.length + 1, part: 1, parts: 1,
    text: ep.closingLine || '先定规格，再谈生成', sec: `C${chapters.length}`,
    anchor: SOFT_AT - 0.400, start: SOFT_AT - 0.400, end: DURATION, dwell: r3(DURATION - SOFT_AT + 0.400),
    zone: 'Z5', slot: 5, form: 'F9', enter: 'E2', exit: 'E6', texture: 'bright',
    kf: +(2.0 * kfScale).toFixed(3), keyword: true, tailException: true,
  });
  if (portrait) {
    // Precompute the caption-band grid slot from the actual on-screen order:
    // the split cards of one phrase occupy consecutive columns in one row.
    for (let s = 0; s < DURATION; s += 0.05) {
      const on = cards.filter((c) => s >= c.start && s < c.end)
        .sort((a, b) => a.start - b.start || a.id - b.id);
      on.forEach((c, i) => {
        if (c.bandCol === undefined) { c.bandCol = i % 3; c.bandRow = Math.floor(i / 3) % 2; }
      });
    }
    for (const c of cards) if (c.bandCol === undefined) { c.bandCol = 1; c.bandRow = 0; }
  }
  return cards;
}
function stats(cards) {
  const uniq = (a) => [...new Set(a)];
  let maxOn = 0;
  for (let t = 0; t < DURATION; t += 0.05) {
    let on = 0;
    for (const c of cards) if (t >= c.start && t < c.end) on++;
    maxOn = Math.max(maxOn, on);
  }
  return {
    duration: DURATION, fps: FPS, totalFrames: FPS * DURATION, bpm: BPM, offset: OFFSET, confidence: 1,
    lyricLines: LYRICS.length, cards: cards.length, shots: SHOTS.length, transitions: TRANSITIONS.length,
    colorArcSegments: COLOR_ARC.length,
    forms: uniq(cards.map((c) => c.form)).length,
    enters: uniq(cards.map((c) => c.enter)).length,
    exits: uniq(cards.map((c) => c.exit)).length,
    zones: uniq(cards.map((c) => c.zone)).length,
    textures: uniq(cards.map((c) => c.texture)),
    maxOnScreen: maxOn, z5Uses: cards.filter((c) => c.zone === 'Z5').length,
    warnings: [], problems,
  };
}

// ------------------------------------------------------------ narration pack
const srtTime = (s) => {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000), mmm = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(mmm).padStart(3, '0')}`;
};
const cues = chapters.map((c) => ({
  id: c.id, in: c.in, out: c.out, duration: +(c.out - c.in).toFixed(3),
  title: c.title, shots: c.shots, screen: c.screen,
  chars: [...c.narration].length, text: c.narration, narration: c.narration,
}));
const srt = cues.map((c, i) => `${i + 1}\n${srtTime(c.in)} --> ${srtTime(c.out)}\n${c.text}\n`).join('\n');
const script = [
  `# 旁白稿 · ${ep.title}`,
  '',
  `> 期次：\`${ep.id}\`　日期：${ep.date}　主题：${ep.topic}`,
  `> 成片：16:9 \`${REL(path.join(EP, 'out'))}/explainer-240s-16x9.mp4\` / 9:16 \`${REL(path.join(EP, 'out'))}/explainer-240s-9x16.mp4\`（${DURATION}.000 s，自带精确等长静音 AAC 轨）。`,
  '> 后期把配音对齐下表时间码替换静音轨即可；画面内手绘文字已烧进画面，不需要再叠字幕。',
  `> 语速参考：中文约 ${ep.narration?.paceWordsPerMinute ?? 220} 字/分钟；每段末尾留 0.5–1.5 秒呼吸，不要抢转场。`,
  '',
  '| 段 | 时间码 | 时长 | 字数 | 语速(字/分) | 标题 |',
  '|---|---|---|---|---|---|',
  ...cues.map((c, i) => `| ${c.id} | ${srtTime(c.in).slice(0, 8)}–${srtTime(c.out).slice(0, 8)} | ${c.duration}s | ${c.chars} | ${pace[i].wpm} | ${c.title} |`),
  '',
  '---',
  '',
  ...cues.flatMap((c) => [
    `## ${c.id}. ${c.title}  \`${srtTime(c.in).slice(0, 8)} → ${srtTime(c.out).slice(0, 8)}\``,
    '',
    `画面：${c.screen}`,
    '',
    '**照念正文**',
    '',
    c.text,
    '',
    `> 本段 ${c.chars} 字 / ${c.duration} 秒（约 ${pace[c.id - 1].wpm} 字每分）。示范朗读见 \`voice/segments/${String(c.id).padStart(2, '0')}.mp3\`。`,
    '',
  ]),
  '---',
  '',
  '## 录制提示',
  '',
  `- 全片 ${BPM} BPM，大拍 ${BEAT.toFixed(3)} 秒；画面切换落在 ${shots.map((s) => s.a).join('、')} 秒。`,
  `- ${SOFT_AT.toFixed(3)} 秒起画面进入 ${(DURATION - SOFT_AT).toFixed(3)} 秒的减速收束，最后一句建议在此前收尾，留一点余韵。`,
  '- 若需要节拍导引，可另生成一条点击轨（不进成片），录完删掉即可：`voice/click-track.mp3`。',
  '- **示范参考音**：`voice/reference-vo.mp3` 是 AI 合成的完整 240 秒朗读，`voice/segments/` 是逐段文件；只用于听语速与停顿，不是成片配音。',
  '- 成片音轨是静音占位，不含任何第三方音频；本片画面文字为中文手绘，不需另加字幕轨。',
  '- 录完用 `python tools/check-recording.py --episode <期次目录> --take <录音文件>` 做时长 / 峰值 / 静音检查，加 `--mux` 可直接替换音轨出片。',
  '',
].join('\n');

// ------------------------------------------------------------- write layouts
const FINAL_ANCHOR = LYRICS[LYRICS.length - 1].t;
const grid = {
  offset: OFFSET, beat: BEAT, sub: SUB, bar: BAR, phrase: PHRASE,
  beats: Array.from({ length: N_BEATS }, (_, n) => r3(OFFSET + BEAT * n)),
  subs: Array.from({ length: N_SUBS }, (_, m) => r3(OFFSET + SUB * m)),
  bars: Array.from({ length: N_BARS }, (_, k) => r3(OFFSET + BAR * k)),
  phrases: Array.from({ length: N_PHRASES }, (_, p) => r3(OFFSET + PHRASE * p)),
  lyricAnchors: LYRICS.map((L) => L.t), shotBounds: SHOTS.map((s) => s.a),
  shotCount: SHOTS.length, totalFrames: FPS * DURATION, duration: DURATION,
};
const layouts = [
  { key: '16x9', vertical: false, cfg: ep.layouts['16x9'] },
  { key: '9x16', vertical: true, cfg: ep.layouts['9x16'] },
];
for (const L of layouts) {
  const dir = path.join(EP, L.cfg.generatedDir ? path.basename(L.cfg.generatedDir) : (L.vertical ? 'generated-9x16' : 'generated'));
  const cards = makeCards(L.cfg.kfScale ?? 1, L.vertical);
  const spec = {
    fps: FPS, duration: DURATION, bpm: BPM, beat: BEAT, sub: SUB, bar: BAR, phrase: PHRASE,
    offset: OFFSET, nBeats: N_BEATS, nSubs: N_SUBS, nBars: N_BARS, nPhrases: N_PHRASES,
    lyrics: LYRICS, shots: SHOTS, transitions: TRANSITIONS, colorArc: COLOR_ARC,
    keywords: ep.keywords || [], finalAnchor: FINAL_ANCHOR, softLandingAt: SOFT_AT,
    meta: {
      title: ep.title, episode: ep.id, layout: L.key, analysis: 'authored chapter grid',
      generator: 'video-kit-h', note: ep.narration?.note || 'silent placeholder track; narration recorded in post',
    },
  };
  w(path.join(dir, 'spec.json'), spec);
  w(path.join(dir, 'subtitle-cards.json'), { cards });
  w(path.join(dir, 'beat-grid.json'), grid);
  w(path.join(dir, 'prepare-report.json'), stats(cards));
  const gd = path.relative(ROOT, dir).replace(/\\/g, '/');
  const project = {
    schema: 1, title: ep.title, episode: ep.id,
    audio: ep.audio || 'assets/audio/voiceover-placeholder.wav',
    audioFade: { tail: 0 }, duration: DURATION, fps: FPS, layout: L.key,
    bpm: BPM, offset: OFFSET, bpmRange: [70, 190],
    lyrics: REL(path.join(EP, 'anchors.lrc')),
    keywords: ep.keywords || [], shotCount: SHOTS.length, shots: 'auto',
    fontFile: 'auto', fontFileCJK: 'auto',
    out: L.cfg.out || `${REL(path.join(EP, 'out'))}/explainer-240s-${L.key}.mp4`,
    style: {
      ...(ep.style || {}),
      heroPlacement: L.cfg.heroPlacement,
      cardBand: L.cfg.cardBand,
    },
    generated: {
      spec: `${gd}/spec.json`, cards: `${gd}/subtitle-cards.json`,
      grid: `${gd}/beat-grid.json`, report: `${gd}/prepare-report.json`,
    },
  };
  w(path.join(EP, L.vertical ? 'project-9x16.json' : 'project.json'), project);
}

w(path.join(EP, 'narration-script.md'), script);
w(path.join(EP, 'narration.srt'), srt);
w(path.join(EP, 'narration-cues.json'), {
  title: ep.title, episode: ep.id, duration: DURATION, fps: FPS,
  silentTrack: 'out/explainer-240s-{16x9,9x16}.mp4 (AAC 44.1 kHz stereo)',
  note: '旁白后期补录；替换静音轨或另起一条配音轨，按 in/out 对齐',
  chapters: cues,
});
w(path.join(EP, 'README.md'), [
  `# ${ep.id} · ${ep.title}`,
  '',
  `- 日期：${ep.date}　主题：${ep.topic}　标签：${(ep.tags || []).join(' / ')}`,
  `- 时长：${DURATION}.000 s @ ${FPS} fps = ${DURATION * FPS} 帧；${BPM} BPM，首拍 ${OFFSET} s`,
  `- 章节：${chapters.length} 段 / 分镜：${SHOTS.length} 镜 / 画面锚点：${LYRICS.length} 条`,
  `- 旁白：${cues.reduce((n, c) => n + c.chars, 0)} 字，语速 ${pace.map((p) => p.wpm).join(' / ')} 字每分`,
  '',
  '## 交付物',
  '',
  '| 文件 | 说明 |',
  '|---|---|',
  '| `episode.json` | 稿子 + 分镜 + 参数的唯一源 |',
  '| `anchors.lrc` | 画面内手绘文字的时间码 |',
  '| `narration-script.md` | 给人录的旁白稿（**逐字正文** + 时间码 + 画面提示 + 语速） |',
  '| `narration-cues.json` / `narration.srt` | 剪辑软件对轨用 |',
  '| `voice/` | AI 参考音、逐段朗读、点击轨、语音报告（wav/mp3 不入库） |',
  '| `project.json` / `project-9x16.json` | 两版渲染配置 |',
  '| `generated/` `generated-9x16/` | 规格、字幕卡、网格、自检报告 |',
  '| `out/` | 两版成片、试看版、联系表、验收报告（大文件不入库） |',
  '| `manifest.json` | 留痕：哈希、参数、验收、未完成项 |',
  '',
  '## 复现',
  '',
  '```bash',
  `node tools/build-episode.mjs --episode ${REL(EP)}`,
  `node src/main.mjs --config ${REL(EP)}/project.json --render`,
  `node src/main.mjs --config ${REL(EP)}/project-9x16.json --render`,
  `node tools/verify.mjs --config ${REL(EP)}/project.json --file ${REL(EP)}/out/explainer-240s-16x9.mp4`,
  `node tools/verify.mjs --config ${REL(EP)}/project-9x16.json --file ${REL(EP)}/out/explainer-240s-9x16.mp4`,
  `python tools/build-voiceover.py --episode ${REL(EP)}`,
  `python tools/check-recording.py --episode ${REL(EP)} --take <你的录音> --mux`,
  `node tools/archive-episode.mjs --episode ${REL(EP)}`,
  '```',
  '',
  '## 如实说明',
  '',
  `- ${ep.notes?.honesty || '未记录'}`,
  `- ${ep.notes?.source || ''}`,
  '',
].join('\n'));

// ------------------------------------------------------------------- checks
const uniq = (a) => [...new Set(a)];
const cards0 = makeCards(1);
const st = stats(cards0);
if (st.maxOnScreen > 3) problems.push(`maxOnScreen ${st.maxOnScreen} > 3`);
if (st.z5Uses !== 1) problems.push('Z5 must be used exactly once');
if (cards0.some((c) => c.enter === c.exit)) problems.push('a card has identical enter/exit');
if (st.forms < 10) problems.push('form variety < 10');
if (st.zones < 8) problems.push('zone variety < 8');
if (st.textures.length < 4) problems.push('texture variety < 4');
if (TRANSITIONS.length !== SHOTS.length + 1) problems.push('transition count != shots + 1');
if (SHOTS.some((s) => s.z0 > 1.14 || s.z1 > 1.14)) problems.push('zoom > 1.14');
if (problems.length) {
  console.error('Episode assertions failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`Episode built: ${ep.id}
  ${SHOTS.length} shots / ${TRANSITIONS.length} transitions / ${COLOR_ARC.length} colour-arc segments
  ${N_BEATS} beats / ${N_SUBS} subdivisions / ${N_BARS} bars / ${N_PHRASES} phrases
  ${LYRICS.length} on-screen anchors -> ${cards0.length} cards (max ${st.maxOnScreen} on screen)
  forms ${st.forms} / enters ${st.enters} / exits ${st.exits} / zones ${st.zones} / textures ${st.textures.length}
  narration ${cues.reduce((n, c) => n + c.chars, 0)} chars, pace ${pace.map((p) => p.wpm).join('/')} wpm
  layouts: 16x9 + 9x16 (${FPS * DURATION} frames each)
  assertions: clean`);
