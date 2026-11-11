// B 组「现实世界」元素：太阳 / 海浪 / 窗 / 窗帘 / 饮料 / 孩童 / 小猫 / 风 / 海鸥 / 沙滩。
// 手绘平面 2D、12Hz boil、沿弧线运动；纵深只用重叠 / 缩小 / 偏冷变淡。
import { C, rgba, mix } from '../core/palette.mjs';
import { brush, thin, contour, fillPoly, resample, poly, sweep } from '../core/ink.mjs';
import { wash, blob, softPatch } from '../core/paint.mjs';
import { clamp, smooth, noise1, ihash, TAU, lerp } from '../core/math.mjs';
import { pulse, beatIndex, beatPhase } from '../timeline/spec.mjs';
import { VERTICAL, SPAN, VY } from '../core/layout.mjs';

const rr = (x0, y0, x1, y1, r) => [
  [x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r],
  [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r],
];
const ellipse = (cx, cy, rx, ry, n = 14) =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * TAU) * rx, cy + Math.sin((i / n) * TAU) * ry]);

export function drawSun(g, t, o = {}) {
  const { x = 1600, y = 200, r = 90, rays = 10, alpha = 1 } = o;
  g.save(); g.globalAlpha *= alpha;
  const p = pulse(t), n = Math.max(8, Math.min(12, rays + (Math.floor(t * 1.5) % 3) - 1));
  const rot = (Math.floor(t / (2 / 3)) % 24) * 0.052;
  softPatch(g, x, y, r * 2.4, r * 2.4, { color: C.ochre, alpha: 0.16, rings: 3, seed: 3 });
  const disk = ellipse(x, y, r * (1 + 0.03 * p), r * (1 + 0.03 * p));
  fillPoly(g, resample(disk, 16, true), C.ochre, 0.9);
  contour(g, disk, { t, seed: 900, w: 2.2, color: C.clayDk, wobble: 0.8 });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rot;
    thin(g, [[x + Math.cos(a) * (r + 12), y + Math.sin(a) * (r + 12)],
             [x + Math.cos(a) * (r + 34 + p * 8), y + Math.sin(a) * (r + 34 + p * 8)]],
      { t, seed: 910 + i, w: 2.6, color: C.ochre, wobble: 0.5 });
  }
  g.restore();
}

export function drawWaves(g, t, o = {}) {
  const { count = 3, baseY = 820, amplitude = 24, alpha = 1, colorIndex = 0,
    x0 = -60, x1 = 1980, bottomY = SPAN.yBottom } = o;
  g.save(); g.globalAlpha *= alpha;
  const cols = [C.tealLt, C.teal, mix(C.teal, C.sky, 0.45)];
  for (let w = 0; w < count; w++) {
    const col = cols[(colorIndex + w) % cols.length];
    const y0 = baseY - (count - 1 - w) * 54;
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const x = x0 + (i / 30) * (x1 - x0);
      pts.push([x, y0 + Math.sin(x * 0.008 + t * 1.5 + w * 1.1) * amplitude + Math.sin(x * 0.021 + t * 2.3 + w) * 5]);
    }
    // 水彩色块：边缘渗开 + 一圈更深的湿边沉积
    const bottom = pts.concat([[x1, bottomY], [x0, bottomY]]);
    wash(g, bottom, { t, color: col, alpha: 0.34, seed: 920 + w, edge: true, edgeW: 3.0, edgeAlpha: 0.28, blobs: 3, step: 22 });
    thin(g, pts, { t, seed: 930 + w, w: 2.4, color: mix(col, C.ink, 0.35), wobble: 0.9 });
  }
  g.restore();
}

