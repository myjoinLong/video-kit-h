// A 组「数字世界」元素：手机 / 通知气泡 / 杂讯 / 卫星 / 信息条 / 地球 / 纸飞机。
// 全部手绘、平面 2D、12Hz boil、沿弧线进出；屏幕与纸条上严禁任何文字。
import { C, rgba, mix } from '../core/palette.mjs';
import { brush, thin, contour, fillPoly, resample, poly } from '../core/ink.mjs';
import { wash, blob, contactShadow } from '../core/paint.mjs';
import { clamp, smooth, prog, noise1, ihash, TAU, lerp } from '../core/math.mjs';
import { pulse, beatIndex, beatPhase, BEAT, PHONE } from '../timeline/spec.mjs';
import { VERTICAL, VIS_W, VIS_H, WORLD_CX, WORLD_CY, VY } from '../core/layout.mjs';

// 全幅铺撒类元素的世界边界：横屏沿用原值；竖屏改到「可见世界窗口」内
const FIELD = VERTICAL
  ? { x0: WORLD_CX - VIS_W / 2 - 60, x1: WORLD_CX + VIS_W / 2 + 60,
      y0: WORLD_CY - VIS_H / 2 - 60, y1: WORLD_CY + VIS_H / 2 }
  : { x0: 0, x1: 1920, y0: 0, y1: 1080 };
export { FIELD };

const rr = (x0, y0, x1, y1, r) => [
  [x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r],
  [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r],
];
const ellipse = (cx, cy, rx, ry, n = 14) =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * TAU) * rx, cy + Math.sin((i / n) * TAU) * ry]);

/** 4 格信号条（n 控制亮起格数），供 drawPhone 复用。 */
export function drawSignalBars(g, t, x, y, n, alpha = 1) {
  g.save(); g.globalAlpha *= alpha;
  for (let i = 0; i < 4; i++) {
    const h = 8 + i * 8;
    const on = i < n;
    const jitter = (noise1(t * 12 + i, 33) - 0.5) * 1.6;
    poly(g, [[x + i * 13 - 4, y], [x + i * 13 + 5, y], [x + i * 13 + 5, y - h + jitter], [x + i * 13 - 4, y - h + jitter]],
      { t, wobble: 0.4, seed: 200 + i, fillColor: on ? C.teal : rgba(C.violet, 0.28), ink: on ? C.ink : rgba(C.violet, 0.5), w: 1.2 });
  }
  g.restore();
}

