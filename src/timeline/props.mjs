// Configurable prop dispatcher. A shot carries an `elements` array; each name
// maps to one hand-drawn prop. Adding / removing / reordering props in
// config/project.json changes the picture without touching rendering code.
import { C, rgba } from '../core/palette.mjs';
import { CONFIG } from '../core/config.mjs';
import { thin } from '../core/ink.mjs';
import { softPatch } from '../core/paint.mjs';
import { clamp, smooth, prog, lerp, TAU } from '../core/math.mjs';
import { VERTICAL, VX, VY, VS } from '../core/layout.mjs';
import { BEAT, BAR, barIndex, HERO, FINAL_ANCHOR, DURATION } from './spec.mjs';
import * as D from '../props/digital.mjs';
import * as R from '../props/realworld.mjs';
import * as E from '../props/explainer.mjs';

const P = (x, y) => [VX(x), VY(y)];
const PY = (y) => VY(y);
const PX = (x) => VX(x);
const PHX = (x) => VERTICAL ? Math.min(VX(x), 1140) : x;   // keep phones inside a 9:16 frame at max zoom
const SUN_MID = VERTICAL ? [1560, -138] : [1620, 190];      // above the upper subtitle zones
const SUN_FINALE = VERTICAL ? [1560, -60] : [1660, 120];

function phoneArgs(mode, k, base) {
  const a = { ...base };
  delete a.mode;
  switch (mode) {
    case 'side': return { x: PHX(1560), y: PY(230), ...a };
    case 'facedown': return { x: PHX(1180), y: PY(640), w: VS(150), h: VS(250), tilt: Math.PI * 0.46, ...a };
    case 'buried': return { x: PHX(1360 + k * 220), y: PY(700 + k * 80), w: VS(190 * (1 - 0.4 * k)), h: VS(320 * (1 - 0.4 * k)), ...a };
    case 'small': return { x: PHX(1500), y: PY(260), w: VS(160), h: VS(270), ...a };
    default: return a;   // uses spec.PHONE — same position in the first and last shot
  }
}

function planeArgs(o, k) {
  const x = lerp(o.x0 ?? 300, o.x1 ?? 1500, k);
  const y = lerp(o.y0 ?? 620, o.y1 ?? o.y0 ?? 620, k) - Math.sin(k * Math.PI) * (o.arc ?? 0);
  return { x: PX(x), y, scale: lerp(o.scale0 ?? 1.1, o.scale1 ?? o.scale0 ?? 1.1, k), angle: -0.14, alpha: 1 };
}

function finaleBurst(g, t, hero) {
  if (t < FINAL_ANCHOR) return;
  const q = clamp((t - FINAL_ANCHOR) / Math.max(0.001, DURATION - FINAL_ANCHOR));
  const fade = Math.pow(1 - q, 0.75);
  const hx = HERO.x, hy = HERO.y - 150;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + q * 0.06;
    thin(g, [
      [hx + Math.cos(a) * (70 + 90 * q), hy + Math.sin(a) * (50 + 70 * q)],
      [hx + Math.cos(a) * (120 + 130 * q), hy + Math.sin(a) * (90 + 100 * q)],
    ], { t, seed: 2000 + i, w: 3.2, color: rgba(C.ochre, 0.72 * fade) });
  }
  for (let i = 0; i < 3; i++) {
    const a0 = -0.9 + i * 0.9, pts = [];
    for (let j = 0; j <= 10; j++) {
      const u = j / 10, a = a0 + (u - 0.5) * (0.55 + q * 0.16);
      const r = 190 + i * 60 + q * 150 + Math.sin(t * 2.2 + i) * 3;
      pts.push([hx + Math.cos(a) * r, hy + Math.sin(a) * r * 0.62]);
    }
    thin(g, pts, { t, seed: 2040 + i, w: 2.0, color: rgba(C.teal, 0.42 * fade) });
  }
  const trail = [];
  for (let j = 0; j <= 12; j++) {
    const u = j / 12;
    trail.push([PX(1120) + 60 + q * 120 - u * 210, PY(320) + 40 - q * 100 + Math.sin(u * Math.PI * 1.6 + t * 1.7) * (8 + u * 20)]);
  }
  thin(g, trail, { t, seed: 2060, w: 2.1, color: rgba(C.ink, 0.5 * fade + 0.12), wobble: 0.8 });
}

// In 9:16 these ten infographic props are replaced by their portrait layouts
// (drawn in screen space by props/portrait.mjs); drawing both would duplicate
// and would squeeze the 16:9 diagram through the vertical camera.
const INFO_NAMES = new Set([
  'coldOpen', 'waveform', 'beatGrid', 'specSheet', 'boundaryTable',
  'pipeline', 'subtitleGallery', 'bugCompare', 'checklist', 'outro',
]);
const PORTRAIT_SKIP = VERTICAL && CONFIG.style?.portraitInfographics !== false;

