// 第十一章：11 处接缝的转场，全部在屏幕空间绘制（调用方已重置 transform）。
// 手绘粗笔触毛边、形状光圈、甩镜拖影、撕纸翻页；禁止纯黑纯白、3D、渐变光效。
import { createCanvas } from '@napi-rs/canvas';
import { C, rgba } from '../core/palette.mjs';
import { brush, thin, resample, fillPoly } from '../core/ink.mjs';
import { W, H } from '../core/camera.mjs';
import { clamp, smooth, noise1, TAU } from '../core/math.mjs';

/** 粗笔触擦除：p<0.5 铺满，p>0.5 拖走。dir=1 左→右，dir=-1 右→左。 */
function wipe(g, t, p, angle, dir = 1, color = C.paper) {
  const cover = p < 0.5 ? smooth(p / 0.5) : 1;
  const drag = p < 0.5 ? 0 : smooth((p - 0.5) / 0.5);
  const span = 2500;
  const x0 = dir > 0 ? -300 + drag * span : W + 300 - drag * span;
  const x1 = dir > 0 ? -300 + cover * span : W + 300 - cover * span;
  const width = dir > 0 ? x1 - x0 : x0 - x1;
  if (width < 6) return;
  g.save();
  g.translate(W / 2, H / 2); g.rotate(angle); g.translate(-W / 2, -H / 2);
  const n = Math.max(4, Math.ceil(width / 130));
  for (let i = 0; i <= n; i++) {
    const x = x0 + (dir > 0 ? 1 : -1) * (i / n) * width;
    const j = (noise1(i * 2.3 + 11, 5) - 0.5) * 60;
    // 起点也带独立抖动 → 覆盖边界是手绘锯齿而不是一条笔直的竖线
    const j0 = (noise1(i * 3.7 + 29, 8) - 0.5) * 74;
    brush(g, [[x + j0, -340], [x + j, H + 340]],
      { t, seed: 1200 + i, w: 190, color, wobble: 2.4, taperIn: 0, taperOut: 0, pressure: 0.22 });
  }
  g.restore();
}

/** 形状光圈：evenodd 遮罩留一个孔。shape='circle'|'plane'；closing=true 收拢。 */
function iris(g, t, p, shape, closing) {
  const k = clamp(closing ? 1 - p : p);
  const R = Math.max(W, H) * 0.78 * Math.max(0.001, k);
  const cx = W * 0.5, cy = H * 0.5;
  g.save();
  g.beginPath();
  g.rect(0, 0, W, H);
  if (shape === 'circle') {
    g.arc(cx, cy, R, 0, TAU, true);
  } else {
    // 纸飞机形（三角折线）
    const s = R * 0.55;
    g.moveTo(cx, cy - s, true);
    g.lineTo(cx + s, cy + s * 0.8, true);
    g.lineTo(cx, cy + s * 0.35, true);
    g.lineTo(cx - s, cy + s * 0.8, true);
    g.closePath();
  }
  g.fillStyle = rgba(C.paper, 0.985);
  g.fill('evenodd');
  // 孔的边缘：手绘毛边
  g.beginPath();
  if (shape === 'circle') g.arc(cx, cy, R, 0, TAU);
  else {
    const s = R * 0.55;
    g.moveTo(cx, cy - s); g.lineTo(cx + s, cy + s * 0.8);
    g.lineTo(cx, cy + s * 0.35); g.lineTo(cx - s, cy + s * 0.8); g.closePath();
  }
  g.strokeStyle = rgba(C.ink, 0.30);
  g.lineWidth = 3.2;
  g.stroke();
  g.restore();
}

function lightCut(g, t, p, kind) {
  const a = Math.sin(p * Math.PI) * (kind === 'action' ? 0.34 : 0.22);
  g.save(); g.globalAlpha = a;
  const n = kind === 'action' ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const y = 200 + i * (H - 400) / Math.max(1, n - 1);
    const x = -180 + p * 460;
    brush(g, [[x, y], [x + 520 + i * 90, y + 14]],
      { t, seed: 1300 + i, w: kind === 'action' ? 12 : 6, color: C.creamLite, wobble: 2.0, pressure: 0.4 });
  }
  g.restore();
}

function whipPan(g, t, p) {
  const a = Math.sin(p * Math.PI) * 0.62;
  g.save(); g.globalAlpha = a;
  for (let i = 0; i < 8; i++) {
    const y = i * (H / 8) + (noise1(i * 3.1, 9) - 0.5) * 26;
    brush(g, [[-80 + p * 180, y], [W + 80 + p * 180, y + 18]],
      { t, seed: 1320 + i, w: 54, color: C.paper, wobble: 3.2, pressure: 0.5 });
  }
  g.restore();
}

