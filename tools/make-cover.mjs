// Douyin 9:16 cover builder.
//
// Renders ONE clean frame from the episode's own hand-drawn engine (with the
// in-film subtitle cards switched off — they would fight the cover headline),
// then lays a hand-drawn title band, number hook, pointing annotation and an
// episode stamp on top. Everything stays inside Douyin's safe area:
//   - right  ~200 px is covered by the like/comment/share column
//   - bottom ~450 px is covered by the caption / music strip
//   - the profile grid crops 1080x1920 -> 1080x1440 centred (y 240..1680)
//
//   AM_LAYOUT=vertical node tools/make-cover.mjs \
//     --engine "D:/.../airplane-mode/src/render.mjs" --kind music --time 119.5 \
//     --out "D:/.../抖音发布/AirplaneMode-9x16-封面.png"
//
//   node tools/make-cover.mjs --engine ./src/render.mjs --kind explainer \
//     --config episodes/<slug>/project-9x16.json --time 158 --out ...
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { C, rgba } from '../src/core/palette.mjs';
import { drawPaper } from '../src/world/paper.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : d;
};
const ENGINE = String(arg('engine', path.join(ROOT, 'src/render.mjs')));
const KIND = String(arg('kind', 'music'));           // music | explainer
const TIME = Number(arg('time', 55));
const OUT = String(arg('out', path.join(ROOT, 'out', `cover-${KIND}.png`)));
const FPS = 24;

// ---- fonts ----------------------------------------------------------------
for (const [name, file] of Object.entries({
  KitKai: 'C:/Windows/Fonts/simkai.ttf',
  KitHei: 'C:/Windows/Fonts/simhei.ttf',
  KitHand: 'C:/Windows/Fonts/Inkfree.ttf',
})) if (fs.existsSync(file)) {
  try { GlobalFonts.registerFromPath(file, name); } catch { /* optional */ }
}
const KAI = '"KitKai", serif';
const HAND = '"KitHand", "KitKai", serif';