/** Draw one configured prop. `ctx` = { k (0..1 shot progress), opts }. */
export function drawProp(g, t, name, s, hero, ctx = {}) {
  const k = ctx.k ?? 0, o = ctx.opts || {}, hit = hero?.act?.hit || 0;
  if (PORTRAIT_SKIP && INFO_NAMES.has(name)) return;
  switch (name) {
    case 'noise':
      D.drawStaticNoise(g, t, { count: o.decay ? Math.round((o.count ?? 30) * (1 - k)) : (o.count ?? 22 + (barIndex(t) % 2 ? 8 : -6)), alpha: o.alpha ?? 0.85, y1: PY(900), ...o.extra });
      break;
    case 'bubbles':
      D.drawNotificationBubbles(g, t, { count: o.count ?? Math.max(3, 7 - Math.floor(t / BAR)), alpha: o.alpha ?? 0.9 });
      break;
    case 'phone':
      D.drawPhone(g, t, phoneArgs(o.mode || 'default', k, o));
      break;
    case 'wind': R.drawWindLines(g, t, { count: o.count ?? 3, alpha: o.alpha ?? 0.4 }); break;
    case 'window': {
      const [x, y] = P(o.x ?? 400, o.y ?? 130);
      R.drawWindowFrame(g, t, { x, y, w: VS(o.w ?? 600), h: VS(o.h ?? 660), open: clamp(k + hit * 0.06), alpha: 0.92 });
      break;
    }
    case 'curtain': {
      const [x, y] = P(o.x ?? 400, o.y ?? 130);
      R.drawCurtain(g, t, { x, y, w: VS(600), h: VS(660), alpha: 0.9 });
      break;
    }
    case 'warmGlow': {
      const [x, y] = P(690, 440);
      softPatch(g, x, y, VS(300 + 280 * k), VS(260 + 200 * k), { color: C.ochre, alpha: 0.10 + 0.18 * k, rings: 3, seed: 9 });
      break;
    }
    case 'feed': D.drawFeedStrip(g, t, { count: o.count ?? 3, alpha: 0.85 }); break;
    case 'globe': {
      const [x, y] = P(500, 330);
      D.drawGlobe(g, t, { x, y, r: VS(110), view: Math.floor(t / (BEAT * 2)) % 4, alpha: 0.9 });
      break;
    }
    case 'satellite': {
      const [x, y] = P(1520, 150);
      D.drawSatellite(g, t, { x, y, arcs: Math.max(0, Math.round((o.arcs ?? 4) * (1 - k))), alpha: 0.9 });
      break;
    }
    case 'waves':
      R.drawWaves(g, t, { count: o.count ?? 3, baseY: PY(o.baseY ?? 880), amplitude: o.amplitude ?? 24, alpha: o.alpha ?? 0.95, colorIndex: (o.colorIndex ?? barIndex(t)) % 3 });
      break;
    case 'sun': {
      const pos = o.mode === 'finale' ? SUN_FINALE : SUN_MID;
      const [x, y] = P(pos[0], pos[1]);
      R.drawSun(g, t, { x, y, r: VS(o.r ?? (o.mode === 'finale' ? 100 : VERTICAL ? 56 : 96)), alpha: 0.95 });
      break;
    }
    case 'plane': D.drawPaperPlane(g, t, planeArgs(o, k)); break;
    case 'gulls': R.drawGulls(g, t, { count: o.count ?? 2, alpha: 0.8 }); break;
    case 'sand': R.drawBeachSand(g, t, { y: PY(o.y ?? 920), alpha: 0.85 }); break;
    case 'drinks': {
      const [x, y] = P(o.x ?? 620, o.y ?? 770);
      R.drawDrinks(g, t, { x, y: y - hit * 14, alpha: 0.95 });
      break;
    }
    case 'kids': {
      const [x, y] = P(o.x ?? 1420, o.y ?? 820);
      R.drawKids(g, t, { x, y, count: 2, alpha: 0.9 });
      break;
    }
    case 'cats': {
      const [x, y] = P(1560, 700);
      const vis = clamp(1 + Math.floor((t - s.a) / BEAT), 1, 3);
      const hats = k > 0.5 ? [true, true, true] : [false, false, true];
      R.drawCats(g, t, { x, y: y - hit * 10, visible: vis, hats, alpha: 1 });
      break;
    }
    case 'pencilHatch':
      for (let i = 0; i < 12; i++) {
        const x = PX(1180 + i * 58);
        thin(g, [[x, PY(900)], [x + 22, PY(940)]], { t, seed: 1850 + i, w: 1.2, color: rgba(C.clayDk, 0.22) });
      }
      break;
    case 'finaleBurst': finaleBurst(g, t, hero); break;

    // ---- hand-drawn infographic props (explainer / tutorial films) ----------
    // Same kernel, same palette, same 12 Hz boiling — just information-shaped
    // objects instead of story props. Add any of these names to shots[].elements.
    case 'coldOpen':        E.drawColdOpen(g, t, { ...o, k }); break;
    case 'waveform':        E.drawWaveform(g, t, { ...o, k }); break;
    case 'beatGrid':        E.drawBeatGrid(g, t, { ...o, k }); break;
    case 'specSheet':       E.drawSpecSheet(g, t, { ...o, k }); break;
    case 'boundaryTable':   E.drawBoundaryTable(g, t, { ...o, k }); break;
    case 'pipeline':        E.drawPipeline(g, t, { ...o, k, duration: DURATION }); break;
    case 'subtitleGallery': E.drawSubtitleGallery(g, t, { ...o, k }); break;
    case 'bugCompare':      E.drawBugCompare(g, t, { ...o, k }); break;
    case 'checklist':       E.drawChecklist(g, t, { ...o, k }); break;
    case 'outro':           E.drawOutro(g, t, { ...o, k }); break;
    default: break;   // unknown element names are ignored, never fatal
  }
}

/** Draw every element configured for this shot, in order. */
export function drawProps(g, t, s, hero) {
  const k = smooth(prog(s.a, s.b, t));
  const merged = { ...(s.propOpts || {}) };
  for (const entry of s.elements || []) {
    const name = typeof entry === 'string' ? entry : entry.name;
    const o = typeof entry === 'string' ? (merged[name] || {}) : { ...(merged[name] || {}), ...entry };
    drawProp(g, t, name, s, hero, { k, opts: o });
  }
}