export function drawPhone(g, t, o = {}) {
  const { x = PHONE.x, y = PHONE.y, w = PHONE.w, h = PHONE.h, signal = 4, battery = 4, planeOn = false, alpha = 1, tilt = 0 } = o;
  g.save(); g.globalAlpha *= alpha;
  g.translate(x + w / 2, y + h / 2);
  g.rotate(tilt + Math.sin(t * 0.7) * 0.012);
  g.translate(-w / 2, -h / 2);
  const p = pulse(t);
  const outer = rr(0, 0, w, h, 22);
  fillPoly(g, resample(outer, 12, true), C.clay, 1);
  wash(g, outer, { t, color: C.clayDk, alpha: 0.16, seed: 4, edge: false, blobs: 2 });
  contour(g, outer, { t, seed: 1, w: 2.6, color: C.ink, wobble: 0.9 });

  const sx = 16, sy = 42, sw = w - 32, sh = h - 84;
  const screen = rr(sx, sy, sx + sw, sy + sh, 9);
  fillPoly(g, resample(screen, 10, true), C.creamLite, 1);
  contour(g, screen, { t, seed: 2, w: 1.7, color: C.ink, wobble: 0.6 });

  drawSignalBars(g, t, sx + 14, sy + 40, signal);
  // Wi-Fi 三条弧（信号全灭时变淡）
  for (let i = 0; i < 3; i++) {
    const r = 12 + i * 11;
    const pts = Array.from({ length: 9 }, (_, k) => {
      const a = Math.PI * 1.15 + (k / 8) * Math.PI * 0.7;
      return [sx + sw - 34 + Math.cos(a) * r, sy + 42 + Math.sin(a) * r * 0.85];
    });
    thin(g, pts, { t, seed: 210 + i, w: 2.0, color: signal > 0 ? rgba(C.indigo, 0.85) : rgba(C.violet, 0.3), wobble: 0.4 });
  }
  // 电池 4 格
  const bx = sx + 14, by = sy + sh - 34;
  for (let i = 0; i < 4; i++) {
    poly(g, [[bx + i * 22, by], [bx + i * 22 + 17, by], [bx + i * 22 + 17, by - 14], [bx + i * 22, by - 14]],
      { t, wobble: 0.35, seed: 220 + i, fillColor: i < battery ? C.teal : rgba(C.violet, 0.20), ink: C.ink, w: 1.2 });
  }
  // 飞机图标：planeOn 时亮起并每大拍脉动
  if (planeOn) {
    const cx = sx + sw * 0.52, cy = sy + sh * 0.54;
    const s = 1 + 0.10 * p;
    g.save(); g.translate(cx, cy); g.scale(s, s);
    const pl = [[0, -30], [26, 24], [2, 12], [-2, 12], [-26, 24]];
    fillPoly(g, resample(pl, 5, true), C.ochre, 0.95);
    contour(g, pl, { t, seed: 230, w: 2, color: C.ink, wobble: 0.6 });
    g.restore();
  }
  // 听筒短线
  thin(g, [[w * 0.38, 22], [w * 0.62, 22]], { t, seed: 240, w: 3, color: C.ink });
  g.restore();
}

export function drawNotificationBubbles(g, t, o = {}) {
  const { count = 6, x0 = FIELD.x0, y0 = FIELD.y0, x1 = FIELD.x1, y1 = FIELD.y1, alpha = 1, seed = 1 } = o;
  g.save(); g.globalAlpha *= alpha;
  const bi = beatIndex(t), bp = beatPhase(t);
  for (let i = 0; i < count; i++) {
    const h = ihash(i * 37 + seed);
    // 每个气泡寿命 4 个大拍，相位错开，禁止同步
    const phase = ((bi + i * 2) % 8) / 8 + bp / 8;
    const k = phase % 1;
    const px = lerp(x0 + 120, x1 - 120, ihash(i * 53 + seed + 1));
    const fall = smooth(clamp(k / 0.55));
    const arc = Math.sin(fall * Math.PI) * (40 + h * 70);
    const cx = px + arc * (h > 0.5 ? 1 : -1);
    const cy = lerp(y0 - 80, y1 * 0.62, fall);
    const pop = k > 0.62 ? 1 - smooth((k - 0.62) / 0.38) : 1;
    if (pop <= 0.002) continue;
    const r = (16 + h * 20) * pop * (1 + 0.06 * Math.sin(t * 9 + i));
    const pts = rr(cx - r * 1.5, cy - r * 0.72, cx + r * 1.5, cy + r * 0.72, r * 0.65);
    fillPoly(g, resample(pts, 8, true), rgba(C.creamLite, 0.88), 1);
    contour(g, pts, { t, seed: 300 + i, w: 1.6, color: rgba(C.indigo, 0.85), wobble: 0.6 });
    // 气泡内只有手绘横线，严禁文字
    for (let j = 0; j < 2; j++) {
      thin(g, [[cx - r * 0.9, cy - 3 + j * 7], [cx + r * (0.6 - j * 0.3), cy - 3 + j * 7]],
        { t, seed: 320 + i * 3 + j, w: 1.4, color: rgba(C.violet, 0.8) });
    }
  }
  g.restore();
}

