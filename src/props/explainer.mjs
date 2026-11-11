// Hand-drawn infographic props for the "how to make a good AI animation film"
// explainer. Every prop uses the SAME kernel as the music films: paper space,
// ink with 12 Hz boiling, watercolour washes, the locked 13-colour palette,
// flat 2D only. Nothing here is a screenshot, an icon font, or a UI overlay.
//
// All functions are pure in t: the same t always produces the same drawing.
// Props are drawn inside the camera transform, so coordinates are world units
// (1920x1080 in 16:9). `o.k` is 0..1 progress through the current shot.
import { C, rgba, mix } from '../core/palette.mjs';
import { thin, brush, contour, poly, resample, fillPoly } from '../core/ink.mjs';
import { softPatch, wash } from '../core/paint.mjs';
import { clamp, smooth, prog, lerp, noise1, ihash, boil, TAU } from '../core/math.mjs';
import { fontOf } from '../core/font.mjs';
import { FPS, BEAT, BAR, OFFSET, subIndex, beatIndex, pulse } from '../timeline/spec.mjs';

export const RECT = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// ---------------------------------------------------------------- primitives
export function panel(g, t, x, y, w, h, o = {}) {
  const seed = o.seed ?? 1;
  g.save();
  if (o.back !== false) {
    poly(g, RECT(x, y, w, h), {
      t, wobble: 3.0, seed,
      fillColor: rgba(o.fill || C.creamLite, o.alpha ?? 0.66),
      ink: rgba(o.ink || C.ink, 0.48), w: 2.2,
    });
    // a second, offset wash gives the paper a wet edge without a gradient
    wash(g, RECT(x + 8, y + 10, w - 16, h - 20), {
      t, color: o.washColor || C.sky, alpha: 0.055, seed: seed + 3,
      edge: true, edgeW: 1.8, edgeAlpha: 0.12, blobs: 3, step: 30,
    });
  }
  // corner registration marks — a drawing-board cue, not a UI frame
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    thin(g, [[cx + sx * 12, cy], [cx + sx * 34, cy]], { t, seed: seed + 11, w: 1.8, color: rgba(C.clayDk, 0.55) });
    thin(g, [[cx, cy + sy * 12], [cx, cy + sy * 34]], { t, seed: seed + 12, w: 1.8, color: rgba(C.clayDk, 0.55) });
  }
  g.restore();
}

/** Hand-lettered text. Per-glyph boil jitter, ink fill, faint second impression. */
export function handText(g, t, text, x, y, px, o = {}) {
  const { color = C.ink, align = 'center', alpha = 1, jitter = 1.4, seed = 0, rot = 0, back = null, tracking = 0 } = o;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha *= alpha;
  g.font = fontOf(px);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const chars = [...text];
  const widths = chars.map((c) => g.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1);
  let cx = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;
  if (back) softPatch(g, 0, 0, total * 0.55 + 26, px * 0.82, { color: back, alpha: 0.30, rings: 2, seed: seed + 40 });
  const b = boil(t);
  for (let i = 0; i < chars.length; i++) {
    const jx = (noise1(i * 3.1 + b, seed) - 0.5) * jitter;
    const jy = (noise1(i * 5.7 + b, seed + 1) - 0.5) * jitter;
    g.fillStyle = color;
    g.fillText(chars[i], cx + jx, jy);
    g.strokeStyle = rgba(mix(color, C.paper, 0.55), 0.28);
    g.lineWidth = 0.9;
    g.strokeText(chars[i], cx + jx + 0.8, jy + 0.7);
    cx += widths[i] + tracking;
  }
  g.restore();
}

export function arrow(g, t, a, b, seed, color = C.clayDk, w = 2.4) {
  const bow = -14;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    pts.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u) - Math.sin(u * Math.PI) * bow]);
  }
  thin(g, pts, { t, seed, w, color: rgba(color, 0.8), wobble: 0.6 });
  const ang = Math.atan2(b[1] - pts[8][1], b[0] - pts[8][0]);
  for (const s of [-1, 1]) {
    thin(g, [[b[0], b[1]], [b[0] - Math.cos(ang + s * 0.5) * 18, b[1] - Math.sin(ang + s * 0.5) * 18]],
      { t, seed: seed + 3, w, color: rgba(color, 0.8) });
  }
}

export function stamp(g, t, text, x, y, o = {}) {
  const px = o.px ?? 30, rot = o.rot ?? -0.08;
  g.save();
  g.translate(x, y); g.rotate(rot);
  const w = Math.max(150, text.length * px * 0.95 + 40), h = px * 1.9;
  poly(g, RECT(-w / 2, -h / 2, w, h), {
    t, wobble: 4.2, seed: o.seed ?? 77,
    fillColor: rgba(o.fill || C.creamLite, 0.88),
    ink: rgba(o.ink || C.clayDk, 0.85), w: 2.6,
  });
  // two deliberately broken corners
  for (let i = 0; i < 2; i++) {
    thin(g, [[-w / 2 + 8 + i * 9, -h / 2 + 2], [-w / 2 - 2 + i * 9, -h / 2 + 15]],
      { t, seed: 80 + i, w: 2, color: rgba(C.paper, 0.8) });
  }
  handText(g, t, text, 0, 1, px, { color: o.ink || C.clayDk, seed: 81, jitter: 1.1 });
  g.restore();
}

