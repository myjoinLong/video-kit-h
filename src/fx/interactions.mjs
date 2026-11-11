// Character <-> scene interaction layer. Every 2–4 beats the character performs
// "anticipate -> reach -> contact -> prop reacts -> recover", locked to the grid.
// Keyed by SCENE TYPE, not by shot number, so any shot count works.
import { clamp, smooth, lerp, noise1, TAU } from '../core/math.mjs';
import { C, rgba } from '../core/palette.mjs';
import { thin, contour, fillPoly, resample } from '../core/ink.mjs';
import { BEAT, BAR, OFFSET, HERO } from '../timeline/spec.mjs';
import { HERO_U } from '../core/layout.mjs';

// Targets are in hero units (u) relative to the feet. The body occupies
// x ∈ [-5u, 5u], y ∈ [-8u, -2u] — every target MUST sit outside that box
// or the arm visually disappears into the body.
const ACTIONS = {
  crowded:       { kind: 'deflect', target: [ 8.4,  -9.4], dir:  1, period: BEAT * 2 },
  threshold:     { kind: 'push',    target: [-8.8,  -7.6], dir: -1, period: BAR },
  unplug:        { kind: 'tap',     target: [ 7.8,  -4.2], dir:  1, period: BAR },
  'signal-off':  { kind: 'cut',     target: [ 5.8, -11.4], dir:  1, period: BAR },
  release:       { kind: 'toss',    target: [ 8.8, -10.6], dir:  1, period: BEAT * 2 },
  'lift-off':    { kind: 'plant',   target: [ 7.6,  -2.6], dir:  1, period: BAR },
  'static-return':{kind: 'sweep',   target: [-9.2,  -5.4], dir: -1, period: BEAT * 2 },
  calm:          { kind: 'lift',    target: [-8.2,  -5.6], dir: -1, period: BAR },
  playful:       { kind: 'pet',     target: [ 8.6,  -4.8], dir:  1, period: BAR },
  echo:          { kind: 'release', target: [ 8.2, -10.4], dir:  1, period: BAR },

  // explainer / tutorial chapters — the character acts as a presenter pointing
  // at the diagram, so targets lean right and up rather than at story props.
  intro:         { kind: 'deflect', target: [ 8.4,  -9.4], dir:  1, period: BEAT * 2 },
  audio:         { kind: 'tap',     target: [ 8.0,  -5.2], dir:  1, period: BAR },
  spec:          { kind: 'cut',     target: [ 7.6, -10.8], dir:  1, period: BAR },
  boundary:      { kind: 'sweep',   target: [-9.2,  -5.4], dir: -1, period: BEAT * 2 },
  pipeline:      { kind: 'toss',    target: [ 8.8, -10.6], dir:  1, period: BEAT * 2 },
  subtitle:      { kind: 'lift',    target: [ 8.6,  -5.8], dir:  1, period: BAR },
  verify:        { kind: 'plant',   target: [ 7.6,  -2.6], dir:  1, period: BAR },
  outro:         { kind: 'release', target: [ 8.2, -10.4], dir:  1, period: BAR },
};
export const ACTION_LIST = ACTIONS;

export function actAt(t, scene) {
  const A = ACTIONS[scene] || ACTIONS.crowded;
  const local = (((t - OFFSET) % A.period) + A.period) % A.period;
  const u = local / A.period;
  const anticipate = smooth(clamp(u / 0.10)) * (1 - smooth(clamp((u - 0.10) / 0.06)));
  const extend = smooth(clamp((u - 0.10) / 0.26)) * (1 - smooth(clamp((u - 0.40) / 0.30)));
  const hit = Math.exp(-Math.pow((u - 0.36) / 0.052, 2));
  const settle = smooth(clamp((u - 0.36) / 0.36));
  return { ...A, scene, u, anticipate, extend, hit, settle };
}

