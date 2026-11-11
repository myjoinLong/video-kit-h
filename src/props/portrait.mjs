// 9:16 infographics. NOT a squeezed 16:9 diagram — every panel is re-laid out
// for a 1080x1920 sheet in SCREEN space, using exactly the same hand-drawn
// primitives, palette, paper grain and 12 Hz boiling as the 16:9 film.
//
// An episode picks its panel by the first name in shots[].elements, so a new
// talking-head script reuses this library simply by naming a different prop.
// Unknown names fall back to a generic point list (shot.points / chapter.screen).
import { C, rgba } from '../core/palette.mjs';
import { thin, brush, contour, poly, fillPoly, resample } from '../core/ink.mjs';
import { softPatch, wash } from '../core/paint.mjs';
import { clamp, lerp, noise1, ihash, TAU } from '../core/math.mjs';
import { FPS, BEAT, BAR, OFFSET, pulse } from '../timeline/spec.mjs';
import { RECT, panel, handText, arrow, stamp, check, cross } from './explainer.mjs';

const PW = 1080, PH = 1920;
const BOX = { x: 70, y: 300, w: 940, h: 1010 };

const TITLES = {
  intro: '冷开场 · 先看结果', audio: '关键点 1 · 先拆音频', grid: '把节奏变成数学',
  spec: '关键点 2 · 规格化提示词', boundary: '关键点 3 · 风格边界',
  pipeline: '关键点 4 · 逐帧渲染', subtitle: '关键点 5 · 字幕是画面元素',
  verify: '关键点 6 · 验收判据', outro: '收尾 · 先定规格，再谈生成',
};

function head(g, t, s, o) {
  const title = s.portraitTitle || TITLES[s.scene] || s.title || '讲解';
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  handText(g, t, title, PW / 2, 168, 42, { seed: 3001, color: C.clayDk, back: C.ochre });
  handText(g, t, o.subtitle || '手绘讲解 · 逐帧可验收', PW / 2, 232, 25, { seed: 3002, color: C.inkLight });
  panel(g, t, BOX.x, BOX.y, BOX.w, BOX.h, { seed: 3003, fill: C.creamLite, washColor: C.sky });
  g.restore();
}

function foot(g, t, text, y = 1250, px = 26) {
  handText(g, t, text, PW / 2, y, px, { seed: 3099, color: C.inkLight });
}

function card(g, t, x, y, w, h, on, seed, fill = C.paper) {
  poly(g, RECT(x, y, w, h), {
    t, wobble: on ? 5 : 2.2, seed,
    fillColor: rgba(on ? C.ochre : fill, on ? 0.30 : 0.78),
    ink: rgba(on ? C.clayDk : C.inkLight, on ? 0.9 : 0.55), w: on ? 3.2 : 1.9,
  });
}

// ------------------------------------------------------------------ cold open
function pIntro(g, t, s, o) {
  const lit = Math.floor((t - OFFSET) / (BEAT * 2)) % 3;
  const labels = ['信号满格 · 被通知包围', '纸飞机飞出 · 天空打开', '主角伸手 · 与场景交互'];
  for (let i = 0; i < 3; i++) {
    const y = 360 + i * 230, on = i === lit;
    card(g, t, 120, y, 840, 190, on, 3100 + i);
    const cx = 220;
    if (i === 0) {
      for (let b = 0; b < 4; b++) {
        const bh = 20 + b * 15;
        poly(g, RECT(170 + b * 30, y + 140 - bh, 20, bh), { t, wobble: 2, seed: 3110 + b, fillColor: rgba(C.indigo, 0.85), ink: rgba(C.ink, 0.6), w: 1.3 });
      }
    } else if (i === 1) {
      const p = [[160, y + 105], [280, y + 55], [220, y + 120], [175, y + 108]];
      fillPoly(g, resample(p, 6, true), rgba(C.creamLite, 0.96), 1);
      contour(g, p, { t, seed: 3120, w: 2.4, color: rgba(C.ink, 0.85) });
    } else {
      poly(g, RECT(170, y + 55, 100, 86), { t, wobble: 2, seed: 3130, fillColor: rgba(C.clay, 0.9), ink: rgba(C.ink, 0.8), w: 2 });
      thin(g, [[270, y + 95], [330, y + 62]], { t, seed: 3131, w: 4, color: rgba(C.ink, 0.8) });
    }
    handText(g, t, labels[i], 640, y + 95, 30, { seed: 3140 + i, color: on ? C.clayDk : C.ink, align: 'center' });
  }
  const nums = ['2 分钟', '2880 帧', '95 张字幕卡'];
  for (let i = 0; i < 3; i++) {
    handText(g, t, nums[i], 230 + i * 310, 1110, 34 * (1 + 0.10 * pulse(t) * (i === lit ? 1 : 0.25)), {
      seed: 3150 + i, color: i === lit ? C.clayDk : C.ink, back: i === lit ? C.ochre : null,
    });
  }
  foot(g, t, '同一套手绘内核，也能把「怎么做」讲清楚', 1225);
}