export function check(g, t, x, y, s, seed, color = C.teal) {
  const pts = [[x - s * 0.45, y], [x - s * 0.05, y + s * 0.38], [x + s * 0.52, y - s * 0.52]];
  brush(g, pts, { t, seed, w: 3.2, color: rgba(color, 0.9), wobble: 0.6, taperOut: 0.2 });
}

export function cross(g, t, x, y, s, seed) {
  for (const d of [-1, 1]) {
    brush(g, [[x - s * 0.4, y - d * s * 0.4], [x + s * 0.4, y + d * s * 0.4]],
      { t, seed: seed + d, w: 3.4, color: rgba(C.clayDk, 0.85), wobble: 0.6 });
  }
}

// ------------------------------------------------------------------ 1. intro
export function drawColdOpen(g, t, o = {}) {
  const k = o.k ?? 0;
  panel(g, t, 410, 150, 1340, 650, { seed: 310, fill: C.creamLite, washColor: C.indigo });
  handText(g, t, '先看结果：一支 2 分钟的卡点动画', 1080, 205, 38, { seed: 311, back: C.ochre });

  const xs = [480, 940, 1400], lit = Math.floor((t - OFFSET) / (BEAT * 2)) % 3;
  for (let i = 0; i < 3; i++) {
    const x = xs[i], y = 270, w = 320, h = 250;
    const on = i === lit;
    g.save();
    poly(g, RECT(x, y, w, h), {
      t, wobble: on ? 5 : 2.4, seed: 320 + i,
      fillColor: rgba(on ? C.ochre : C.paper, on ? 0.30 : 0.75),
      ink: rgba(C.ink, on ? 0.85 : 0.5), w: on ? 3.2 : 2.0,
    });
    if (i === 0) {
      for (let b = 0; b < 4; b++) {
        const bh = 22 + b * 16;
        poly(g, RECT(x + 60 + b * 34, y + 190 - bh, 22, bh), { t, wobble: 2, seed: 330 + b, fillColor: rgba(C.indigo, 0.8), ink: rgba(C.ink, 0.6), w: 1.4 });
      }
      for (let b = 0; b < 3; b++) contour(g, Array.from({ length: 12 }, (_, q) => [x + 90 + b * 62 + Math.cos(q / 12 * TAU) * 24, y + 75 + Math.sin(q / 12 * TAU) * 20]),
        { t, seed: 340 + b, w: 1.6, color: rgba(C.violet, 0.8) });
    } else if (i === 1) {
      const p = [[x + 100, y + 150], [x + 250, y + 80], [x + 185, y + 165], [x + 120, y + 145]];
      fillPoly(g, resample(p, 6, true), rgba(C.creamLite, 0.95), 1);
      contour(g, p, { t, seed: 350, w: 2.2, color: rgba(C.ink, 0.85), wobble: 0.6 });
      thin(g, [[x + 250, y + 80], [x + 290, y + 40]], { t, seed: 351, w: 2, color: rgba(C.ochre, 0.8) });
    } else {
      poly(g, RECT(x + 110, y + 80, 110, 92), { t, wobble: 2.4, seed: 360, fillColor: rgba(C.clay, 0.9), ink: rgba(C.ink, 0.8), w: 2 });
      thin(g, [[x + 170, y + 172], [x + 260, y + 110]], { t, seed: 361, w: 4, color: rgba(C.ink, 0.8) });
      for (const q of [-1, 1]) contour(g, Array.from({ length: 12 }, (_, j) => [x + 215 + q * 40 + Math.cos(j / 12 * TAU) * 9, y + 100 + Math.sin(j / 12 * TAU) * 9]),
        { t, seed: 370 + q, w: 1.4, color: rgba(C.ochre, 0.9) });
    }
    g.restore();
    handText(g, t, ['信号满格', '纸飞机飞出', '主角伸手'][i], x + w / 2, y + h + 32, 24, { seed: 380 + i, color: on ? C.clayDk : C.inkLight });
  }

  const nums = [['2 分钟', 620], ['2880 帧', 1080], ['95 张字幕卡', 1500]];
  const pop = pulse(t);
  for (let i = 0; i < 3; i++) {
    const [txt, x] = nums[i];
    handText(g, t, txt, x, 690, 44 * (1 + 0.10 * pop * (i === lit ? 1 : 0.25)), {
      seed: 390 + i, color: i === lit ? C.clayDk : C.ink, back: i === lit ? C.ochre : null,
    });
  }
  handText(g, t, '同一套手绘内核，也能把「怎么做」讲清楚', 1080, 762, 28, { seed: 399, color: C.inkLight });
}