function pageTear(g, t, p) {
  const k = smooth(clamp(p));
  const xEdge = W * (1 - k) - 40;
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const y = (i / 24) * H;
    const tooth = (noise1(i * 1.7, 17) - 0.5) * 34;
    pts.push([xEdge + tooth, y]);
  }
  g.save();
  g.beginPath();
  g.moveTo(W + 60, 0);
  g.lineTo(xEdge, 0);
  for (const q of pts) g.lineTo(q[0], q[1]);
  g.lineTo(W + 60, H);
  g.closePath();
  g.fillStyle = rgba(C.creamLite, 0.96);
  g.fill();
  // 撕边毛边
  brush(g, pts, { t, seed: 1340, w: 8, color: rgba(C.clayDk, 0.55), wobble: 2.0, taperIn: 0, taperOut: 0 });
  // 翻页高光
  thin(g, [[xEdge + 30, 0], [xEdge + 30, H]], { t, seed: 1341, w: 2, color: rgba(C.clayDk, 0.22) });
  g.restore();
}

function paperFade(g, t, p) {
  g.save();
  g.globalAlpha = 1 - smooth(clamp(p / 0.28));
  g.fillStyle = C.paper;
  g.fillRect(0, 0, W, H);
  g.restore();
}

/**
 * 结尾渐次收束（替代原先的全屏擦除）：
 * ① 一层极薄的纸色雾（≤0.20）让亮度缓缓落下，但绝不盖住画面与字幕；
 * ② 3 道减速滑入的粗笔触，速度按 ease-out 递减直至几乎停住；
 * ③ 四角手绘弧线缓慢向内收，形成「合上这一页」的读感而不是切断；
 * ④ 所有笔触仍按 t 做 12Hz boiling，最后一帧依旧在动。
 */
function softLanding(g, t, p) {
  const ease = 1 - Math.pow(1 - clamp(p), 2.4);
  // ① 纸色薄雾：只压亮度，不遮挡
  g.save();
  g.globalAlpha = 0.20 * smooth(clamp(p));
  g.fillStyle = C.paper;
  g.fillRect(0, 0, W, H);
  g.restore();

  // ② 减速笔触：从右向左，末端几乎停住，不铺满画面
  g.save();
  g.globalAlpha = 0.13;
  for (let i = 0; i < 3; i++) {
    const x = W + 240 - ease * (W * (0.52 + i * 0.055)) - i * 46;
    const jitter = (noise1(i * 3.3 + 41, 12) - 0.5) * 34;
    brush(g, [[x + jitter, -160], [x - 26 + jitter * 0.4, H * 0.55], [x + 14, H + 160]],
      { t, seed: 1400 + i, w: 120 + i * 26, color: C.creamLite, wobble: 2.6, pressure: 0.3 });
  }
  g.restore();

  // ③ 四角收拢弧：手绘墨线，缓慢向内，最后一帧仍随 t 微微呼吸
  g.save();
  const pad = 90 + ease * (Math.min(W, H) * 0.11) + Math.sin(t * 1.7) * 2;
  const corners = [[pad, pad, 1, 1], [W - pad, pad, -1, 1], [pad, H - pad, 1, -1], [W - pad, H - pad, -1, -1]];
  for (let i = 0; i < corners.length; i++) {
    const [cx, cy, sx, sy] = corners[i];
    const pts = [];
    for (let j = 0; j <= 10; j++) {
      const a = (j / 10) * Math.PI * 0.5;
      pts.push([cx + sx * Math.cos(a) * 92, cy + sy * Math.sin(a) * 92]);
    }
    thin(g, pts, { t, seed: 1420 + i, w: 2.0, color: rgba(C.clayDk, 0.24 * (0.4 + 0.6 * ease)), wobble: 0.8 });
  }
  g.restore();
}

/** 主入口：tr = transitionAt(t) 的 {at,type,dur,p}。 */
export function drawTransition(g, t, tr) {
  if (!tr) return;
  const { type, p } = tr;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  switch (type) {
    case 'paperFade+brushWipe':
      paperFade(g, t, p);
      wipe(g, t, p, 0.0, 1, C.paper);
      break;
    case 'matchCut':      lightCut(g, t, p, 'match'); break;
    case 'actionCut':     lightCut(g, t, p, 'action'); break;
    case 'brushWipe35':   wipe(g, t, p, -35 * Math.PI / 180, 1, C.paper); break;
    case 'irisPlane':     iris(g, t, p, 'plane', false); break;
    case 'whipPan':       whipPan(g, t, p); break;
    case 'brushWipeH':    wipe(g, t, p, 0.0, 1, C.paper); break;
    case 'pageTear':      pageTear(g, t, p); break;
    case 'irisCircle':    iris(g, t, p, 'circle', true); break;
    case 'softLanding':   softLanding(g, t, p); break;
    case 'brushWipeOut':
      wipe(g, t, p, 0.0, -1, C.paper);
      // 收拢到纸色（不是硬停）；保留 25% 画面与持续沸腾的笔触
      if (p > 0.62) {
        g.globalAlpha = smooth(clamp((p - 0.62) / 0.38)) * 0.75;
        g.fillStyle = C.paper;
        g.fillRect(0, 0, W, H);
      }
      break;
    default: break;
  }
  g.restore();
}