export function drawWindowFrame(g, t, o = {}) {
  const { x = 520, y = 180, w = 520, h = 520, open = 1, alpha = 1 } = o;
  g.save(); g.globalAlpha *= alpha;
  const frame = rr(x, y, x + w, y + h, 12);
  fillPoly(g, resample(frame, 14, true), rgba(C.sky, 0.42), 1);
  softPatch(g, x + w / 2, y + h / 2, w * 0.7, h * 0.6, { color: C.ochre, alpha: 0.20, rings: 3, seed: 7 });
  contour(g, frame, { t, seed: 940, w: 3.2, color: C.clayDk, wobble: 1.0 });
  // 两扇窗沿弧线推开
  for (const s of [-1, 1]) {
    const k = smooth(clamp(open));
    const hinge = x + w / 2 + s * 6;
    const dx = s * k * w * 0.34;
    const dy = -Math.sin(k * Math.PI) * 26;
    const q = [[hinge, y + 8], [hinge + dx, y + 8 + dy], [hinge + dx + s * 8, y + h - 8 + dy], [hinge, y + h - 8]];
    poly(g, q, { t, wobble: 0.6, seed: 941 + s, fillColor: rgba(C.creamLite, 0.55), ink: C.clayDk, w: 2.2 });
    for (let j = 0; j < 3; j++) {
      const u = (j + 1) / 4;
      thin(g, [[lerp(hinge, hinge + dx, u), y + 20 + dy * u], [lerp(hinge, hinge + dx, u), y + h - 20 + dy * u]],
        { t, seed: 945 + s * 5 + j, w: 1.4, color: rgba(C.clayDk, 0.7) });
    }
  }
  thin(g, [[x + w / 2, y], [x + w / 2, y + h]], { t, seed: 950, w: 2, color: rgba(C.clayDk, 0.8) });
  g.restore();
}

export function drawCurtain(g, t, o = {}) {
  const { x = 520, y = 180, w = 520, h = 520, phase = 0, alpha = 1 } = o;
  g.save(); g.globalAlpha *= alpha;
  for (const s of [-1, 1]) {
    const cx = x + w / 2 + s * (w * 0.42);
    const sway = Math.sin(t * 2.1 + s * 1.2 + phase) * 22 + pulse(t) * 4;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      pts.push([cx + s * (18 + Math.sin(u * Math.PI) * 34 + sway * u), y + u * h * 0.82]);
    }
    const back = pts.concat([[cx + s * 4, y + h * 0.86], [cx + s * 4, y]]);
    wash(g, back, { t, color: C.rose, alpha: 0.30, seed: 960 + s, edge: true, edgeW: 2.2, blobs: 3, step: 18 });
    thin(g, pts, { t, seed: 965 + s, w: 2.6, color: rgba(C.clayDk, 0.8), wobble: 1.0 });
  }
  g.restore();
}

export function drawDrinks(g, t, o = {}) {
  const { x = 760, y = 700, alpha = 1 } = o;
  g.save(); g.globalAlpha *= alpha;
  for (let i = 0; i < 2; i++) {
    const cx = x + i * 96;
    const b = Math.sin(t * 1.6 + i * 1.4) * 2;
    const cup = [[cx - 30, y - 70 + b], [cx + 30, y - 70 + b], [cx + 24, y + b], [cx - 24, y + b]];
    fillPoly(g, resample(cup, 8, true), i ? C.sky : C.ochre, 0.72);
    contour(g, cup, { t, seed: 970 + i, w: 2, color: C.ink, wobble: 0.6 });
    thin(g, [[cx + 8, y - 72 + b], [cx + 20, y - 122 + b]], { t, seed: 973 + i, w: 3, color: C.clayDk });
    // 每大拍一个气泡上浮
    const bi = beatIndex(t), bp = beatPhase(t);
    for (let k = 0; k < 2; k++) {
      const u = (bp + k * 0.5 + i * 0.25) % 1;
      const by = y - 78 - u * 70 + b;
      fillPoly(g, ellipse(cx + (k ? 10 : -8), by, 4 + k, 4 + k, 9), rgba(C.creamLite, 0.8));
      contour(g, ellipse(cx + (k ? 10 : -8), by, 4 + k, 4 + k, 9), { t, seed: 976 + i * 3 + k, w: 1.1, color: C.ink, wobble: 0.3 });
    }
  }
  g.restore();
}