export function drawStaticNoise(g, t, o = {}) {
  const { count = 24, alpha = 1, x0 = FIELD.x0, y0 = FIELD.y0, x1 = FIELD.x1, y1 = FIELD.y1, seed = 2 } = o;
  g.save(); g.globalAlpha *= alpha;
  const si = Math.floor(t / (1 / 3));
  for (let i = 0; i < count; i++) {
    const hx = ihash(i * 71 + seed), hy = ihash(i * 97 + seed + 3);
    const cx = lerp(x0, x1, hx), cy = lerp(y0, y1, hy);
    const jx = (noise1(i * 3.1 + si, seed) - 0.5) * 6;
    const jy = (noise1(i * 5.7 + si, seed + 1) - 0.5) * 6;
    const n = 3 + Math.floor(ihash(i * 13 + seed) * 4);
    for (let k = 0; k < n; k++) {
      const a = -0.9 + k * 0.42 + (noise1(i * 7.3 + k + si * 0.3, seed + 2) - 0.5) * 0.4;
      const len = 7 + ihash(i * 29 + k + seed) * 14;
      thin(g, [[cx + jx + Math.cos(a) * k * 2, cy + jy + Math.sin(a) * k * 2],
               [cx + jx + Math.cos(a) * (k * 2 + len), cy + jy + Math.sin(a) * (k * 2 + len)]],
        { t, seed: 400 + i * 7 + k, w: 1.4, color: rgba(C.violet, 0.72) });
    }
    if (i % 4 === 0) fillPoly(g, ellipse(cx + jx + 12, cy + jy - 8, 2.2, 2.2, 8), rgba(C.violet, 0.6));
  }
  g.restore();
}

export function drawSatellite(g, t, o = {}) {
  const { x = 1520, y = 150, arcs = 4, alpha = 1 } = o;
  g.save(); g.globalAlpha *= alpha;
  const bob = Math.sin(t * 1.3) * 5;
  const disk = ellipse(x, y + bob, 46, 30);
  fillPoly(g, resample(disk, 8, true), C.indigo, 0.9);
  contour(g, disk, { t, seed: 500, w: 2.0, color: C.ink, wobble: 0.7 });
  for (const s of [-1, 1]) {
    thin(g, [[x + s * 26, y + bob - 16], [x + s * 58, y + bob - 52]], { t, seed: 501 + s, w: 2.2, color: C.ink });
    fillPoly(g, ellipse(x + s * 58, y + bob - 52, 9, 7, 10), C.clayLt, 1);
    contour(g, ellipse(x + s * 58, y + bob - 52, 9, 7, 10), { t, seed: 503 + s, w: 1.3, color: C.ink, wobble: 0.4 });
  }
  // 虚线信号弧：每大拍断一根并缩回
  for (let i = 0; i < arcs; i++) {
    const k = 1 - smooth(clamp((beatIndex(t) % 8 + beatPhase(t)) / 8 * (i + 1) / (arcs + 0.5)));
    if (k <= 0.02) continue;
    const pts = [];
    for (let j = 0; j < 22; j++) {
      const u = (j / 21) * k;
      pts.push([x - u * (520 + i * 30), y + bob + 30 + Math.sin(u * Math.PI) * (150 + i * 24)]);
    }
    g.save();
    g.setLineDash([9, 11]);
    thin(g, pts, { t, seed: 510 + i, w: 2.0, color: rgba(C.indigo, 0.75) });
    g.restore();
  }
  g.restore();
}