// ------------------------------------------------------------------- waveform
function pWaveform(g, t, s, o) {
  const x0 = 140, x1 = 940, cy = 490;
  thin(g, [[x0 - 20, cy], [x1 + 20, cy]], { t, seed: 3200, w: 1.6, color: rgba(C.inkLight, 0.5), dash: [9, 11] });
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const u = i / 120;
    const env = 0.32 + 0.68 * Math.abs(Math.sin(u * Math.PI * 6.2 + 0.4)) * (0.55 + 0.45 * Math.sin(u * Math.PI * 2.1 + 1.2) ** 2);
    const a = (noise1(i * 0.9, 14) - 0.5) * 2 * env * 105 * (1 + 0.12 * pulse(t));
    pts.push([x0 + (x1 - x0) * u, cy + a]);
  }
  thin(g, pts, { t, seed: 3201, w: 2.4, color: rgba(C.indigo, 0.9), wobble: 0.8 });
  wash(g, pts.concat([[x1, cy], [x0, cy]]), { t, color: C.sky, alpha: 0.16, seed: 3202, edge: false, blobs: 3, step: 22 });
  const head = x0 + (x1 - x0) * clamp(o.k ?? 0);
  brush(g, [[head, 350], [head, 640]], { t, seed: 3203, w: 3.6, color: rgba(C.clayDk, 0.9) });
  for (let i = 0; i <= 16; i++) {
    const x = x0 + i * (x1 - x0) / 16;
    thin(g, [[x, 640], [x, x <= head ? 680 : 660]], { t, seed: 3210 + i, w: x <= head ? 2.8 : 1.5, color: rgba(x <= head ? C.clayDk : C.violet, 0.8) });
  }
  const dials = [['BPM', '90 / 180'], ['首拍相位', '0.400 s'], ['时长', '120.000 s']];
  const on = Math.floor((t - OFFSET) / (BAR * 2)) % 3;
  for (let i = 0; i < 3; i++) {
    const y = 780 + i * 145;
    card(g, t, 160, y, 760, 118, i === on, 3230 + i);
    handText(g, t, dials[i][0], 300, y + 58, 32, { seed: 3240 + i, color: C.inkLight });
    handText(g, t, dials[i][1], 720, y + 58, 36, { seed: 3250 + i, color: i === on ? C.clayDk : C.ink });
    check(g, t, 205, y + 58, 26, 3260 + i, C.teal);
  }
  foot(g, t, '所有卡点 / 切镜 / 字幕，都建立在这三个数上', 1250);
}

// ------------------------------------------------------------------- beat grid
function pBeatGrid(g, t, s, o) {
  const cols = 4, rows = 5, cw = 200, ch = 140, x0 = 120, y0 = 380;
  const active = Math.floor((t - OFFSET) / (BEAT / 2)) % (cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c, x = x0 + c * (cw + 12), y = y0 + r * (ch + 12);
      const on = i === active, passed = i <= active;
      card(g, t, x, y, cw, ch, on, 3300 + i, passed ? C.tealLt : C.paper);
      if (on) handText(g, t, '拍', x + cw / 2, y + ch / 2, 40, { seed: 3310, color: C.ink });
      else if (passed) check(g, t, x + cw / 2, y + ch / 2, 34, 3320 + i, C.teal);
      else handText(g, t, String(i + 1).padStart(2, '0'), x + cw / 2, y + ch / 2, 26, { seed: 3330 + i, color: rgba(C.inkLight, 0.7) });
    }
  }
  const rulers = [['0.333 s', 150], ['0.667 s', 360], ['2.667 s', 570], ['5.333 s', 780], ['120.000 s', 940]];
  thin(g, [[120, 1160], [960, 1160]], { t, seed: 3340, w: 2.2, color: rgba(C.ink, 0.6) });
  for (let i = 0; i < rulers.length; i++) {
    const [txt, x] = rulers[i];
    handText(g, t, txt, x, 1200, 22, { seed: 3350 + i, color: C.inkLight });
  }
  foot(g, t, '180 大拍 / 360 细分拍 / 45 小节 / 22 乐句', 1260);
}