export function drawKids(g, t, o = {}) {
  const { x = 1450, y = 740, count = 2, alpha = 1 } = o;
  g.save(); g.globalAlpha *= alpha * 0.78;   // 远处偏淡
  for (let i = 0; i < count; i++) {
    const cx = x + i * 92, s = 0.68 + i * 0.06;
    const bob = Math.sin(t * 2.6 + i * 1.9) * 3;
    g.save(); g.translate(cx, y + bob); g.scale(s, s);
    const cool = mix(C.clay, C.sky, 0.45);
    fillPoly(g, ellipse(0, -74, 15, 16), cool, 1);
    contour(g, ellipse(0, -74, 15, 16), { t, seed: 980 + i, w: 1.5, color: C.ink, wobble: 0.5 });
    const body = rr(-13, -56, 13, 0, 7);
    fillPoly(g, resample(body, 8, true), cool, 1);
    contour(g, body, { t, seed: 983 + i, w: 1.5, color: C.ink, wobble: 0.5 });
    for (const s2 of [-1, 1]) {
      thin(g, [[s2 * 6, -2], [s2 * 9, 16]], { t, seed: 986 + i * 2 + s2, w: 3, color: C.ink });
    }
    g.restore();
  }
  // 沙滩球
  const bx = x + 190, by = y + 12 + Math.sin(t * 2.2) * 6;
  fillPoly(g, ellipse(bx, by, 24, 24), rgba(C.rose, 0.8), 1);
  contour(g, ellipse(bx, by, 24, 24), { t, seed: 990, w: 1.6, color: C.ink, wobble: 0.5 });
  thin(g, [[bx - 20, by - 8], [bx + 20, by + 8]], { t, seed: 991, w: 1.4, color: C.creamLite });
  g.restore();
}

export function drawCats(g, t, o = {}) {
  const { x = 1450, y = 680, visible = 3, hats = [false, false, true], alpha = 1 } = o;
  g.save(); g.globalAlpha *= alpha;
  const bp = beatPhase(t), bi = beatIndex(t);
  for (let i = 0; i < 3; i++) {
    if (i >= visible) continue;
    // 相位错开 0.05 / 0.075 / 0.10 s，禁止同步
    const delay = [0.05, 0.075, 0.10][i];
    const pop = smooth(clamp(((bi % 6) + bp) / 6 * 1.6 - i * 0.22 - delay));
    const cx = x - i * 150;
    const cy = y - pop * (34 + i * 6) + Math.sin(t * 2.1 + i * 1.7) * 3;
    const head = ellipse(cx, cy, 34, 30);
    fillPoly(g, resample(head, 12, true), C.clayLt, 1);
    contour(g, head, { t, seed: 1000 + i, w: 2, color: C.ink, wobble: 0.7 });
    for (const s of [-1, 1]) {
      const ear = [[cx + s * 14, cy - 24], [cx + s * 30, cy - 52], [cx + s * 34, cy - 18]];
      fillPoly(g, resample(ear, 5, true), C.clayLt, 1);
      contour(g, ear, { t, seed: 1003 + i * 3 + s, w: 1.6, color: C.ink, wobble: 0.5 });
    }
    for (const s of [-1, 1]) {
      thin(g, [[cx + s * 12, cy - 2], [cx + s * 12, cy + 3]], { t, seed: 1010 + i * 3 + s, w: 2.6, color: C.ink });
    }
    thin(g, [[cx - 5, cy + 12], [cx, cy + 15], [cx + 5, cy + 12]], { t, seed: 1015 + i, w: 1.5, color: C.ink });
    // 尾巴是一条飘带，不是几个圆拼贴
    const tail = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      tail.push([cx + 30 + u * 46, cy + 16 + Math.sin(u * Math.PI * 1.3 + t * 2 + i) * (10 + u * 26)]);
    }
    brush(g, tail, { t, seed: 1020 + i, w: 6, color: C.clayLt, wobble: 0.9 });
    thin(g, tail, { t, seed: 1025 + i, w: 1.4, color: rgba(C.ink, 0.75) });
    if (hats[i]) {
      const sq = 1 - 0.12 * pulse(t);
      g.save(); g.translate(cx, cy - 44); g.scale(1 / Math.max(0.1, sq), Math.max(0.1, sq));
      const hat = [[-26, 0], [26, 0], [17, -26], [-17, -26]];
      fillPoly(g, resample(hat, 6, true), C.rose, 1);
      contour(g, hat, { t, seed: 1030 + i, w: 1.8, color: C.ink, wobble: 0.5 });
      thin(g, [[-32, 2], [32, 2]], { t, seed: 1033 + i, w: 3, color: C.clayDk });
      g.restore();
    }
  }
  g.restore();
}