// ------------------------------------------------------- 2. audio / waveform
export function drawWaveform(g, t, o = {}) {
  const k = o.k ?? 0;
  panel(g, t, 410, 140, 1340, 670, { seed: 410, fill: C.creamLite, washColor: C.sky });
  handText(g, t, '第一步：先拆音频，别先想画面', 1080, 190, 36, { seed: 411, back: C.ochre });

  const x0 = 480, x1 = 1680, cy = 330;
  thin(g, [[x0 - 20, cy], [x1 + 20, cy]], { t, seed: 412, w: 1.6, color: rgba(C.inkLight, 0.5), dash: [9, 11] });
  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const u = i / 160;
    const env = 0.32 + 0.68 * Math.abs(Math.sin(u * Math.PI * 6.2 + 0.4)) * (0.55 + 0.45 * Math.sin(u * Math.PI * 2.1 + 1.2) ** 2);
    const a = (noise1(i * 0.7, 12) - 0.5) * 2 * env * 86 * (1 + 0.12 * pulse(t));
    pts.push([x0 + (x1 - x0) * u, cy + a]);
  }
  thin(g, pts, { t, seed: 413, w: 2.1, color: rgba(C.indigo, 0.88), wobble: 0.8 });
  wash(g, pts.concat([[x1, cy], [x0, cy]]), { t, color: C.sky, alpha: 0.14, seed: 414, edge: false, blobs: 3, step: 24 });

  // beat ticks light up in order; the playhead is locked to the same grid
  const nTicks = 24, tickStep = (x1 - x0) / nTicks;
  const head = x0 + (x1 - x0) * clamp(k);
  for (let i = 0; i <= nTicks; i++) {
    const x = x0 + i * tickStep, passed = x <= head;
    thin(g, [[x, 440], [x, passed ? 470 : 456]], {
      t, seed: 420 + i, w: passed ? 2.8 : 1.6,
      color: rgba(passed ? C.clayDk : C.violet, passed ? 0.9 : 0.65),
    });
  }
  brush(g, [[head, 250], [head, 470]], { t, seed: 430, w: 3.4, color: rgba(C.clayDk, 0.9), wobble: 0.5 });
  softPatch(g, head, 250, 26, 20, { color: C.ochre, alpha: 0.6, rings: 2, seed: 431 });

  // three numbers that everything else is built on
  const dials = [
    ['BPM', '90 / 180', 620],
    ['首拍相位', '0.400 s', 1080],
    ['时长', '120.000 s', 1510],
  ];
  for (let i = 0; i < 3; i++) {
    const [label, value, x] = dials[i];
    const on = Math.floor((t - OFFSET) / (BAR * 2)) % 3 === i;
    g.save();
    contour(g, Array.from({ length: 16 }, (_, q) => [x + Math.cos(q / 16 * TAU) * (72 + (q % 3) * 3), 600 + Math.sin(q / 16 * TAU) * 56]),
      { t, seed: 440 + i, w: on ? 3.0 : 2.0, color: rgba(on ? C.clayDk : C.indigo, 0.85), wobble: 1.2 });
    if (on) softPatch(g, x, 600, 96, 70, { color: C.ochre, alpha: 0.28, rings: 2, seed: 445 + i });
    handText(g, t, label, x, 578, 22, { seed: 450 + i, color: C.inkLight });
    handText(g, t, value, x, 620, 30, { seed: 455 + i, color: on ? C.clayDk : C.ink });
    g.restore();
  }
  handText(g, t, '所有卡点 / 切镜 / 字幕，都建立在这三个数上', 1080, 745, 27, { seed: 460, color: C.inkLight });
}

// ------------------------------------------------------------- 3. beat grid
export function drawBeatGrid(g, t, o = {}) {
  const k = o.k ?? 0;
  panel(g, t, 410, 140, 1340, 670, { seed: 510, fill: C.creamLite, washColor: C.tealLt });
  handText(g, t, '把节奏变成数学：一张能逐帧比对的网格', 1080, 190, 36, { seed: 511, back: C.ochre });

  const gx = 480, gy = 250, cw = 148, ch = 76, cols = 8, rows = 4;
  const active = Math.floor((t - OFFSET) / (BEAT / 2)) % (cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c, x = gx + c * cw, y = gy + r * ch;
      const on = i === active, passed = i <= active;
      g.save();
      poly(g, RECT(x + 6, y + 6, cw - 14, ch - 14), {
        t, wobble: on ? 4.2 : 1.6, seed: 520 + i,
        fillColor: rgba(on ? C.ochre : passed ? C.tealLt : C.paper, on ? 0.78 : passed ? 0.42 : 0.72),
        ink: rgba(on ? C.clayDk : C.indigo, on ? 0.9 : 0.55), w: on ? 3.0 : 1.8,
      });
      if (on) {
        handText(g, t, '拍', x + cw / 2, y + ch / 2, 30, { seed: 530, color: C.ink });
        for (let q = 0; q < 4; q++) {
          const a = q / 4 * TAU + 0.3;
          thin(g, [[x + cw / 2 + Math.cos(a) * 30, y + ch / 2 + Math.sin(a) * 24], [x + cw / 2 + Math.cos(a) * 46, y + ch / 2 + Math.sin(a) * 38]],
            { t, seed: 535 + q, w: 2.2, color: rgba(C.clayDk, 0.75) });
        }
      } else if (passed) check(g, t, x + cw / 2, y + ch / 2, 22, 540 + i, C.teal);
      g.restore();
    }
  }
  // ruler
  thin(g, [[gx, 590], [gx + cols * cw, 590]], { t, seed: 550, w: 2, color: rgba(C.ink, 0.6) });
  const rulers = [['0.333 s', 0], ['0.667 s', 2], ['2.667 s', 4], ['5.333 s', 6], ['120.000 s', 8]];
  for (const [txt, i] of rulers) {
    const x = gx + i * cw;
    thin(g, [[x, 584], [x, 604]], { t, seed: 551 + i, w: 2.2, color: rgba(C.clayDk, 0.8) });
    handText(g, t, txt, x, 630, 22, { seed: 560 + i, color: C.inkLight });
  }
  stamp(g, t, '同一 t → 同一帧', 1480, 720, { px: 26, seed: 570, fill: C.paper, ink: C.clayDk });
  handText(g, t, '180 大拍 / 360 细分拍 / 45 小节 / 22 乐句', 760, 720, 26, { seed: 575, color: C.ink });
}