export function heroArms(act, t) {
  const h = act.hit, restL = [-6.35, -5.5], restR = [6.35, -5.5], T = act.target;
  let L = restL, R = restR;
  switch (act.kind) {
    case 'deflect': case 'toss': case 'plant': case 'pet': case 'release': R = T; break;
    case 'push': case 'lift': L = T; break;
    case 'tap': R = T; break;
    case 'cut': L = [-T[0] * 0.72, T[1] * 1.02]; R = T; break;
    case 'sweep': L = [T[0], T[1]]; R = [-T[0], T[1] - 0.4]; break;
  }
  if (act.kind === 'toss' || act.kind === 'release') L = [-6.4, -6.4];
  const wob = (noise1(t * 12, 7) - 0.5) * 0.10;
  const blend = (rest, dst, k, s = 1) => [
    lerp(rest[0], dst[0], k) + wob * s,
    lerp(rest[1], dst[1], k) - h * 0.22 * s,
  ];
  const anti = act.anticipate * 0.55;
  let la = blend(restL, anti ? [restL[0] - act.dir * 0.5, restL[1] + 0.25] : L, anti, 1);
  let ra = blend(restR, anti ? [restR[0] - act.dir * 0.5, restR[1] + 0.25] : R, anti, -1);
  const reach = clamp(act.extend + h * 0.16);
  la = blend(la, L, reach, 1); ra = blend(ra, R, reach, -1);
  if ((act.scene === 'lift-off' || act.scene === 'echo') && act.settle > 0.4) {
    ra[0] += Math.sin(t * 8.5) * 0.55 * act.settle;
    ra[1] += Math.cos(t * 8.5) * 0.45 * act.settle;
  }
  return { l: la, r: ra };
}

export function heroMotion(t, s, act) {
  const e = act.extend, h = act.hit, d = act.dir;
  const span = Math.max(0.001, s.b - s.a);
  return {
    dx: Math.sin(((t - s.a) / BAR) * TAU) * 11 + h * 15 * d + smooth(((t - s.a) / span * 2) % 1) * 6 * d,
    lean: 0.42 * e * d + 0.16 * h * d,
    jump: 0.20 * h,
    arms: heroArms(act, t),
  };
}

export function heroView(t, s, base) {
  const u = clamp((t - s.a) / (s.b - s.a || 1));
  const q = Math.floor(((t - OFFSET) / (BAR * 2)) % 4);
  switch (s.scene) {
    case 'crowded': return u > 0.60 ? 'three' : 'front';
    case 'threshold': return u > 0.62 ? 'front' : 'three';
    case 'unplug': return ['front', 'three', 'side', 'three'][q] || 'three';
    case 'signal-off': return u > 0.55 ? 'front' : 'three';
    case 'release': return ['front', 'three', 'front', 'front'][q] || 'front';
    case 'lift-off': return u > 0.55 ? 'front' : 'three';
    case 'static-return': return u > 0.50 ? 'three' : 'front';
    case 'calm': return ['three', 'front', 'three', 'front'][q] || 'three';
    case 'playful': return u > 0.5 ? 'front' : 'three';
    case 'echo': return u > 0.55 ? 'three' : 'front';
    default: return base;
  }
}

const arcPts = (a, b, bow, n = 12) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    pts.push([lerp(a[0], b[0], k) + Math.sin(k * Math.PI) * bow * 0.35,
              lerp(a[1], b[1], k) - Math.sin(k * Math.PI) * bow]);
  }
  return pts;
};

export function drawContactMark(g, t, x, y, hit, kind, scale = 1) {
  if (hit < 0.02) return;
  g.save(); g.globalAlpha *= clamp(hit); g.translate(x, y); g.scale(scale, scale);
  const n = kind === 'cut' ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.24 + kind.length * 0.07;
    const r0 = 15 + (i % 3) * 5, r1 = r0 + 15 + hit * 12;
    thin(g, [[Math.cos(a) * r0, Math.sin(a) * r0], [Math.cos(a) * r1, Math.sin(a) * r1]],
      { t, seed: 2100 + i, w: 2.2, color: rgba(C.ochre, 0.85), wobble: 0.6 });
  }
  contour(g, Array.from({ length: 12 }, (_, i) => [
    Math.cos((i / 12) * TAU) * (10 + hit * 9), Math.sin((i / 12) * TAU) * (10 + hit * 9),
  ]), { t, seed: 2120, w: 1.6, color: rgba(C.clayDk, 0.8), wobble: 0.5 });
  g.restore();
}