export function drawWindLines(g, t, o = {}) {
  const { count = 4, alpha = 1,
    y0 = VERTICAL ? VY(60) : 240,
    step = VERTICAL ? 340 : 190,
    xSpan = VERTICAL ? 1500 : 2400,
    xStart = VERTICAL ? 360 : -260 } = o;
  g.save(); g.globalAlpha *= alpha;
  for (let i = 0; i < count; i++) {
    const y = y0 + i * step;
    const k = (t * 0.22 + i * 0.27) % 1;
    const x = xStart + k * xSpan;
    const pts = [];
    for (let j = 0; j <= 10; j++) {
      const u = j / 10;
      pts.push([x + u * 320, y + Math.sin(u * Math.PI * 1.5 + t * 1.4 + i) * (8 + u * 16)]);
    }
    thin(g, pts, { t, seed: 1040 + i, w: 1.8, color: rgba(C.paperDeep, 0.85), wobble: 0.6 });
    // 飘动纸屑沿弧线
    const px = x + 220, py = y + Math.sin(t * 2.4 + i) * 22;
    const fl = [[px, py], [px + 11, py - 5], [px + 9, py + 7], [px - 3, py + 5]];
    poly(g, fl, { t, wobble: 0.5, seed: 1050 + i, fillColor: rgba(C.ochre, 0.6), ink: rgba(C.clayDk, 0.5), w: 1 });
  }
  g.restore();
}

export function drawGulls(g, t, o = {}) {
  const { count = 2, alpha = 1,
    x0 = VERTICAL ? 620 : 180,
    xSpan = VERTICAL ? 700 : 1500,
    y0 = VERTICAL ? VY(120) : 210,
    yStep = VERTICAL ? 220 : 90 } = o;
  g.save(); g.globalAlpha *= alpha;
  for (let i = 0; i < count; i++) {
    const k = (t * 0.055 + i * 0.42) % 1;
    const x = x0 + k * xSpan, y = y0 + i * yStep + Math.sin(t * 1.5 + i) * 12;
    const flap = Math.sin(t * 5 + i) * 6;
    thin(g, [[x - 24, y - flap], [x - 8, y + 5], [x, y], [x + 8, y + 5], [x + 24, y - flap]],
      { t, seed: 1060 + i, w: 2.2, color: rgba(C.ink, 0.7) });
  }
  g.restore();
}

export function drawBeachSand(g, t, o = {}) {
  const { y = 900, alpha = 1, x0 = -40, x1 = 1960, bottomY = SPAN.yBottom + 20 } = o;
  g.save(); g.globalAlpha *= alpha;
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const x = x0 + (i / 24) * (x1 - x0);
    pts.push([x, y + Math.sin(x * 0.006 + 0.7) * 16]);
  }
  const sand = pts.concat([[x1, bottomY], [x0, bottomY]]);
  wash(g, sand, { t, color: mix(C.paperDeep, C.ochre, 0.35), alpha: 0.42, seed: 1070, edge: true, edgeW: 2.4, edgeAlpha: 0.24, blobs: 4, step: 26 });
  thin(g, pts, { t, seed: 1071, w: 1.8, color: rgba(C.clayDk, 0.55), wobble: 0.9 });
  for (let i = 0; i < 26; i++) {
    const x = x0 + ihash(i * 31 + 5) * (x1 - x0), yy = y + 26 + ihash(i * 47 + 9) * 140;
    thin(g, [[x, yy], [x + 5 + ihash(i * 53) * 9, yy - 2]],
      { t, seed: 1080 + i, w: 1.2, color: rgba(C.clayDk, 0.35) });
  }
  g.restore();
}