// ------------------------------------------------------------ 4. spec sheet
export function drawSpecSheet(g, t, o = {}) {
  const k = o.k ?? 0;
  panel(g, t, 410, 130, 1340, 690, { seed: 610, fill: C.creamLite, washColor: C.ochre });
  g.save();
  g.translate(1080, 470);
  g.rotate(0.012 * Math.sin(t * 0.7));
  const X = -580, Y = -280, W = 1160, H = 570;
  poly(g, RECT(X, Y, W, H), { t, wobble: 3.0, seed: 611, fillColor: rgba(C.paper, 0.92), ink: rgba(C.ink, 0.62), w: 2.4 });
  handText(g, t, '提示词 = 可验收规格，不是氛围描述', 0, Y + 48, 34, { seed: 612, color: C.clayDk });
  thin(g, [[X + 50, Y + 82], [X + W - 50, Y + 82]], { t, seed: 613, w: 2, color: rgba(C.ink, 0.55) });

  const rows = [
    ['总时长', '120.000 s'], ['画幅 / 帧率', '1920×1080 / 24 fps'],
    ['卡点误差', '±0.050 s'], ['歌词锚点', '29 条时间码'],
    ['字幕卡', '95 张 · 12 形态'], ['色板', '13 色 · 无纯黑白'],
    ['线条重绘', '12 次 / 秒'], ['禁止项', '4 组 · 单列'],
  ];
  const active = Math.floor((t - OFFSET) / BAR) % rows.length;
  for (let i = 0; i < rows.length; i++) {
    const y = Y + 128 + i * 52, on = i === active;
    if (on) softPatch(g, -30, y, 520, 30, { color: C.ochre, alpha: 0.24, rings: 2, seed: 620 + i });
    thin(g, [[X + 54, y + 26], [X + W - 54, y + 26]], { t, seed: 630 + i, w: 1.2, color: rgba(C.violet, 0.38) });
    handText(g, t, rows[i][0], X + 90, y, 25, { seed: 640 + i, align: 'left', color: C.inkLight });
    handText(g, t, rows[i][1], X + W - 90, y, 26, { seed: 650 + i, align: 'right', color: on ? C.clayDk : C.ink });
    check(g, t, X + 34, y, 18, 660 + i, C.teal);
    if (on) {
      contour(g, Array.from({ length: 18 }, (_, q) => [X + W - 270 + Math.cos(q / 18 * TAU) * (150 + (q % 3) * 4), y + Math.sin(q / 18 * TAU) * 27]),
        { t, seed: 670, w: 2.4, color: rgba(C.clayDk, 0.85), wobble: 1.6 });
    }
  }
  handText(g, t, '凡「适当 / 自然 / 好看」，一律换成数值', 0, Y + H - 28, 25, { seed: 680, color: C.clayDk });
  g.restore();
  stamp(g, t, '禁止项单列', 1560, 760, { px: 26, rot: 0.10, seed: 690, fill: C.creamLite, ink: C.clayDk });
}

// ------------------------------------------------------- 5. style boundary
export function drawBoundaryTable(g, t, o = {}) {
  const k = o.k ?? 0;
  panel(g, t, 410, 130, 1340, 690, { seed: 710, fill: C.creamLite, washColor: C.sky });
  handText(g, t, '风格基准抓原文，豁免范围写死', 1080, 182, 36, { seed: 711, back: C.ochre });

  const cols = [
    { tag: 'A', title: '必须 100% 保留', lines: ['笔触 / 平面 2D', '12 次/秒沸腾', '水彩纸纹 / 色板'], color: C.teal },
    { tag: 'B', title: '唯一豁免', lines: ['只允许画面内', '出现手绘字幕', '其余规则不变'], color: C.ochre },
    { tag: 'C', title: '明确禁止', lines: ['3D / 渐变 / 霓虹', '后期矢量字层', 'AI 感光滑渲染'], color: C.clayDk },
    { tag: 'D', title: '允许变化范围', lines: ['线条抖 1–3 px', '缩放 ≤ 1.14', '同屏 ≤ 12 元素'], color: C.indigo },
  ];
  const cw = 300, x0 = 470, y0 = 240, ch = 330;
  const active = Math.floor((t - OFFSET) / (BAR * 2)) % 4;
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * (cw + 18), on = i === active, c = cols[i];
    g.save();
    poly(g, RECT(x, y0, cw, ch), {
      t, wobble: on ? 4.0 : 2.0, seed: 720 + i,
      fillColor: rgba(on ? c.color : C.paper, on ? 0.30 : 0.72),
      ink: rgba(on ? c.color : C.inkLight, on ? 0.9 : 0.55), w: on ? 3.0 : 1.8,
    });
    contour(g, Array.from({ length: 14 }, (_, q) => [x + 42 + Math.cos(q / 14 * TAU) * 26, y0 + 48 + Math.sin(q / 14 * TAU) * 26]),
      { t, seed: 730 + i, w: 2.2, color: rgba(c.color, 0.9), wobble: 1.2 });
    handText(g, t, c.tag, x + 42, y0 + 48, 30, { seed: 735 + i, color: C.ink });
    handText(g, t, c.title, x + cw / 2, y0 + 106, 26, { seed: 740 + i, color: on ? C.clayDk : C.ink });
    for (let j = 0; j < c.lines.length; j++) {
      thin(g, [[x + 28, y0 + 152 + j * 48], [x + cw - 28, y0 + 152 + j * 48]], { t, seed: 750 + i * 4 + j, w: 1.2, color: rgba(C.violet, 0.4) });
      handText(g, t, c.lines[j], x + cw / 2, y0 + 172 + j * 48, 23, { seed: 760 + i * 4 + j, color: C.inkLight });
    }
    if (i === 1) stamp(g, t, '只豁免一件事', x + cw / 2, y0 + ch - 26, { px: 20, rot: -0.05, seed: 780, fill: C.creamLite, ink: C.clayDk });
    g.restore();
  }

  // locked palette swatches
  const sw = ['paper', 'ink', 'clay', 'clayDk', 'clayLt', 'creamLite', 'sky', 'indigo', 'violet', 'teal', 'tealLt', 'ochre', 'rose'];
  for (let i = 0; i < sw.length; i++) {
    const x = 500 + i * 98, y = 660;
    const r = 24 + (i === Math.floor((t - OFFSET) / BEAT) % sw.length ? 6 * pulse(t) : 0);
    poly(g, Array.from({ length: 12 }, (_, q) => [x + Math.cos(q / 12 * TAU) * r, y + Math.sin(q / 12 * TAU) * r]),
      { t, wobble: 1.4, seed: 790 + i, fillColor: C[sw[i]], ink: rgba(C.ink, 0.42), w: 1.4 });
  }
  handText(g, t, '13 色锁定 · 全片无纯黑纯白 · 色板之外不新增色相', 1080, 740, 26, { seed: 800, color: C.inkLight });
}

