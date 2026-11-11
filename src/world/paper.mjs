// Paper base. Everything here is generated once per process and reused for every
// frame: the fibre never re-randomises, so the film does not shimmer. The base
// sheet is built from vector work (folks, fibres, specks) over two up-scaled noise
// fields instead of a per-pixel loop, which is both faster and less flat.
import { createCanvas } from '@napi-rs/canvas';
import { fbm2, noise2, ihash, hash2, clamp } from '../core/math.mjs';
import { C, rgba, mix } from '../core/palette.mjs';
import { W, H, VERTICAL } from '../core/layout.mjs';

export { W, H };
// 低分辨率噪声场按画幅长宽比取样，避免竖屏纸浆纹理被拉长
const NF = VERTICAL
  ? { a: [84, 150], b: [180, 320], g: [120, 213] }
  : { a: [150, 84], b: [320, 180], g: [213, 120] };

let paperCanvas = null;
let grainCanvas = null;
let vignetteCanvas = null;

// ---- small noise field rendered at low resolution and scaled up ---------------
// grayscale, mean ~= `mean`, amplitude +-`amp`. Scaled up by the caller so the
// interpolation does the smoothing for us (cheap, and it looks like pulp).
function noiseField(w, h, cx, cy, seed, oct, mean, amp) {
  const canvas = createCanvas(w, h);
  const g = canvas.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = fbm2(x * cx, y * cy, seed, oct) - 0.5;
      const v = clamp(mean + n * amp, 0, 255);
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

// long hand-made fibres, drawn once so they stay put
function drawFibres(g, n, seed) {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const y = ihash(i * 7 + seed) * H;
    const x = ihash(i * 13 + seed + 11) * W;
    const long = ihash(i * 17 + seed + 5) > 0.72;
    const len = (long ? 60 + ihash(i * 17 + 5) * 150 : 12 + ihash(i * 17 + 5) * 70);
    const a = 0.016 + ihash(i * 23 + 9) * 0.042;
    const light = i % 7 !== 0;
    g.strokeStyle = rgba(light ? '#FFF8E9' : '#BFA680', a * (long ? 1.3 : 1));
    g.lineWidth = 0.6 + ihash(i * 29 + 1) * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    const bow = (ihash(i * 31) - 0.5) * 5;
    g.quadraticCurveTo(x + len * 0.5, y + bow, x + len, y + (ihash(i * 37) - 0.5) * 7);
    g.stroke();
  }
}

// short tooth marks: the bite of a rough stock. many, very cheap
function drawTooth(g, n, seed) {
  g.lineCap = 'butt';
  for (let i = 0; i < n; i++) {
    const x = ihash(i * 11 + seed) * W;
    const y = ihash(i * 19 + seed + 3) * H;
    const len = 2 + ihash(i * 23 + seed) * 7;
    const a = 0.014 + ihash(i * 31 + seed) * 0.030;
    g.strokeStyle = i % 5 === 0 ? rgba('#B39C74', a * 1.5) : rgba('#FFF7E6', a);
    g.lineWidth = 0.5 + ihash(i * 37 + seed) * 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len * (ihash(i * 41 + seed) - 0.4), y + (ihash(i * 43 + seed) - 0.5) * 2.5);
    g.stroke();
  }
}

// a handful of dark pulp flecks: what makes the stock feel hand-made rather than
// a tinted background
function drawFlecks(g, n, seed) {
  for (let i = 0; i < n; i++) {
    const x = ihash(i * 13 + seed) * W;
    const y = ihash(i * 29 + seed + 7) * H;
    const r = 0.5 + ihash(i * 37 + seed) * 1.7;
    const dark = ihash(i * 53 + seed) > 0.55;
    g.fillStyle = rgba(dark ? '#6B5A40' : '#FBF2DE', 0.10 + ihash(i * 61 + seed) * 0.22);
    g.beginPath();
    g.ellipse(x, y, r * (1 + ihash(i * 71 + seed)), r, ihash(i * 79 + seed) * 3.14, 0, Math.PI * 2);
    g.fill();
  }
}

