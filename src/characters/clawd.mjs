// 主角：赭陶色小方块生物。规格第八章造型定义，全片不得改变。
// 平面 2D、笔触 + 墨线 + 12Hz boiling；视角用绘制的关键帧切换而非 3D 旋转。
import { C, rgba, mix } from '../core/palette.mjs';
import { brush, thin, contour, inkFill, fillPoly, resample } from '../core/ink.mjs';
import { wash, contactShadow } from '../core/paint.mjs';
import { clamp, smooth, lerp, noise1, TAU, ihash } from '../core/math.mjs';
import { pulse, BEAT, PHRASE, HERO } from '../timeline/spec.mjs';

const rr = (x0, y0, x1, y1, r) => [
  [x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r],
  [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r],
];
const ellipse = (cx, cy, rx, ry, n = 12) =>
  Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * TAU) * rx, cy + Math.sin((i / n) * TAU) * ry]);
const VIEW_W = { front: 1, three: 0.88, side: 0.62, qback: 0.76, back: 0.94 };

/** 情绪标记：只用手绘图形，绝不出现任何字母或符号文字。 */
export function emoteMark(g, x, y, kind, t, scale = 1) {
  if (!kind) return;
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  const bob = (noise1(t * 12 + 3, 7) - 0.5) * 3;
  g.translate(0, bob);
  if (kind === 'bulb') {
    fillPoly(g, ellipse(0, -8, 11, 11), rgba(C.ochre, 0.75));
    contour(g, ellipse(0, -8, 11, 11), { t, seed: 91, w: 1.6, color: C.ink, wobble: 0.6 });
    thin(g, [[-4, 4], [4, 4]], { t, seed: 92, w: 2, color: C.ink });
    for (let i = 0; i < 3; i++) {
      const a = -1.9 + i * 0.95;
      thin(g, [[Math.cos(a) * 16, -8 + Math.sin(a) * 16], [Math.cos(a) * 23, -8 + Math.sin(a) * 23]], { t, seed: 93 + i, w: 1.5, color: C.ochre });
    }
  } else if (kind === 'heart') {
    const hp = [[0, 10], [-11, 0], [-8, -9], [0, -4], [8, -9], [11, 0]];
    fillPoly(g, resample(hp, 5, true), rgba(C.rose, 0.85));
    contour(g, hp, { t, seed: 94, w: 1.5, color: C.ink, wobble: 0.5 });
  } else if (kind === 'sweat') {
    const dp = [[0, -12], [7, 2], [5, 9], [0, 11], [-5, 9], [-7, 2]];
    fillPoly(g, resample(dp, 4, true), rgba(C.sky, 0.85));
    contour(g, dp, { t, seed: 95, w: 1.3, color: C.ink, wobble: 0.4 });
  } else if (kind === 'cloud') {
    for (let i = 0; i < 3; i++) {
      const cy = -4 + i * 5;
      thin(g, [[-14 + i * 2, cy], [-6, cy - 5], [2, cy - 3], [9, cy - 6], [15, cy]], { t, seed: 96 + i, w: 1.6, color: C.violet });
    }
  } else if (kind === 'spark') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + t * 0.4;
      thin(g, [[Math.cos(a) * 5, Math.sin(a) * 5], [Math.cos(a) * 15, Math.sin(a) * 15]], { t, seed: 98 + i, w: 2, color: C.ochre });
    }
  }
  g.restore();
}