// ------------------------------------------------------------- 6. pipeline
export function drawPipeline(g, t, o = {}) {
  const k = o.k ?? 0;
  panel(g, t, 410, 130, 1340, 690, { seed: 810, fill: C.creamLite, washColor: C.tealLt });
  handText(g, t, '一次性生成做不到 120 秒精确卡点', 1080, 182, 36, { seed: 811, back: C.ochre });

  const steps = [
    ['音频 + LRC', '+ 配置'],
    ['生成数据', 'spec / cards'],
    ['逐帧渲染', '纯函数 t'],
    ['编码', 'H.264 + AAC'],
    ['验收', '26 项判据'],
  ];
  const bw = 218, bh = 108, gap = 34, x0 = 462, y0 = 285;
  const active = Math.floor((t - OFFSET) / (BAR * 1.5)) % steps.length;
  for (let i = 0; i < steps.length; i++) {
    const x = x0 + i * (bw + gap), on = i === active;
    const y = y0 + Math.sin(i * 1.1 + t * 0.8) * 5;
    g.save();
    if (on) softPatch(g, x + bw / 2, y + bh / 2, bw * 0.7, bh * 0.9, { color: C.ochre, alpha: 0.30, rings: 3, seed: 820 });
    poly(g, RECT(x, y, bw, bh), {
      t, wobble: on ? 4.2 : 2.0, seed: 825 + i,
      fillColor: rgba(on ? C.creamLite : C.paper, 0.92),
      ink: rgba(on ? C.clayDk : C.indigo, on ? 0.9 : 0.65), w: on ? 3.0 : 2.0,
    });
    handText(g, t, steps[i][0], x + bw / 2, y + 40, 26, { seed: 830 + i, color: on ? C.clayDk : C.ink });
    handText(g, t, steps[i][1], x + bw / 2, y + 76, 21, { seed: 840 + i, color: C.inkLight });
    if (i < steps.length - 1) arrow(g, t, [x + bw + 4, y + bh / 2], [x + bw + gap - 4, y + bh / 2], 850 + i);
    g.restore();
  }

  // frame counter — the honest reason a pure function matters
  const frame = Math.floor(t * FPS);
  const total = Math.round((o.duration ?? 240) * FPS);
  handText(g, t, `帧 ${String(frame).padStart(4, '0')} / ${total}`, 1080, 490, 42, { seed: 860, color: C.clayDk, back: C.ochre });
  thin(g, [[500, 530], [1660, 530]], { t, seed: 861, w: 1.6, color: rgba(C.violet, 0.4), dash: [8, 10] });

  // two identical mini frames: same t -> same picture
  for (let i = 0; i < 2; i++) {
    const x = 700 + i * 400, y = 570;
    poly(g, RECT(x, y, 300, 120), { t, wobble: 2.0, seed: 870 + i, fillColor: rgba(C.paper, 0.85), ink: rgba(C.ink, 0.6), w: 2 });
    poly(g, RECT(x + 112, y + 34, 76, 62), { t, wobble: 1.6, seed: 875 + i, fillColor: rgba(C.clay, 0.85), ink: rgba(C.ink, 0.7), w: 1.6 });
    for (let w = 0; w < 3; w++) thin(g, [[x + 20, y + 80 + w * 12], [x + 280, y + 76 + w * 12]], { t, seed: 880 + i * 3 + w, w: 1.5, color: rgba(C.teal, 0.7) });
    handText(g, t, '同一 t', x + 150, y + 110, 20, { seed: 890 + i, color: C.inkLight });
  }
  arrow(g, t, [1010, 630], [1090, 630], 895, C.clayDk, 2.0);
  handText(g, t, '逐帧可复现 · 可比对 · 可验收', 1080, 745, 27, { seed: 900, color: C.ink });
}

