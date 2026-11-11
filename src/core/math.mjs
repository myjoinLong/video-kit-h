// Deterministic math, easing, hashing and noise. No state, no Math.random.
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const sat = (v) => clamp(v);
export const lerp = (a, b, f) => a + (b - a) * f;
export const invLerp = (a, b, v) => (v - a) / (b - a || 1e-9);
export const within = (a, b, v) => v >= a && v < b;

// normalized 0..1 progress of v through [a,b]
export const prog = (a, b, v) => clamp((v - a) / (b - a || 1e-9));

export const smooth = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const smoothstep = (a, b, v) => smooth(invLerp(a, b, v));
export const smootherstep = (t) => {
  t = clamp(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutSine = (t) => Math.sin((t * Math.PI) / 2);
export const easeInSine = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const easeOutBack = (t, s = 1.35) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const easeOutElastic = (t, amp = 1) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) * amp + 1;
};
// damping used for settle / weight: starts fast, eases into rest at 1
export const damped = (t, k = 6) => (t <= 0 ? 0 : 1 - Math.exp(-k * t) * (1 + k * t));

// ---- deterministic hashing ------------------------------------------------
export function ihash(n) {
  n = (n | 0) ^ 0x9e3779b9;
  n ^= n >>> 16;
  n = Math.imul(n, 0x21f0aaad);
  n ^= n >>> 15;
  n = Math.imul(n, 0x735a2d97);
  n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}
export function hash2(x, y) {
  return ihash((x | 0) * 0x27d4eb2d ^ ((y | 0) * 0x165667b1 + 0x9e3779b9));
}
export function hash3(x, y, z) {
  return ihash((x | 0) * 0x27d4eb2d ^ ((y | 0) * 0x165667b1) ^ ((z | 0) * 0x9e3779b1));
}
// stable float hash of arbitrary strings/numbers into 0..1
export function seedOf(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x9e3779b9;
  }
  return (h >>> 0) / 4294967296;
}
export function mulberry32(seed) {
  let a = (seed * 4294967296) | 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand1 = (i, seed = 0) => ihash((i | 0) * 7919 + (seed | 0) * 104729);

// smooth 1-D value noise
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(ihash(i * 374761393 + seed * 668265263), ihash((i + 1) * 374761393 + seed * 668265263), u);
}
export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const s = seed * 668265263;
  const a = ihash(xi * 374761393 + yi * 235159021 + s);
  const b = ihash((xi + 1) * 374761393 + yi * 235159021 + s);
  const c = ihash(xi * 374761393 + (yi + 1) * 235159021 + s);
  const d = ihash((xi + 1) * 374761393 + (yi + 1) * 235159021 + s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
// fractal noise 0..1
export function fbm2(x, y, seed = 0, oct = 4, gain = 0.5, lac = 2.03) {
  let s = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < oct; i++) {
    s += amp * noise2(fx, fy, seed + i * 17);
    norm += amp;
    amp *= gain;
    fx *= lac;
    fy *= lac;
  }
  return s / norm;
}

// line-boil bucket: hand-drawn reregistration runs on twos/threes, not every frame
export const BOIL_RATE = 12;
export const boil = (t, rate = BOIL_RATE) => Math.floor(t * rate + 1e-6);

// ---- timing helpers ------------------------------------------------------
export const FPS = 24;
export const frameOf = (t) => Math.round(t * FPS);
export const timeOf = (f) => f / FPS;
// sample a pure function t -> value at an earlier time (used for follow-through lag)
export const lag = (fn, t, delay) => fn(t - delay);
// cosine-driven idle breathing, 1 unit = one breath per `period` seconds
export const breathe = (t, period = 3.6, phase = 0) => Math.sin((t / period) * TAU + phase);
// clamped mass-spring settle from a step at t0 (analytic, no integration state)
export function settle(t, t0, k = 7, w = 11) {
  const dt = t - t0;
  if (dt <= 0) return 0;
  return 1 - Math.exp(-k * dt) * Math.cos(w * dt);
}
export function decayTo(t, t0, halflife) {
  const dt = Math.max(0, t - t0);
  return Math.pow(0.5, dt / halflife);
}

// vector helpers on plain [x,y] arrays
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const vmul = (a, s) => [a[0] * s, a[1] * s];
export const vlen = (a) => Math.hypot(a[0], a[1]);
export const vnorm = (a) => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};
export const vlerp = (a, b, f) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
export const vrot = (a, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
};
export const vdir = (ang, len = 1) => [Math.cos(ang) * len, Math.sin(ang) * len];
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// two-bone IK. returns middle joint position.
// a = root, b = target, l1/l2 bone lengths, bend = +1 / -1 chooses the elbow/knee side.
export function ik2(a, b, l1, l2, bend = 1) {
  let dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy);
  const dmin = Math.abs(l1 - l2) + 0.001;
  const dmax = l1 + l2 - 0.001;
  let clamped = d;
  if (d < dmin) { clamped = dmin; dx = dx / (d || 1) * dmin; dy = dy / (d || 1) * dmin; }
  else if (d > dmax) { clamped = dmax; dx = dx / (d || 1) * dmax; dy = dy / (d || 1) * dmax; }
  const base = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + clamped * clamped - l2 * l2) / (2 * l1 * clamped), -1, 1);
  const ang = Math.acos(cosA);
  const midAng = base - ang * bend;
  return {
    mid: [a[0] + Math.cos(midAng) * l1, a[1] + Math.sin(midAng) * l1],
    end: [a[0] + dx, a[1] + dy],
    reached: Math.hypot(dx, dy),
    overreach: Math.max(0, d - dmax),
  };
}