// ---- deterministic hand-drawn primitives (no Math.random, ever) ------------
const lerp = (a, b, t) => a + (b - a) * t;
function raggedBox(x0, y0, x1, y1, seed, amp = 7) {
  const p = [], N = 16;
  for (let i = 0; i <= N; i++) { const t = i / N; p.push([lerp(x0, x1, t), y0 + Math.sin(seed * 1.7 + t * 9) * amp + Math.sin(seed * 0.6 + t * 23) * amp * 0.35]); }
  for (let i = 1; i <= 5; i++) { const t = i / 5; p.push([x1 + Math.sin(seed * 2.1 + t * 11) * amp, lerp(y0, y1, t)]); }
  for (let i = 1; i <= N; i++) { const t = 1 - i / N; p.push([lerp(x0, x1, t), y1 + Math.sin(seed * 1.3 + t * 13) * amp]); }
  for (let i = 1; i < 5; i++) { const t = 1 - i / 5; p.push([x0 + Math.sin(seed * 3.3 + t * 7) * amp, lerp(y0, y1, t)]); }
  return p;
}
function poly(g, pts, fill, ink, lw = 3, alpha = 1) {
  g.save(); g.globalAlpha *= alpha;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (ink) { g.strokeStyle = ink; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
  g.restore();
}
function bigText(g, text, x, y, size) {
  g.save();
  g.font = `${size}px ${KAI}`; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.lineJoin = 'round';
  g.fillStyle = rgba(C.clayDk, 0.30); g.fillText(text, x + 6, y + 6);       // offset "mis-print"
  g.lineWidth = 9; g.strokeStyle = rgba(C.creamLite, 0.94); g.strokeText(text, x, y);
  g.fillStyle = C.ink; g.fillText(text, x, y);
  g.restore();
}
function smallText(g, text, x, y, size, color, font = KAI) {
  g.save(); g.font = `${size}px ${font}`; g.textBaseline = 'alphabetic';
  g.fillStyle = color; g.fillText(text, x, y); g.restore();
}
function measure(g, text, size, font = KAI) {
  g.save(); g.font = `${size}px ${font}`;
  const w = g.measureText(text).width;
  g.restore(); return w;
}
function stamp(g, x, y, label, seed = 7) {
  const w = Math.max(210, measure(g, label, 30) + 44);
  g.save(); g.translate(x, y); g.rotate(-0.055);
  poly(g, raggedBox(0, 0, w, 58, seed, 4), C.clayDk, rgba(C.ink, 0.5), 2.2);
  poly(g, [[0, 0], [20, 0], [0, 18]], rgba(C.paper, 0.9), null);
  poly(g, [[w, 58], [w - 20, 58], [w, 40]], rgba(C.paper, 0.9), null);
  smallText(g, label, 20, 40, 30, C.creamLite);
  g.restore();
}
function curvedArrow(g, from, ctrl, to, color, lw = 4) {
  g.save();
  g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  g.globalAlpha = 0.78;
  g.beginPath(); g.moveTo(from[0], from[1]); g.quadraticCurveTo(ctrl[0], ctrl[1], to[0], to[1]); g.stroke();
  const a = Math.atan2(to[1] - ctrl[1], to[0] - ctrl[0]);
  const h = 22;
  g.beginPath();
  g.moveTo(to[0], to[1]);
  g.lineTo(to[0] - h * Math.cos(a - 0.45), to[1] - h * Math.sin(a - 0.45));
  g.moveTo(to[0], to[1]);
  g.lineTo(to[0] - h * Math.cos(a + 0.45), to[1] - h * Math.sin(a + 0.45));
  g.stroke();
  g.restore();
}
function dot(g, x, y, r, color) {
  g.save(); g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore();
}

// ---- a cover-only composition for the explainer ----------------------------
// A film frame of the explainer IS a whole page of small-print infographic; no
// overlay can turn that into a cover. Compose a clean sheet instead: three
// hand-drawn "spec cards", the clay character and one paper plane.
function specCard(g, x, y, w, h, seed, tilt, draw) {
  g.save();
  g.translate(x + w / 2, y + h / 2); g.rotate(tilt); g.translate(-w / 2, -h / 2);
  poly(g, raggedBox(0, 0, w, h, seed, 5), rgba(C.creamLite, 0.97), rgba(C.ink, 0.5), 2.6);
  draw(g, w, h);
  g.restore();
}
function inkLine(g, pts, color, lw = 3) {
  g.save(); g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke(); g.restore();
}
function tick(g, x, y, s, color) {
  inkLine(g, [[x, y], [x + 5 * s, y + 6 * s], [x + 14 * s, y - 8 * s]], color, 3.4 * s);
}
function paperPlane(g, x, y, s, rot) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
  g.beginPath();
  g.moveTo(-32, -13); g.lineTo(36, 0); g.lineTo(-24, 17); g.lineTo(-9, 2); g.closePath();
  g.fillStyle = C.creamLite; g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.6; g.lineJoin = 'round'; g.stroke();
  inkLine(g, [[-9, 2], [36, 0]], rgba(C.ink, 0.8), 2);
  g.restore();
}
function coverHero(g, cx, by, u) {
  const L = cx - 5 * u, R = cx + 5 * u, T = by - 8 * u, B = by - 2 * u;
  // four short legs
  for (let i = 0; i < 4; i++) {
    const lx = cx - 3.5 * u + i * 2.35 * u;
    g.save();
    g.beginPath();
    g.moveTo(lx - 0.52 * u, B - 0.2 * u);
    g.quadraticCurveTo(lx - 0.62 * u, by, lx, by);
    g.quadraticCurveTo(lx + 0.62 * u, by, lx + 0.52 * u, B - 0.2 * u);
    g.closePath(); g.fillStyle = C.clayDk; g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 2.4; g.stroke(); g.restore();
  }
  // body: rounded but hand-drawn, not a perfect rectangle
  g.save();
  g.beginPath();
  g.moveTo(L + 0.9 * u, T);
  g.quadraticCurveTo(L, T, L, T + 0.9 * u);
  g.lineTo(L, B - 0.9 * u);
  g.quadraticCurveTo(L, B, L + 0.9 * u, B);
  g.lineTo(R - 0.9 * u, B);
  g.quadraticCurveTo(R, B, R, B - 0.9 * u);
  g.lineTo(R, T + 0.9 * u);
  g.quadraticCurveTo(R, T, R - 0.9 * u, T);
  g.closePath();
  g.fillStyle = C.clay; g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 3.2; g.lineJoin = 'round'; g.stroke();
  g.restore();
  // a soft lighter patch so the fill is not flat vector colour
  g.save(); g.globalAlpha = 0.20; g.fillStyle = C.clayLt;
  g.beginPath(); g.ellipse(cx - 2.1 * u, T + 2.4 * u, 1.5 * u, 2.2 * u, -0.2, 0, Math.PI * 2); g.fill(); g.restore();
  // two vertical slit eyes + a small smile
  inkLine(g, [[cx - 1.9 * u, T + 2.5 * u], [cx - 1.9 * u, T + 3.6 * u]], C.ink, 3.2);
  inkLine(g, [[cx + 1.9 * u, T + 2.5 * u], [cx + 1.9 * u, T + 3.6 * u]], C.ink, 3.2);
  g.save(); g.strokeStyle = C.ink; g.lineWidth = 2.6; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, T + 3.9 * u, 1.25 * u, 0.22 * Math.PI, 0.78 * Math.PI); g.stroke(); g.restore();
  // two short arms, deliberately different angles
  inkLine(g, [[L, T + 3.2 * u], [L - 1.7 * u, T + 3.0 * u]], C.ink, 3);
  inkLine(g, [[R, T + 3.2 * u], [R + 1.8 * u, T + 2.6 * u]], C.ink, 3);
  dot(g, L - 1.8 * u, T + 3.0 * u, 0.52 * u, C.clayLt);
  dot(g, R + 1.9 * u, T + 2.6 * u, 0.52 * u, C.clayLt);
}
function compositeExplainer(g) {
  drawPaper(g);
  // two loose watercolour patches, drawn UNDER everything (paper still shows)
  poly(g, raggedBox(40, 830, 1040, 1740, 41, 22), rgba(C.sky, 0.13), null);
  poly(g, raggedBox(0, 1240, 1080, 1920, 53, 18), rgba(C.ochre, 0.10), null);
  // a light wind arc + the paper plane above the cards
  g.save(); g.strokeStyle = rgba(C.indigo, 0.42); g.lineWidth = 3; g.lineCap = 'round';
  g.setLineDash([12, 13]);
  g.beginPath(); g.moveTo(960, 880); g.bezierCurveTo(820, 830, 740, 940, 600, 900); g.stroke(); g.restore();
  paperPlane(g, 600, 900, 1.35, -0.35);
  // three cards: beat grid / spec sheet / acceptance checklist
  specCard(g, 96, 950, 268, 300, 61, -0.035, (c, w) => {
    for (let i = 0; i < 7; i++) {
      const x = 32 + i * 33, h = 38 + (i % 3) * 30;
      inkLine(c, [[x, 210], [x, 210 - h]], rgba(C.indigo, 0.75), 4);
    }
    inkLine(c, [[28, 232], [w - 28, 232]], rgba(C.ink, 0.5), 2.4);
    smallText(c, '拆音频', 34, 272, 27, C.ink);
  });
  specCard(g, 406, 934, 268, 316, 67, 0.028, (c, w) => {
    for (let i = 0; i < 5; i++) inkLine(c, [[30, 46 + i * 40], [w - 44 - (i % 2) * 42, 46 + i * 40]], rgba(C.violet, 0.7), 3.4);
    tick(c, w - 62, 190, 1.1, C.teal);
    smallText(c, '写规格', 30, 282, 27, C.ink);
  });
  specCard(g, 716, 950, 268, 300, 71, -0.022, (c, w) => {
    for (let i = 0; i < 3; i++) {
      tick(c, 30, 62 + i * 52, 0.85, C.teal);
      inkLine(c, [[80, 58 + i * 52], [w - 30, 58 + i * 52]], rgba(C.ink, 0.4), 3);
    }
    smallText(c, '26 / 26', 30, 268, 34, C.clayDk);
  });
  coverHero(g, 520, 1620, 42);
}