export function drawFeedStrip(g, t, o = {}) {
  const {
    count = 3, alpha = 1,
    xIn = VERTICAL ? 1620 : 2160,
    xOut = VERTICAL ? 1030 : 980,
    y0 = VERTICAL ? VY(200) : 300,
    step = VERTICAL ? 330 : 190,
    stripW = VERTICAL ? 430 : 560,
    outSpan = VERTICAL ? 640 : 900,
  } = o;
  g.save(); g.globalAlpha *= alpha;
  const bi = beatIndex(t), bp = beatPhase(t);
  for (let i = 0; i < count; i++) {
    const k = ((bi + i * 3) % 9 + bp) / 9;
    const y = y0 + i * step;
    const x = lerp(xIn, xOut, smooth(clamp(k / 0.42)));
    const out = k > 0.76 ? smooth((k - 0.76) / 0.24) : 0;
    const xx = x - out * outSpan;
    const yy = y - out * out * 160;
    if (out >= 1) continue;
    const pts = [[xx, yy], [xx + stripW, yy - 8], [xx + stripW + 10, yy + 66], [xx + 6, yy + 74]];
    fillPoly(g, resample(pts, 12, true), rgba(C.creamLite, 0.94), 1);
    contour(g, pts, { t, seed: 600 + i, w: 1.8, color: rgba(C.indigo, 0.9), wobble: 0.7 });
    // 纸上只有手绘横线，严禁文字
    for (let j = 0; j < 4; j++) {
      thin(g, [[xx + 24, yy + 18 + j * 13], [xx + stripW * 0.55 + ihash(i * 11 + j) * stripW * 0.33, yy + 16 + j * 13]],
        { t, seed: 610 + i * 5 + j, w: 1.5, color: rgba(C.violet, 0.6) });
    }
  }
  g.restore();
}

export function drawGlobe(g, t, o = {}) {
  const { x = 430, y = 300, r = 90, view = 0, alpha = 1 } = o;
  g.save(); g.globalAlpha *= alpha;
  const disk = ellipse(x, y, r, r);
  fillPoly(g, resample(disk, 14, true), C.sky, 0.85);
  contour(g, disk, { t, seed: 700, w: 2.2, color: C.ink, wobble: 0.8 });
  // 4 个绘制好的关键视角（不是匀速旋转）
  const shapes = [
    [[-0.5, -0.2], [-0.1, -0.5], [0.2, -0.15], [0.05, 0.3], [-0.4, 0.35]],
    [[-0.2, -0.45], [0.35, -0.3], [0.5, 0.1], [0.1, 0.45], [-0.35, 0.2]],
    [[0.05, -0.5], [0.5, -0.1], [0.35, 0.4], [-0.05, 0.3], [-0.15, -0.1]],
    [[-0.45, -0.15], [-0.1, -0.4], [0.4, -0.2], [0.3, 0.35], [-0.25, 0.4]],
  ][view % 4];
  const land = shapes.map(([a, b]) => [x + a * r, y + b * r]);
  fillPoly(g, resample(land, 9, true), C.teal, 0.8);
  contour(g, land, { t, seed: 701 + view, w: 1.4, color: C.ink, wobble: 0.6 });
  for (let i = 0; i < 3; i++) {
    thin(g, [[x - r * 0.8, y - r * 0.35 + i * r * 0.38], [x + r * 0.8, y - r * 0.42 + i * r * 0.38]],
      { t, seed: 710 + i, w: 1.1, color: rgba(C.paper, 0.55) });
  }
  g.restore();
}

export function drawPaperPlane(g, t, o = {}) {
  const { x = 700, y = 500, scale = 1, angle = 0, trail = true, alpha = 1, color = C.creamLite } = o;
  g.save(); g.globalAlpha *= alpha;
  g.translate(x, y + Math.sin(t * 2.2) * 7);
  g.rotate(angle + Math.sin(t * 1.7) * 0.045);
  g.scale(scale, scale);
  if (trail) {
    const pts = [];
    for (let i = 0; i < 14; i++) {
      const u = i / 13;
      pts.push([-30 - u * 260, 10 + Math.sin(u * Math.PI * 1.6 + t * 2.4) * (10 + u * 32)]);
    }
    thin(g, pts, { t, seed: 800, w: 2.2, color: rgba(C.ink, 0.55), wobble: 0.6 });
  }
  const pl = [[0, -46], [46, 40], [4, 20], [0, 26], [-4, 20], [-46, 40]];
  fillPoly(g, resample(pl, 5, true), color, 1);
  wash(g, pl, { t, color: C.sky, alpha: 0.18, seed: 81, edge: false, blobs: 2 });
  contour(g, pl, { t, seed: 801, w: 2.4, color: C.ink, wobble: 0.8 });
  thin(g, [[0, -46], [0, 26]], { t, seed: 802, w: 1.6, color: C.ink });
  g.restore();
}