// ------------------------------------------------------ 7. subtitle gallery
export function drawSubtitleGallery(g, t, o = {}) {
  const k = o.k ?? 0;
  panel(g, t, 410, 130, 1340, 690, { seed: 910, fill: C.creamLite, washColor: C.rose });
  handText(g, t, '字幕是画面元素，不是字幕轨', 1080, 182, 36, { seed: 911, back: C.ochre });

  const cw = 290, ch = 118, x0 = 466, y0 = 240, cols = 4;
  const active = Math.floor((t - OFFSET) / BEAT) % 12;
  for (let i = 0; i < 12; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const x = x0 + c * (cw + 16), y = y0 + r * (ch + 14);
    const on = i === active, rot = ((ihash(i * 7) % 9) - 4) * 0.012;
    g.save();
    g.translate(x + cw / 2, y + ch / 2);
    g.rotate(rot + (on ? Math.sin(t * 4) * 0.02 : 0));
    if (on) softPatch(g, 0, 0, cw * 0.48, ch * 0.55, { color: C.ochre, alpha: 0.28, rings: 2, seed: 920 });
    const kind = i % 6;
    if (kind === 0) {
      poly(g, RECT(-cw / 2 + 8, -ch / 2 + 8, cw - 16, ch - 16), { t, wobble: 3.6, seed: 925 + i, fillColor: rgba(C.creamLite, 0.9), ink: rgba(C.ink, 0.7), w: 2 });
      handText(g, t, '字幕', 0, 0, 34, { seed: 930 + i, color: C.ink });
    } else if (kind === 1) {
      contour(g, Array.from({ length: 18 }, (_, q) => [Math.cos(q / 18 * TAU) * (cw * 0.42), Math.sin(q / 18 * TAU) * (ch * 0.36)]), { t, seed: 935 + i, w: 2.2, color: rgba(C.indigo, 0.85), wobble: 2.0 });
      handText(g, t, '字幕', 0, 0, 32, { seed: 940 + i, color: C.indigo });
    } else if (kind === 2) {
      const top = [], bot = [];
      for (let q = 0; q <= 12; q++) { const u = q / 12, xx = lerp(-cw * 0.42, cw * 0.42, u), wv = Math.sin(u * Math.PI * 2 + t * 2) * 7; top.push([xx, -26 + wv]); bot.push([xx, 26 + wv]); }
      wash(g, top.concat(bot.reverse()), { t, color: C.sky, alpha: 0.45, seed: 945 + i, edge: true, edgeW: 1.6, edgeAlpha: 0.2, blobs: 2, step: 12 });
      handText(g, t, '字幕', 0, 0, 32, { seed: 950 + i, color: C.ink });
    } else if (kind === 3) {
      poly(g, RECT(-cw * 0.34, -ch * 0.30, cw * 0.68, ch * 0.60), { t, wobble: 3.0, seed: 955 + i, fillColor: rgba(C.clayDk, 0.9), ink: rgba(C.ink, 0.7), w: 1.8 });
      handText(g, t, '字幕', 0, 0, 32, { seed: 960 + i, color: C.creamLite });
    } else if (kind === 4) {
      for (let q = 0; q < 2; q++) {
        const chars = ['字', '幕'];
        for (let j = 0; j < 2; j++) handText(g, t, chars[j], -42 + j * 84 + (noise1(j * 5 + q, i) - 0.5) * 14, (q ? 3 : -3) + (noise1(j * 7 + q, i) - 0.5) * 10, 34, { seed: 965 + i + j, color: q ? C.ochre : C.ink, rot: (noise1(j + q, i) - 0.5) * 0.18 });
      }
    } else {
      for (let j = 0; j < 2; j++) {
        const xx = -34 + j * 68;
        poly(g, [[xx - 46, -34], [xx + 44, -38], [xx + 48, 32], [xx - 42, 36]], { t, wobble: 4.0, seed: 970 + i * 2 + j, fillColor: rgba(C.paper, 0.94), ink: rgba(C.clayDk, 0.6), w: 1.5 });
        handText(g, t, j ? '幕' : '字', xx, 0, 32, { seed: 980 + i + j, color: C.ink, rot: j ? 0.14 : -0.12 });
      }
    }
    handText(g, t, `F${i + 1}`, -cw / 2 + 24, -ch / 2 + 20, 18, { seed: 990 + i, color: on ? C.clayDk : C.inkLight });
    g.restore();
  }
  handText(g, t, '位置 / 形态 / 大小 / 质感 / 出入场 五维随节拍轮换', 1080, 650, 26, { seed: 1000, color: C.ink });
  stamp(g, t, '不静态 · 不固定 · 不重复', 1080, 735, { px: 25, seed: 1005, fill: C.creamLite, ink: C.clayDk });
}