// ---- cover layouts ---------------------------------------------------------
const PRESETS = {
  music: {
    badge: '第 5 集 · 驯服 AI',
    lines: ['这次，没让它', '自由发挥'],
    subtitle: '120秒 / 2880帧 / 95张手绘字幕',
    band: rgba(C.ochre, 0.94), accent: C.clayDk,
    callout: '字幕是一张张画进纸里的',
    arrow: [[700, 832], [772, 902], [660, 962]],
    time: 119.5,
  },
  explainer: {
    badge: '方法论 · 口播',
    lines: ['先定规格，', '再谈生成'],
    subtitle: '4分钟 / 6个关键点 / 26项验收',
    band: rgba(C.sky, 0.94), accent: C.indigo,
    callout: '验收表写在动手之前',
    arrow: [[700, 832], [772, 902], [640, 962]],
    time: 5,
  },
};
const P = PRESETS[KIND] || PRESETS.music;
const T = Number.isFinite(TIME) ? TIME : P.time;

// ---- render the clean background frame from the episode's own engine --------
const engine = await import(pathToFileURL(path.isAbsolute(ENGINE) ? ENGINE : path.resolve(ROOT, ENGINE)).href);
const W = engine.W || 1080, H = engine.H || 1920;
const canvas = createCanvas(W, H), g = canvas.getContext('2d');
if (KIND === 'explainer') compositeExplainer(g);
else engine.renderFrame(g, canvas, Math.round(T * FPS), { subtitles: false });