// ------------------------------------------------------------------- spec sheet
function pSpecSheet(g, t, s, o) {
  const rows = [
    ['总时长', '120.000 s'], ['画幅 / 帧率', '1920×1080 / 24 fps'],
    ['卡点误差', '±0.050 s'], ['歌词锚点', '29 条时间码'],
    ['字幕卡', '95 张 · 12 形态'], ['色板', '13 色 · 无纯黑白'],
    ['线条重绘', '12 次 / 秒'], ['禁止项', '4 组 · 单列'],
  ];
  const active = Math.floor((t - OFFSET) / BAR) % rows.length;
  for (let i = 0; i < rows.length; i++) {
    const y = 370 + i * 105, on = i === active;
    card(g, t, 120, y, 840, 88, on, 3400 + i);
    check(g, t, 170, y + 44, 24, 3410 + i, C.teal);
    handText(g, t, rows[i][0], 340, y + 44, 30, { seed: 3420 + i, color: C.inkLight });
    handText(g, t, rows[i][1], 760, y + 44, 30, { seed: 3430 + i, color: on ? C.clayDk : C.ink });
  }
  foot(g, t, '凡「适当 / 自然 / 好看」，一律换成数值 · 禁止项单列', 1240, 25);
}

// --------------------------------------------------------------- style boundary
function pBoundary(g, t, s, o) {
  const cols = [
    { tag: 'A', title: '必须 100% 保留', lines: ['笔触 / 平面 2D', '12 次/秒沸腾', '水彩纸纹 / 色板'], color: C.teal },
    { tag: 'B', title: '唯一豁免', lines: ['只允许画面内', '出现手绘字幕', '其余规则不变'], color: C.ochre },
    { tag: 'C', title: '明确禁止', lines: ['3D / 渐变 / 霓虹', '后期矢量字层', 'AI 感光滑渲染'], color: C.clayDk },
    { tag: 'D', title: '允许变化范围', lines: ['线条抖 1–3 px', '缩放 ≤ 1.14', '同屏 ≤ 12 元素'], color: C.indigo },
  ];
  const active = Math.floor((t - OFFSET) / (BAR * 2)) % 4;
  for (let i = 0; i < 4; i++) {
    const y = 360 + i * 215, on = i === active, c = cols[i];
    card(g, t, 120, y, 840, 190, on, 3500 + i);
    contour(g, Array.from({ length: 14 }, (_, q) => [190 + Math.cos(q / 14 * TAU) * 34, y + 60 + Math.sin(q / 14 * TAU) * 34]),
      { t, seed: 3510 + i, w: 2.6, color: rgba(c.color, 0.9), wobble: 1.4 });
    handText(g, t, c.tag, 190, y + 60, 36, { seed: 3520 + i, color: C.ink });
    handText(g, t, c.title, 590, y + 48, 32, { seed: 3530 + i, color: on ? C.clayDk : C.ink });
    for (let j = 0; j < 3; j++) {
      handText(g, t, c.lines[j], 480 + j * 130, y + 120 + (j % 2) * 6, 22, { seed: 3540 + i * 3 + j, color: C.inkLight });
    }
  }
  const sw = ['paper', 'ink', 'clay', 'clayDk', 'clayLt', 'creamLite', 'sky', 'indigo', 'violet', 'teal', 'tealLt', 'ochre', 'rose'];
  for (let i = 0; i < sw.length; i++) {
    const x = 140 + i * 65, y = 1230;
    poly(g, Array.from({ length: 12 }, (_, q) => [x + Math.cos(q / 12 * TAU) * 22, y + Math.sin(q / 12 * TAU) * 22]),
      { t, wobble: 1.4, seed: 3560 + i, fillColor: C[sw[i]], ink: rgba(C.ink, 0.42), w: 1.4 });
  }
}