// --------------------------------------------------------- 8. before / after
export function drawBugCompare(g, t, o = {}) {
  const k = o.k ?? 0;
  panel(g, t, 410, 130, 1340, 690, { seed: 1010, fill: C.creamLite, washColor: C.clayLt });
  handText(g, t, '一个 bug，比任何形容词都更有说服力', 1080, 182, 34, { seed: 1011, back: C.ochre });

  const half = 650, x0 = 470, y0 = 245, h = 380;
  // BEFORE: banner width multiplied the font scale twice -> clipped, covers hero
  g.save();
  poly(g, RECT(x0, y0, half - 20, h), { t, wobble: 2.4, seed: 1020, fillColor: rgba(C.paper, 0.86), ink: rgba(C.ink, 0.5), w: 1.8 });
  g.beginPath(); g.rect(x0 + 6, y0 + 6, half - 32, h - 12); g.clip();
  const badW = 900 * (1 + 0.05 * Math.sin(t * 1.3));
  poly(g, RECT(x0 - 60, y0 + 150, badW, 104), { t, wobble: 5.0, seed: 1021, fillColor: rgba(C.sky, 0.75), ink: rgba(C.ink, 0.7), w: 2.4 });
  handText(g, t, 'It is a beautiful day I am running away', x0 + badW / 2 - 60, y0 + 202, 44, { seed: 1022, color: C.ink });
  poly(g, RECT(x0 + 250, y0 + 230, 110, 92), { t, wobble: 2, seed: 1023, fillColor: rgba(C.clay, 0.9), ink: rgba(C.ink, 0.8), w: 2 });
  handText(g, t, '主角被盖住', x0 + 305, y0 + 276, 22, { seed: 1024, color: C.creamLite });
  cross(g, t, x0 + half - 80, y0 + 60, 26, 1025);
  handText(g, t, '改版前：底衬重复乘了字号倍率', x0 + half / 2, y0 + h - 34, 24, { seed: 1026, color: C.clayDk });
  g.restore();

  // AFTER: three layered, readable cards clear of the hero
  g.save();
  const x1 = x0 + half + 20;
  poly(g, RECT(x1, y0, half - 20, h), { t, wobble: 2.4, seed: 1030, fillColor: rgba(C.paper, 0.86), ink: rgba(C.ink, 0.5), w: 1.8 });
  const cards = [['It is a beautiful', 0.24, C.ochre], ['day I am', 0.52, C.sky], ['running away', 0.78, C.tealLt]];
  for (let i = 0; i < 3; i++) {
    const [txt, fy, col] = cards[i];
    const y = y0 + fy * h, w = 300 + i * 40;
    poly(g, RECT(x1 + 40 + (i % 2) * 90, y - 32, w, 64), { t, wobble: 3.0, seed: 1035 + i, fillColor: rgba(col, 0.55), ink: rgba(C.ink, 0.7), w: 2 });
    handText(g, t, txt, x1 + 40 + (i % 2) * 90 + w / 2, y, 24, { seed: 1040 + i, color: C.ink });
  }
  poly(g, RECT(x1 + 400, y0 + h - 130, 100, 84), { t, wobble: 2, seed: 1045, fillColor: rgba(C.clay, 0.9), ink: rgba(C.ink, 0.8), w: 2 });
  check(g, t, x1 + half - 110, y0 + 62, 28, 1046, C.teal);
  handText(g, t, '改版后：分层清晰 · 不压主角 · 不裁切', x1 + half / 2, y0 + h - 34, 24, { seed: 1047, color: C.teal });
  g.restore();

  // brush divider sweeps left -> right as the argument is made
  const dx = x0 + half + (k - 0.5) * 60;
  brush(g, [[dx, y0 - 16], [dx + Math.sin(t * 1.6) * 6, y0 + h + 16]], { t, seed: 1050, w: 5, color: rgba(C.clayDk, 0.75), wobble: 1.4 });
  handText(g, t, '把字幕当成画面元素来验收：宽度 / 边距 / 保护区 / 可读性', 1080, 720, 25, { seed: 1055, color: C.inkLight });
}

// ------------------------------------------------------------- 9. checklist
export function drawChecklist(g, t, o = {}) {
  const k = o.k ?? 0;
  panel(g, t, 410, 130, 1340, 690, { seed: 1110, fill: C.creamLite, washColor: C.tealLt });
  handText(g, t, '验收判据先行，可机检的写进脚本', 1080, 182, 36, { seed: 1111, back: C.ochre });

  const cols = 9, rows = 3, cw = 126, ch = 108, x0 = 500, y0 = 250;
  // reveal faster than linear shot progress, and keep every slot drawn (faintly)
  // so the sheet never looks half empty
  const shown = Math.min(26, Math.max(3, Math.floor(26 * clamp(k * 1.9))));
  for (let i = 0; i < 26; i++) {
    const c = i % cols, r = Math.floor(i / cols), x = x0 + c * cw, y = y0 + r * ch;
    const on = i < shown, manual = i >= 22;
    g.save();
    if (!on) {
      contour(g, Array.from({ length: 12 }, (_, q) => [x + Math.cos(q / 12 * TAU) * 27, y + Math.sin(q / 12 * TAU) * 27]),
        { t, seed: 1190 + i, w: 1.4, color: rgba(C.violet, 0.35), wobble: 0.8 });
      handText(g, t, String(i + 1).padStart(2, '0'), x, y + 40, 16, { seed: 1195 + i, color: rgba(C.inkLight, 0.5) });
    } else if (manual) {
      softPatch(g, x, y, 40, 34, { color: C.clayDk, alpha: 0.16, rings: 2, seed: 1200 + i });
      contour(g, Array.from({ length: 14 }, (_, q) => [x + Math.cos(q / 14 * TAU) * 30, y + Math.sin(q / 14 * TAU) * 30]),
        { t, seed: 1120 + i, w: 2.2, color: rgba(C.clayDk, 0.85), wobble: 1.4 });
      handText(g, t, '人工', x, y, 20, { seed: 1150 + i, color: C.clayDk });
    } else {
      check(g, t, x, y, 34, 1120 + i, C.teal);
      handText(g, t, String(i + 1).padStart(2, '0'), x, y + 42, 17, { seed: 1160 + i, color: C.inkLight });
    }
    g.restore();
  }
  // progress bar + count-up fill the middle of the sheet
  const bx = 520, bw = 1120;
  poly(g, RECT(bx, 545, bw, 18), { t, wobble: 1.6, seed: 1205, fillColor: rgba(C.paper, 0.9), ink: rgba(C.ink, 0.4), w: 1.5 });
  if (shown > 0) poly(g, RECT(bx + 3, 548, (bw - 6) * (shown / 26), 12), { t, wobble: 1.2, seed: 1206, fillColor: rgba(C.teal, 0.75), ink: null, w: 1 });
  handText(g, t, `${String(shown).padStart(2, '0')} / 26`, 1080, 605, 46, { seed: 1172, color: C.clayDk, back: C.ochre });
  handText(g, t, '前 22 项机检', 620, 660, 24, { seed: 1170, color: C.teal });
  handText(g, t, '后 4 项人工', 1450, 660, 24, { seed: 1171, color: C.clayDk });
  thin(g, [[500, 690], [1660, 690]], { t, seed: 1173, w: 1.6, color: rgba(C.violet, 0.4), dash: [8, 10] });
  handText(g, t, '如实说明：本片只做了抽帧目视与音量 / 相关性测量，未做全片连续试看试听', 1080, 730, 24, { seed: 1174, color: C.inkLight });
  handText(g, t, '音频授权也需自行确认', 1080, 782, 24, { seed: 1175, color: C.inkLight });
}