// ---- cover layer -----------------------------------------------------------
// Music covers sit on a film frame: a quiet paper wash hides the film's own
// small heading. The explainer uses a purpose-composed sheet, so it needs none.
if (KIND === 'music') poly(g, raggedBox(46, 140, 870, 640, 3, 9), rgba(C.paper, 0.90), rgba(C.ink, 0.08), 2);

stamp(g, 74, 252, P.badge, KIND === 'music' ? 7 : 19);

// Main colour band: off-axis brush wipe + a few dry-brush gaps.
poly(g, raggedBox(62, 336, 860, 636, 11, 8), P.band, rgba(C.ink, 0.45), 3.2);
g.save(); g.globalAlpha = 0.15; g.strokeStyle = C.creamLite; g.lineWidth = 5; g.lineCap = 'round';
for (let i = 0; i < 4; i++) {
  const y = 368 + i * 66;
  g.beginPath(); g.moveTo(100 + i * 17, y); g.bezierCurveTo(320, y - 9, 560, y + 10, 838 - i * 9, y - 3); g.stroke();
}
g.restore();
bigText(g, P.lines[0], 104, 452, 96);
bigText(g, P.lines[1], 104, 570, 96);

// Number hook on its own cream strip; no underline crossing the glyphs.
poly(g, raggedBox(76, 654, 856, 726, 31, 5), rgba(C.creamLite, 0.94), rgba(C.ink, 0.22), 2);
smallText(g, P.subtitle, 100, 703, 36, C.ink);

// One short annotation + a small pointing arrow. Nothing else competes.
const cw = Math.min(352, Math.max(250, measure(g, P.callout, 27) + 40));
poly(g, raggedBox(856 - cw, 760, 856, 826, 23, 5), rgba(C.creamLite, 0.95), rgba(C.ink, 0.4), 2.2);
smallText(g, P.callout, 856 - cw + 18, 805, 27, C.ink);
// a short hand-drawn flourish instead of an arrow: an arrow kept pointing at
// the wrong thing (the hero's eye, a stray caption) in earlier passes.
g.save(); g.strokeStyle = P.accent; g.lineWidth = 3.4; g.lineCap = 'round'; g.globalAlpha = 0.7;
g.beginPath();
g.moveTo(856 - cw + 20, 840);
g.bezierCurveTo(856 - cw + 110, 832, 856 - 90, 846, 844, 836);
g.stroke(); g.restore();

// ---- write 9:16 + the 3:4 profile-grid crop --------------------------------
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, canvas.toBuffer('image/png'));
const cropY = Math.round((H - W * 4 / 3) / 2) - 24;     // 216: a little headroom above the stamp
const cropH = Math.round(W * 4 / 3);                     // 1440
const c2 = createCanvas(W, cropH), g2 = c2.getContext('2d');
g2.drawImage(canvas, 0, cropY, W, cropH, 0, 0, W, cropH);
const out34 = OUT.replace(/\.png$/i, '-3x4.png');
fs.writeFileSync(out34, c2.toBuffer('image/png'));

console.log(`cover ${KIND}: engine=${path.basename(path.dirname(path.dirname(ENGINE)))} t=${T}s  ${W}x${H}`);
console.log(`  ${OUT}`);
console.log(`  ${out34}  (3:4 crop y ${cropY}..${cropY + cropH})`);
console.log(`  safe area: type x<=856 / y 252..840, right UI & bottom caption untouched`);