// --------------------------------------------------------------------- pipeline
function pPipeline(g, t, s, o) {
  const steps = [['音频 + 稿子', 'LRC / 配置'], ['生成数据', 'spec / cards'], ['逐帧渲染', '纯函数 t'], ['编码', 'H.264 + AAC'], ['验收', '26 项判据']];
  const active = Math.floor((t - OFFSET) / (BAR * 1.5)) % steps.length;
  for (let i = 0; i < steps.length; i++) {
    const y = 350 + i * 160, on = i === active;
    card(g, t, 140, y, 800, 128, on, 3600 + i);
    handText(g, t, steps[i][0], 420, y + 48, 34, { seed: 3610 + i, color: on ? C.clayDk : C.ink });
    handText(g, t, steps[i][1], 420, y + 96, 25, { seed: 3620 + i, color: C.inkLight });
    if (i < steps.length - 1) arrow(g, t, [540, y + 128], [540, y + 160], 3630 + i, C.clayDk, 2.2);
  }
  const frame = Math.floor(t * FPS), total = Math.round((o.duration ?? 240) * FPS);
  handText(g, t, `帧 ${String(frame).padStart(4, '0')} / ${total}`, 540, 1170, 40, { seed: 3640, color: C.clayDk, back: C.ochre });
  foot(g, t, '同一 t → 同一帧 · 逐帧可复现 · 可比对', 1250);
}

// -------------------------------------------------------------- subtitle gallery
function pGallery(g, t, s, o) {
  const cw = 400, ch = 230, x0 = 120, y0 = 360, cols = 2;
  const active = Math.floor((t - OFFSET) / BEAT) % 6;
  for (let i = 0; i < 6; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const x = x0 + c * (cw + 40), y = y0 + r * (ch + 30), on = i === active;
    g.save();
    g.translate(x + cw / 2, y + ch / 2);
    g.rotate(((ihash(i * 7) % 9) - 4) * 0.012);
    if (on) softPatch(g, 0, 0, cw * 0.46, ch * 0.5, { color: C.ochre, alpha: 0.3, rings: 2, seed: 3700 });
    const kind = i % 3;
    if (kind === 0) {
      poly(g, RECT(-cw / 2 + 10, -ch / 2 + 10, cw - 20, ch - 20), { t, wobble: 3.6, seed: 3710 + i, fillColor: rgba(C.creamLite, 0.9), ink: rgba(C.ink, 0.7), w: 2 });
      handText(g, t, '字幕', 0, 0, 52, { seed: 3720 + i, color: C.ink });
    } else if (kind === 1) {
      contour(g, Array.from({ length: 18 }, (_, q) => [Math.cos(q / 18 * TAU) * (cw * 0.42), Math.sin(q / 18 * TAU) * (ch * 0.36)]), { t, seed: 3730 + i, w: 2.4, color: rgba(C.indigo, 0.85), wobble: 2 });
      handText(g, t, '字幕', 0, 0, 50, { seed: 3740 + i, color: C.indigo });
    } else {
      poly(g, RECT(-cw * 0.36, -ch * 0.30, cw * 0.72, ch * 0.60), { t, wobble: 3.2, seed: 3750 + i, fillColor: rgba(C.clayDk, 0.9), ink: rgba(C.ink, 0.7), w: 1.8 });
      handText(g, t, '字幕', 0, 0, 50, { seed: 3760 + i, color: C.creamLite });
    }
    handText(g, t, `F${i + 1}`, -cw / 2 + 30, -ch / 2 + 30, 24, { seed: 3770 + i, color: on ? C.clayDk : C.inkLight });
    g.restore();
  }
  stamp(g, t, '不静态 · 不固定 · 不重复', 540, 1130, { px: 28, seed: 3780, fill: C.creamLite, ink: C.clayDk });
  foot(g, t, '位置 / 形态 / 大小 / 质感 / 出入场 五维随节拍轮换', 1230, 25);
}