// ---------------------------------------------------------------- 10. outro
export function drawOutro(g, t, o = {}) {
  const k = o.k ?? 0;
  panel(g, t, 410, 140, 1340, 560, { seed: 1210, fill: C.creamLite, washColor: C.ochre });
  handText(g, t, '收尾：同一机位，状态全部反转', 1080, 192, 34, { seed: 1211, back: C.ochre });

  const frames = [
    { x: 480,  label: '开场：被信号包围', full: true },
    { x: 1060, label: '结尾：信号全灭 · 飞机亮起', full: false },
  ];
  for (let i = 0; i < 2; i++) {
    const { x, label, full } = frames[i], y = 250, w = 460, h = 250;
    g.save();
    poly(g, RECT(x, y, w, h), { t, wobble: 2.4, seed: 1220 + i, fillColor: rgba(C.paper, 0.9), ink: rgba(C.ink, 0.6), w: 2.2 });
    // the same phone shape in the same spot, only its state changes
    poly(g, RECT(x + 165, y + 42, 130, 176), { t, wobble: 2.0, seed: 1225 + i, fillColor: rgba(C.clay, 0.85), ink: rgba(C.ink, 0.8), w: 2 });
    poly(g, RECT(x + 175, y + 54, 110, 140), { t, wobble: 1.4, seed: 1230 + i, fillColor: rgba(C.creamLite, 0.9), ink: rgba(C.ink, 0.5), w: 1.4 });
    for (let b = 0; b < 4; b++) {
      const bh = 12 + b * 8;
      poly(g, RECT(x + 185 + b * 22, y + 176 - bh, 15, bh), {
        t, wobble: 1.2, seed: 1235 + i * 4 + b,
        fillColor: rgba(full ? C.indigo : C.paper, full ? 0.9 : 0.4),
        ink: rgba(C.ink, 0.55), w: 1.2,
      });
    }
    if (full) {
      for (let b = 0; b < 3; b++) contour(g, Array.from({ length: 12 }, (_, q) => [x + 60 + b * 46 + Math.cos(q / 12 * TAU) * 18, y + 78 + Math.sin(q / 12 * TAU) * 15]),
        { t, seed: 1250 + b, w: 1.5, color: rgba(C.violet, 0.8) });
    } else {
      const pl = [[x + 210, y + 100], [x + 262, y + 76], [x + 234, y + 118], [x + 205, y + 112]];
      fillPoly(g, resample(pl, 5, true), rgba(C.ochre, 0.9), 1);
      contour(g, pl, { t, seed: 1260, w: 1.8, color: rgba(C.ink, 0.8), wobble: 0.5 });
      for (let q = 0; q < 3; q++) {
        const pts = [];
        for (let j = 0; j <= 14; j++) { const xx = x + 24 + (j / 14) * 412; pts.push([xx, y + 206 + q * 12 + Math.sin(xx * 0.03 + t * 1.6 + q) * 5]); }
        thin(g, pts, { t, seed: 1265 + q, w: 1.8, color: rgba(C.teal, 0.8) });
      }
    }
    handText(g, t, label, x + w / 2, y + h + 30, 22, { seed: 1270 + i, color: i ? C.teal : C.indigo });
    g.restore();
  }
  arrow(g, t, [960, 375], [1040, 375], 1280, C.clayDk, 3.0);
  handText(g, t, '状态反转，而不是另起一个新场景', 1080, 590, 26, { seed: 1281, color: C.ink });
  handText(g, t, '换歌后语义对应仍需人工决策 · 模板给的是通用叙事弧', 1080, 640, 23, { seed: 1282, color: C.inkLight });
  handText(g, t, '换个音频，重算一整支片子', 1080, 770, 48, { seed: 1283, color: C.clayDk, back: C.ochre });
}
