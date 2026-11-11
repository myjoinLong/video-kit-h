// Data-driven timeline. Everything time-related comes from generated/spec.json,
// which `npm run prepare` rebuilds from your audio + LRC + config/project.json.
// Nothing about a particular song is hardcoded here.
import { CONFIG, readGenerated } from '../core/config.mjs';
import { clamp, smooth, lerp } from '../core/math.mjs';
import { makeCam } from '../core/camera.mjs';
import { VERTICAL, VIS_W, VX, VY, HERO_U, WORLD_CX, WORLD_CY } from '../core/layout.mjs';

const S = readGenerated('spec');

export const FPS = S.fps;
export const DURATION = S.duration;
export const TOTAL_FRAMES = FPS * DURATION;

export const SUB = S.sub;          // half-beat subdivision
export const BEAT = S.beat;        // main pulse
export const BAR = S.bar;          // 4 beats
export const PHRASE = S.phrase;    // 8 beats
export const OFFSET = S.offset;    // first downbeat phase
export const N_BEATS = S.nBeats;
export const N_SUBS = S.nSubs;
export const N_BARS = S.nBars;
export const N_PHRASES = S.nPhrases;

export const beatTime = (n) => OFFSET + BEAT * n;
export const subTime = (m) => OFFSET + SUB * m;
export const barTime = (k) => OFFSET + BAR * k;
export const phraseTime = (p) => OFFSET + PHRASE * p;
export const beatIndex = (t) => Math.floor((t - OFFSET) / BEAT + 1e-6);
export const subIndex = (t) => Math.floor((t - OFFSET) / SUB + 1e-6);
export const barIndex = (t) => Math.floor((t - OFFSET) / BAR + 1e-6);
export const beatPhase = (t) => { const u = (t - OFFSET) / BEAT; return u - Math.floor(u); };
export const subPhase = (t) => { const u = (t - OFFSET) / SUB; return u - Math.floor(u); };
export const pulse = (t) => Math.exp(-7 * beatPhase(t) * BEAT);
export const subPulse = (t) => Math.exp(-9 * subPhase(t) * SUB);
export const onBeat = (t, n) => Math.abs(t - beatTime(n)) < 0.045;

export const LYRICS = S.lyrics;
export const SHOTS = S.shots;
export const TRANSITIONS = S.transitions;
export const COLOR_ARC = S.colorArc;
export const KEYWORDS = S.keywords || [];
export const FINAL_ANCHOR = S.finalAnchor ?? (LYRICS.length ? LYRICS[LYRICS.length - 1].t : DURATION);
export const SOFT_LANDING_AT = S.softLandingAt ?? DURATION;

export function shotAt(t) {
  for (let i = 0; i < SHOTS.length; i++) if (t >= SHOTS[i].a && t < SHOTS[i].b) return SHOTS[i];
  return SHOTS[SHOTS.length - 1];
}
export const shotIndexAt = (t) => SHOTS.indexOf(shotAt(t));

export const CX = WORLD_CX, CY = WORLD_CY;   // world centre (never changes with framing)
export function camAtTime(t) {
  const s = shotAt(t);
  const u = smooth(clamp((t - s.a) / (s.b - s.a || 1)));
  let x = CX, y = CY, z = lerp(s.z0 ?? 1, s.z1 ?? 1, u);
  const span = VIS_W;
  switch (s.cam) {
    case 'drift':
      x = CX + Math.sin((t / PHRASE) * Math.PI * 2) * 9;
      y = CY + Math.cos((t / PHRASE) * Math.PI * 2) * 6;
      break;
    case 'push': case 'pull': break;
    case 'panR': x = CX + lerp(-0.075, 0.075, u) * span; break;
    case 'panL': x = CX + lerp(0.075, -0.075, u) * span; break;
    case 'follow': x = CX + lerp(-0.15, 0.15, u) * span; break;
  }
  const p = pulse(t);
  x -= 3 * p * (s.cam === 'follow' ? 1 : 0.6);
  return makeCam(x, y, z, 0);
}

export function transitionAt(t) {
  for (const tr of TRANSITIONS) {
    if (t >= tr.at && t < tr.at + tr.dur) return { ...tr, p: clamp((t - tr.at) / tr.dur) };
  }
  return null;
}
export function colorArc(t) {
  let c = COLOR_ARC[0] || { warm: 0.1, cool: 0.1, bright: 1, name: 'default' };
  for (const k of COLOR_ARC) if (t >= k.at) c = k;
  return c;
}

export const GROUND = VY(760);
export const HERO = { x: VX(960), y: GROUND, u: HERO_U };
// 1140 keeps the phone fully inside a 9:16 frame even at the 1.14 zoom maximum
export const PHONE = { x: VERTICAL ? 1140 : VX(1510), y: VY(250), w: 190, h: 320 };

export const spec = { FPS, DURATION, TOTAL_FRAMES, BEAT, SUB, BAR, PHRASE, OFFSET, ...S.meta };