export function drawInteraction(g, t, s, hero, act) {
  const u = hero.u || HERO_U;
  const A = act;
  const shoulder = [hero.x + A.dir * 4.85 * u, hero.y - 4.6 * u];
  const target = [hero.x + A.target[0] * u, hero.y + A.target[1] * u];

  if (A.extend > 0.04) {
    const pts = arcPts(shoulder, target, 22, 12);
    const n = Math.max(2, Math.floor(pts.length * A.extend));
    g.save(); g.globalAlpha *= 0.16 * A.extend;
    thin(g, pts.slice(0, n), { t, seed: 2200 + s.id, w: 1.4, color: rgba(C.violet, 0.8), wobble: 0.7 });
    g.restore();
  }
  drawContactMark(g, t, target[0], target[1], A.hit, A.kind, u / 30);

  const k = A.hit, after = A.settle;
  g.save(); g.globalAlpha *= clamp(k * 0.9 + 0.12 * after);
  switch (A.kind) {
    case 'deflect': {
      const bx = target[0] + 26 + after * 150, by = target[1] - after * 120, r = 15 * (1 - after * 0.5);
      if (r > 2) {
        const q = [[bx - r * 1.5, by - r], [bx + r * 1.4, by - r], [bx + r * 1.6, by + r], [bx - r * 1.4, by + r]];
        fillPoly(g, resample(q, 8, true), rgba(C.creamLite, 0.9), 1);
        contour(g, q, { t, seed: 2220, w: 1.5, color: rgba(C.indigo, 0.8), wobble: 0.6 });
      }
      break;
    }
    case 'push': case 'lift':
      thin(g, arcPts([target[0] - 40, target[1] + 30], [target[0] + 46, target[1] - 34 - after * 26], 18, 10),
        { t, seed: 2230, w: 2.4, color: rgba(C.teal, 0.75), wobble: 0.8 });
      break;
    case 'tap': case 'plant':
      for (let i = 0; i < 2; i++) {
        const rr = 12 + i * 11 + k * 8;
        contour(g, Array.from({ length: 12 }, (_, j) => [
          target[0] + Math.cos((j / 12) * TAU) * rr, target[1] + Math.sin((j / 12) * TAU) * rr * 0.55,
        ]), { t, seed: 2240 + i, w: 1.6, color: rgba(C.clayDk, 0.7), wobble: 0.5 });
      }
      break;
    case 'cut':
      for (let i = 0; i < 4; i++) {
        const dx = (i - 1.5) * 26 + (i % 2 ? 1 : -1) * after * 34;
        thin(g, [[target[0] + dx - 9, target[1] + 8], [target[0] + dx + 9, target[1] + 2]],
          { t, seed: 2250 + i, w: 2.2, color: rgba(C.indigo, 0.75) });
      }
      break;
    case 'sweep':
      for (const sgn of [-1, 1]) {
        thin(g, arcPts([hero.x + sgn * 2.2 * u, hero.y - 5.2 * u], [hero.x + sgn * 9.2 * u, hero.y - 6.6 * u], 34, 10),
          { t, seed: 2260 + sgn, w: 2.6, color: rgba(C.tealLt, 0.8), wobble: 0.9 });
      }
      break;
    case 'pet':
      for (let i = 0; i < 3; i++) {
        thin(g, [[target[0] - 12 + i * 12, target[1] - 12], [target[0] - 8 + i * 12, target[1] - 24 - k * 6]],
          { t, seed: 2270 + i, w: 1.8, color: rgba(C.clayDk, 0.7) });
      }
      break;
    case 'toss': case 'release':
      thin(g, arcPts(shoulder, [target[0] + 40 + after * 120, target[1] - 60 - after * 70], 52, 14),
        { t, seed: 2280, w: 2.0, color: rgba(C.ink, 0.55), wobble: 0.8 });
      break;
  }
  g.restore();
}