// ----------------------------------------------------------------- before/after
function pBugCompare(g, t, s, o) {
  for (let i = 0; i < 2; i++) {
    const y = 360 + i * 400;
    const bad = i === 0;
    poly(g, RECT(120, y, 840, 350), { t, wobble: 2.6, seed: 3800 + i, fillColor: rgba(C.paper, 0.88), ink: rgba(C.ink, 0.55), w: 2.2 });
    if (bad) {
      g.save();
      g.beginPath(); g.rect(126, y + 6, 828, 338); g.clip();
      poly(g, RECT(60, y + 130, 980, 100), { t, wobble: 5, seed: 3810, fillColor: rgba(C.sky, 0.8), ink: rgba(C.ink, 0.7), w: 2.4 });
      handText(g, t, 'It is a beautiful day I am running away', 510, y + 180, 34, { seed: 3811, color: C.ink });
      poly(g, RECT(440, y + 220, 110, 90), { t, wobble: 2, seed: 3812, fillColor: rgba(C.clay, 0.9), ink: rgba(C.ink, 0.8), w: 2 });
      cross(g, t, 880, y + 50, 30, 3813);
      g.restore();
      handText(g, t, '改版前：底衬重复乘了字号倍率', 540, y + 320, 26, { seed: 3814, color: C.clayDk });
    } else {
      const cards = [['It is a beautiful', 90, C.ochre], ['day I am', 175, C.sky], ['running away', 260, C.tealLt]];
      for (let j = 0; j < 3; j++) {
        const [txt, dy, col] = cards[j];
        const w = 420 + j * 40;
        poly(g, RECT(150 + (j % 2) * 100, y + dy - 30, w, 62), { t, wobble: 3, seed: 3820 + j, fillColor: rgba(col, 0.55), ink: rgba(C.ink, 0.7), w: 2 });
        handText(g, t, txt, 150 + (j % 2) * 100 + w / 2, y + dy, 26, { seed: 3830 + j, color: C.ink });
      }
      check(g, t, 880, y + 50, 32, 3835, C.teal);
      handText(g, t, '改版后：分层清晰 · 不压主角 · 不裁切', 540, y + 320, 26, { seed: 3836, color: C.teal });
    }
  }
  foot(g, t, '把字幕当成画面元素来验收：宽度 / 边距 / 保护区 / 可读性', 1210, 24);
}

// -------------------------------------------------------------------- checklist
function pChecklist(g, t, s, o) {
  const k = o.k ?? 0;
  const cols = 5, rows = 6, cw = 168, ch = 118, x0 = 120, y0 = 370;
  const shown = Math.min(26, Math.max(4, Math.floor(26 * clamp(k * 1.9))));
  for (let i = 0; i < 26; i++) {
    const c = i % cols, r = Math.floor(i / cols), x = x0 + c * cw, y = y0 + r * ch;
    const on = i < shown, manual = i >= 22;
    if (!on) {
      contour(g, Array.from({ length: 12 }, (_, q) => [x + 70 + Math.cos(q / 12 * TAU) * 32, y + 48 + Math.sin(q / 12 * TAU) * 32]),
        { t, seed: 3900 + i, w: 1.4, color: rgba(C.violet, 0.35) });
      handText(g, t, String(i + 1).padStart(2, '0'), x + 70, y + 90, 18, { seed: 3910 + i, color: rgba(C.inkLight, 0.5) });
    } else if (manual) {
      contour(g, Array.from({ length: 14 }, (_, q) => [x + 70 + Math.cos(q / 14 * TAU) * 36, y + 48 + Math.sin(q / 14 * TAU) * 36]),
        { t, seed: 3920 + i, w: 2.4, color: rgba(C.clayDk, 0.85) });
      handText(g, t, '人工', x + 70, y + 48, 24, { seed: 3930 + i, color: C.clayDk });
    } else {
      check(g, t, x + 70, y + 48, 38, 3940 + i, C.teal);
      handText(g, t, String(i + 1).padStart(2, '0'), x + 70, y + 92, 18, { seed: 3950 + i, color: C.inkLight });
    }
  }
  const bx = 140, bw = 790;
  poly(g, RECT(bx, 1080, bw, 20), { t, wobble: 1.6, seed: 3960, fillColor: rgba(C.paper, 0.9), ink: rgba(C.ink, 0.4), w: 1.5 });
  if (shown > 0) poly(g, RECT(bx + 3, 1083, (bw - 6) * (shown / 26), 14), { t, wobble: 1.2, seed: 3961, fillColor: rgba(C.teal, 0.75), ink: null, w: 1 });
  handText(g, t, `${String(shown).padStart(2, '0')} / 26`, 540, 1150, 46, { seed: 3962, color: C.clayDk, back: C.ochre });
  foot(g, t, '前 22 项机检 · 后 4 项人工 · 未做全片连续试看试听', 1240, 23);
}