// warm hand-made paper: base tone, pulp mottling, fibre grain, a few flecks
export function makePaper(seed = 11) {
  const canvas = createCanvas(W, H);
  const g = canvas.getContext('2d');

  // 1. base tone, slightly lighter at the top (the sheet was lit from above)
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#F1E4CB');
  base.addColorStop(0.45, C.paper);
  base.addColorStop(1, '#E9DBC0');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // 2. warm / cool drift across the sheet: one corner bluer, the other warmer
  const drift = g.createLinearGradient(W * 0.1, 0, W * 0.9, H);
  drift.addColorStop(0, rgba('#DCD9C9', 0.55));
  drift.addColorStop(0.5, rgba('#EFE3C8', 0.0));
  drift.addColorStop(1, rgba('#F0DCB4', 0.45));
  g.fillStyle = drift;
  g.fillRect(0, 0, W, H);

  // 3. pulp mottling: a big soft field plus a finer one, both scaled up
  g.save();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.55;
  g.drawImage(noiseField(NF.a[0], NF.a[1], 0.09, 0.09, seed, 4, 252, 16), 0, 0, W, H);
  g.globalAlpha = 0.35;
  g.drawImage(noiseField(NF.b[0], NF.b[1], 0.16, 0.16, seed + 5, 3, 252, 12), 0, 0, W, H);
  g.restore();

  // 4. fibre: long strands, then the tooth of the stock
  drawFibres(g, 4200, seed);
  drawTooth(g, 9000, seed + 3);
  drawFlecks(g, 220, seed + 9);

  // 5. a few heavier fibre knots
  for (let i = 0; i < 44; i++) {
    const x = ihash(i * 17 + seed + 3) * W;
    const y = ihash(i * 23 + seed + 5) * H;
    const len = 8 + ihash(i * 31 + seed) * 34;
    g.strokeStyle = rgba('#C4A87A', 0.14 + ihash(i * 43 + seed) * 0.16);
    g.lineWidth = 1.1 + ihash(i * 47 + seed) * 1.1;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len * 0.4, y + (ihash(i * 51 + seed) - 0.5) * 6, x + len, y + (ihash(i * 53 + seed) - 0.5) * 4);
    g.stroke();
  }

  // 6. the tooth of the sheet itself: one cheap hash per pixel, which is what a
  // flat gradient is missing at 1:1
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = (row + x) * 4;
      const h = hash2(x, y);
      const h2 = hash2(x + 3301, y + 7);
      const k = 1 - (h - 0.5) * 0.055 - (h2 - 0.5) * 0.030;
      d[i] = clamp(d[i] * k, 0, 255);
      d[i + 1] = clamp(d[i + 1] * k, 0, 255);
      d[i + 2] = clamp(d[i + 2] * (k - 0.004), 0, 255);
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

// multiply-friendly grain: near white, fine tooth plus a soft cloudy unevenness.
// Generated once and reused for every frame (never re-randomised).
export function makeGrain(seed = 23) {
  const canvas = createCanvas(W, H);
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // fine tooth: one cheap hash per pixel
      const h = hash2(x, y);
      const h2 = hash2(x + 7919, y + 104729);
      const v = 250 - h * 13 - h2 * 6;
      d[i] = clamp(v, 0, 255);
      d[i + 1] = clamp(v, 0, 255);
      d[i + 2] = clamp(v * 0.994, 0, 255);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // cloudy unevenness: low resolution field scaled up
  g.save();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.55;
  g.drawImage(noiseField(NF.g[0], NF.g[1], 0.20, 0.20, seed, 3, 250, 14), 0, 0, W, H);
  g.restore();
  // a sprinkle of darker specks so the grain has something to catch on
  for (let i = 0; i < 1600; i++) {
    const x = ihash(i * 13 + seed) * W;
    const y = ihash(i * 29 + seed + 3) * H;
    g.fillStyle = rgba('#8A7A5E', 0.05 + ihash(i * 37 + seed) * 0.10);
    g.fillRect(x, y, 1 + (ihash(i * 41 + seed) > 0.85 ? 1 : 0), 1);
  }
  return canvas;
}

// warm darker border so the sheet feels lit from the middle
export function makeVignette() {
  const canvas = createCanvas(W, H);
  const g = canvas.getContext('2d');
  const R = Math.max(W, H) * 0.62;
  const grd = g.createRadialGradient(W * 0.5, H * 0.44, R * 0.45, W * 0.5, H * 0.5, R);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.55, 'rgba(88,68,40,0.025)');
  grd.addColorStop(1, 'rgba(90,70,44,0.12)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // a hint of warm light gathering in the upper middle of the sheet
  const glow = g.createRadialGradient(W * 0.5, H * 0.30, 0, W * 0.5, H * 0.34, R * 0.54);
  glow.addColorStop(0, 'rgba(255,244,220,0.055)');
  glow.addColorStop(1, 'rgba(255,244,220,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  return canvas;
}

export function paper() {
  if (!paperCanvas) paperCanvas = makePaper(11);
  return paperCanvas;
}
export function grain() {
  if (!grainCanvas) grainCanvas = makeGrain(23);
  return grainCanvas;
}
export function vignette() {
  if (!vignetteCanvas) vignetteCanvas = makeVignette();
  return vignetteCanvas;
}

export function drawPaper(g, alpha = 1) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = alpha;
  g.drawImage(paper(), 0, 0);
  g.restore();
}

// called last in the frame: unifies ink, wash and paper under one grain
export function drawGrain(g, amount = 1) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.globalAlpha = 0.78 * amount;
  g.drawImage(grain(), 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.restore();
}

export function drawVignette(g, amount = 1) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = amount;
  g.drawImage(vignette(), 0, 0);
  g.restore();
}