export function drawClawd(g, o = {}) {
  const {
    t = 0, x = HERO.x, y = HERO.y, u = HERO.u,
    view = 'front', gaze = 0, mood = 'idle', emote = null,
    jump = 0, lean = 0, alpha = 1, flip = false,
    arms = null,      // {l:[x,y], r:[x,y]} 单位为主角 u，原点=脚底中心
  } = o;

  const bw = 5 * u * (VIEW_W[view] ?? 1);
  const bodyTop = -8 * u, bodyBot = -2 * u;
  const p = pulse(t);
  const ph = (t / BEAT) * TAU;
  const breath = Math.sin(ph + 0.35) * 0.010;
  const squash = clamp(1 - 0.14 * p + breath, 0.85, 1.15);
  const stretch = 1 + (1 - squash) * 0.85;
  const lift = jump * 36 + p * 3.5;
  // 每个乐句一次的「眯眼预备 → 挤压 → 换脸 → 回弹」窗口
  const cyc = (t % PHRASE) / PHRASE;
  const squint = cyc > 0.40 && cyc < 0.50
    ? smooth((cyc - 0.40) / 0.03) * (1 - smooth((cyc - 0.47) / 0.03)) : 0;

  g.save();
  g.globalAlpha *= alpha;
  contactShadow(g, x, y + lift * 0.15, 3.2 * u, 0.18 * (1 - jump * 0.5), 0.22);
  g.translate(x, y - lift);
  if (flip) g.scale(-1, 1);
  g.scale(stretch, squash);
  g.rotate(lean * 0.055);

  // 四条短腿（远侧偏暗）—— 左右相位错开，避免孪生
  const legXs = view === 'side' ? [-2.2 * u, 1.4 * u] : [-3.6 * u, -1.2 * u, 1.2 * u, 3.6 * u];
  for (let i = 0; i < legXs.length; i++) {
    const lx = legXs[i];
    const swing = Math.sin(ph + i * 1.7) * 0.09 * u;
    const pts = rr(lx - 0.72 * u + swing, -2.2 * u, lx + 0.72 * u + swing, 0, 0.38 * u);
    fillPoly(g, resample(pts, 8, true), i % 2 === 0 ? C.clayDk : C.clay, 1);
    contour(g, pts, { t, seed: 30 + i, w: 1.6, color: C.ink, wobble: 0.7 });
  }

  // 身体：平涂 + 两层水彩不均 + 墨线轮廓
  const body = rr(-bw, bodyTop, bw, bodyBot, 1.3 * u);
  fillPoly(g, resample(body, 12, true), C.clay, 1);
  wash(g, body, { t, color: C.clayLt, alpha: 0.20, seed: 12, edge: false, blobs: 3 });
  wash(g, body, { t, color: C.clayDk, alpha: 0.11, seed: 19, edge: false, blobs: 2 });
  contour(g, body, { t, seed: 3, w: 2.3, color: C.ink, wobble: 0.9 });

  // 两只短小手：弧线 + 相位错开的摆动；arms 可指定末端去触碰场景道具
  for (const side of [-1, 1]) {
    const sy = -4.6 * u + Math.sin(ph + (side > 0 ? 0.9 : 0.2)) * 0.12 * u;
    const sx = side * bw * 0.97;
    let ex = sx + side * (1.5 * u) + (side > 0 ? 6 * p : -3 * p);
    let ey = sy - 0.9 * u + (side > 0 ? -8 * p : 2 * p);
    if (arms) {
      const a = side > 0 ? arms.r : arms.l;
      ex = a[0] * u; ey = a[1] * u;
    }
    const mx = lerp(sx, ex, 0.5) + side * 0.30 * u;
    const my = lerp(sy, ey, 0.5) - 0.22 * u;
    brush(g, [[sx, sy], [mx, my], [ex, ey]],
      { t, seed: 40 + side, w: 3.2, color: C.ink, wobble: 0.8 });
    fillPoly(g, ellipse(ex, ey, 0.55 * u, 0.5 * u, 10), C.clayLt, 1);
    contour(g, ellipse(ex, ey, 0.55 * u, 0.5 * u, 10), { t, seed: 45 + side, w: 1.4, color: C.ink, wobble: 0.5 });
  }

  // 眼睛：两条细长竖缝；side 只画一只；gaze 让眼睛先动
  if (view === 'front' || view === 'three' || view === 'side') {
    const eyeTop = -6.3 * u, eyeBot = -4.9 * u;
    const off = gaze * 0.45 * u;
    const eyes = view === 'side' ? [1.1 * u + off] : [-2.5 * u + off, 2.5 * u + off];
    const h = 1 - squint * 0.72;
    for (let i = 0; i < eyes.length; i++) {
      const ex = eyes[i] * (view === 'three' ? 0.88 : 1);
      brush(g, [[ex, eyeTop + (1 - h) * 0.7 * u], [ex + 0.05 * u, eyeBot - (1 - h) * 0.7 * u]],
        { t, seed: 60 + i, w: 4.0, color: C.ink, wobble: 0.5 });
    }
  } else {
    // 背面视图：一条手绘脊线，不画脸
    thin(g, [[0, bodyTop + 0.7 * u], [0, bodyBot - 0.5 * u]], { t, seed: 70, w: 1.5, color: C.clayDk, alpha: 0.7 });
  }

  // 嘴：按 mood 画，静息时没有嘴
  const my = -3.9 * u;
  if (mood === 'happy') brush(g, [[-1.0 * u, my], [0, my + 0.5 * u], [1.0 * u, my]], { t, seed: 72, w: 2.4, color: C.ink, wobble: 0.5 });
  else if (mood === 'surprise') fillPoly(g, ellipse(0, my, 0.42 * u, 0.55 * u), C.ink, 0.9);
  else if (mood === 'decide') thin(g, [[-0.8 * u, my], [0.8 * u, my]], { t, seed: 73, w: 2.2, color: C.ink });
  else if (mood === 'curious') brush(g, [[-0.5 * u, my + 0.2 * u], [0.6 * u, my - 0.12 * u]], { t, seed: 74, w: 2.2, color: C.ink, wobble: 0.4 });
  else if (mood === 'calm') brush(g, [[-0.9 * u, my], [0, my + 0.25 * u], [0.9 * u, my]], { t, seed: 75, w: 2.0, color: C.ink, wobble: 0.4 });

  // 表情标记画在头顶
  if (emote) emoteMark(g, 0, -9.7 * u, emote, t, u / 26);
  g.restore();
}