// ------------------------------------------------------------------------ outro
function pOutro(g, t, s, o) {
  for (let i = 0; i < 2; i++) {
    const y = 360 + i * 400, full = i === 0;
    poly(g, RECT(140, y, 800, 340), { t, wobble: 2.6, seed: 4000 + i, fillColor: rgba(C.paper, 0.9), ink: rgba(C.ink, 0.6), w: 2.2 });
    poly(g, RECT(420, y + 60, 150, 210), { t, wobble: 2, seed: 4010 + i, fillColor: rgba(C.clay, 0.85), ink: rgba(C.ink, 0.8), w: 2 });
    poly(g, RECT(432, y + 74, 126, 165), { t, wobble: 1.4, seed: 4020 + i, fillColor: rgba(C.creamLite, 0.9), ink: rgba(C.ink, 0.5), w: 1.4 });
    for (let b = 0; b < 4; b++) {
      const bh = 14 + b * 9;
      poly(g, RECT(444 + b * 25, y + 220 - bh, 17, bh), { t, wobble: 1.2, seed: 4030 + i * 4 + b, fillColor: rgba(full ? C.indigo : C.paper, full ? 0.9 : 0.4), ink: rgba(C.ink, 0.55), w: 1.2 });
    }
    if (!full) {
      const pl = [[470, y + 120], [530, y + 92], [500, y + 145], [465, y + 138]];
      fillPoly(g, resample(pl, 5, true), rgba(C.ochre, 0.9), 1);
      contour(g, pl, { t, seed: 4040, w: 2, color: rgba(C.ink, 0.8) });
      for (let q = 0; q < 3; q++) {
        const pts = [];
        for (let j = 0; j <= 12; j++) { const xx = 170 + (j / 12) * 740; pts.push([xx, y + 265 + q * 12 + Math.sin(xx * 0.03 + t * 1.6 + q) * 5]); }
        thin(g, pts, { t, seed: 4050 + q, w: 1.8, color: rgba(C.teal, 0.8) });
      }
    }
    handText(g, t, full ? '开场：被信号包围' : '结尾：信号全灭 · 飞机亮起', 540, y + 310, 26, { seed: 4060 + i, color: full ? C.indigo : C.teal });
  }
  arrow(g, t, [540, 740], [540, 775], 4070, C.clayDk, 3);
  foot(g, t, '状态反转，而不是另起一个新场景', 1190, 26);
  stamp(g, t, '换个音频，重算一整支片子', 540, 1260, { px: 26, seed: 4080, fill: C.creamLite, ink: C.clayDk });
}

// --------------------------------------------------------------- generic fallback
function pGeneric(g, t, s, o) {
  const pts = (o.points || s.points || [
    '这一章的要点一', '这一章的要点二', '这一章的要点三',
    '这一章的要点四', '这一章的要点五',
  ]).slice(0, 6);
  const n = Math.max(1, pts.length);
  for (let i = 0; i < n; i++) {
    const y = 380 + i * (780 / n);
    const on = i === Math.floor((t - OFFSET) / (BAR * 1.5)) % n;
    card(g, t, 120, y, 840, Math.min(120, 700 / n), on, 4100 + i);
    check(g, t, 180, y + Math.min(60, 350 / n), 26, 4110 + i, C.teal);
    handText(g, t, String(pts[i]), 590, y + Math.min(60, 350 / n), n > 4 ? 26 : 30, { seed: 4120 + i, color: on ? C.clayDk : C.ink });
  }
  foot(g, t, o.subtitle || '逐点讲透，不堆信息', 1240);
}

const PANELS = {
  coldOpen: pIntro, waveform: pWaveform, beatGrid: pBeatGrid, specSheet: pSpecSheet,
  boundaryTable: pBoundary, pipeline: pPipeline, subtitleGallery: pGallery,
  bugCompare: pBugCompare, checklist: pChecklist, outro: pOutro,
};

/** Screen-space 9:16 infographic. Call AFTER the camera transform is restored. */
export function drawPortraitPanel(g, t, s, o = {}) {
  const first = (s.elements || []).find((e) => typeof e === 'string' ? PANELS[e] : PANELS[e?.name]);
  const name = typeof first === 'string' ? first : first?.name;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  head(g, t, s, o);
  const fn = PANELS[name] || pGeneric;
  fn(g, t, s, { ...o, duration: o.duration ?? 240 });
  g.restore();
}

export const PORTRAIT_ELEMENTS = Object.keys(PANELS);
