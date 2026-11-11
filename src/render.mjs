// Single pure-function frame entry point. Nothing here knows which song is playing:
// timing comes from generated/spec.json, picture comes from each shot's
// `elements` array, style comes from the shared hand-drawn core.
import { camApply, W, H } from './core/camera.mjs';
import { VERTICAL, VX, VY, VS, SPAN, HERO_U } from './core/layout.mjs';
import { CONFIG } from './core/config.mjs';
import { drawPaper, drawGrain } from './world/paper.mjs';
import { clamp, smooth, prog, TAU } from './core/math.mjs';
import { C, rgba } from './core/palette.mjs';
import { thin } from './core/ink.mjs';
import { softPatch, wash as washPaint } from './core/paint.mjs';
import {
  FPS, DURATION, TOTAL_FRAMES, BEAT, SUB, BAR, PHRASE, OFFSET,
  pulse, subIndex, barIndex, shotAt, camAtTime, colorArc, transitionAt,
  LYRICS, SHOTS, HERO, FINAL_ANCHOR, SOFT_LANDING_AT,
} from './timeline/spec.mjs';
import { drawProps } from './timeline/props.mjs';
import { drawClawd } from './characters/clawd.mjs';
import { drawSubtitles } from './subtitles.mjs';
import { drawPortraitPanel } from './props/portrait.mjs';
import { drawTransition } from './fx/transitions.mjs';
import { actAt, heroMotion, heroView, drawInteraction } from './fx/interactions.mjs';

export { W, H };
export { SHOTS, TOTAL_FRAMES };

const P = (x, y) => [VX(x), VY(y)];
const PX = (x) => VX(x);
const PY = (y) => VY(y);

// Optional presenter placement: tutorial films put the character in a corner
// so a diagram can own the centre. Omitted -> the original centred hero, so
// every existing project renders exactly as before.
const HP = CONFIG.style?.heroPlacement;
// Per-layout presenter placement: a 9:16 sheet keeps the character low-left,
// below the portrait infographic and clear of the caption band.
const HP_USE = VERTICAL && HP?.['9x16'] ? HP['9x16'] : (HP?.x !== undefined ? HP : null);
const HERO_AT = HP_USE
  ? { x: VX(Number(HP_USE.x)), y: VY(Number(HP_USE.y)), u: Number(HP_USE.u ?? HERO_U) }
  : { x: HERO.x, y: HERO.y, u: HERO_U };
const PORTRAIT = VERTICAL && CONFIG.style?.portraitInfographics !== false;

function drawBackdrop(g, t, arc) {
  const k = barIndex(t), ph = Math.floor((t - OFFSET) / PHRASE);
  const { x0, x1, skyTop, skyBottom } = SPAN;
  if (arc.cool > 0.04) {
    const sky = [[x0, skyTop], [x1, skyTop], [x1, skyBottom], [x0, skyBottom + 60]];
    washPaint(g, sky, { t, color: C.indigo, alpha: 0.085 * arc.cool, seed: 1, edge: false, blobs: 4, step: 52 });
    washPaint(g, sky, { t, color: C.violet, alpha: 0.055 * arc.cool, seed: 2, edge: false, blobs: 3, step: 60 });
  }
  if (arc.warm > 0.04) {
    const [sx, sy] = P(1560, 210);
    softPatch(g, sx, sy, VS(880), VS(470), { color: C.ochre, alpha: 0.24 * arc.warm, rings: 3, seed: 5 });
    const sky = [[x0, skyTop], [x1, skyTop], [x1, PY(520)], [x0, PY(600)]];
    washPaint(g, sky, { t, color: C.sky, alpha: 0.16 * arc.warm, seed: 6, edge: false, blobs: 3, step: 56 });
  }
  const bx = PX(260 + (k % 6) * 300), by = PY(300 + ((k * 3) % 5) * 90);
  softPatch(g, bx, by, VS(340), VS(210), { color: ph % 2 === 0 ? C.sky : C.ochre, alpha: 0.085, rings: 2, seed: 20 + k });
  const si = subIndex(t);
  for (let i = 0; i < 3; i++) {
    const y = PY(160 + i * 300) + (si % 5) * 3, pts = [];
    for (let j = 0; j <= 8; j++) {
      const u = j / 8;
      pts.push([PX(120 + u * 1680), y + Math.sin(u * Math.PI * 2 + si * 0.24 + i) * (6 + (si % 4) * 3)]);
    }
    thin(g, pts, { t, seed: 1900 + i, w: 1.3, color: rgba(C.paperDeep, 0.42), wobble: 0.5 });
  }
}

function drawBeatRing(g, t, hero) {
  const p = pulse(t);
  if (p < 0.03) return;
  const r = 100 + (1 - p) * 95;
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * TAU + t * 0.28, pts = [];
    for (let j = 0; j <= 6; j++) {
      const a = a0 + (j / 6) * 0.52;
      pts.push([hero.x + Math.cos(a) * r, hero.y - 150 + Math.sin(a) * r * 0.55]);
    }
    thin(g, pts, { t, seed: 1800 + i, w: 2.4, color: rgba(C.ochre, 0.28 * p) });
  }
}

function lyricHit(t) {
  for (const L of LYRICS) { const d = t - L.t; if (d >= 0 && d < 0.18) return 1 - d / 0.18; }
  return 0;
}

function heroState(t, s) {
  const act = actAt(t, s.scene || 'crowded');
  const m = heroMotion(t, s, act);
  const outroSpan = Math.max(0.001, DURATION - SOFT_LANDING_AT);
  const outro = t >= SOFT_LANDING_AT ? 1 - 0.55 * smooth(clamp((t - SOFT_LANDING_AT) / outroSpan)) : 1;
  let jump = t >= FINAL_ANCHOR && s.scene === 'echo'
    ? 0.92 * Math.exp(-6.5 * (t - FINAL_ANCHOR)) : 0.25 * pulse(t);
  jump = Math.max(jump, lyricHit(t) * 0.26, m.jump * 0.7 * outro);
  const view = heroView(t, s, 'front');
  return {
    t, x: HERO_AT.x + m.dx * outro, y: HERO_AT.y, u: HERO_AT.u,
    view, mood: s.mood || 'idle', gaze: s.gaze || 0, emote: s.emote || null,
    jump, lean: m.lean * outro, alpha: 1, arms: m.arms, act, s,
  };
}

export function renderFrame(g, canvas, frame, opts = {}) {
  const t = frame / FPS;
  const s = shotAt(t);
  const cam = camAtTime(t);
  const arc = colorArc(t);
  const hero = heroState(t, s);

  drawPaper(g);
  g.save();
  camApply(g, cam);
  drawBackdrop(g, t, arc);
  drawProps(g, t, s, hero);
  if (CONFIG.style?.interactions !== false) drawInteraction(g, t, s, hero, hero.act);
  drawBeatRing(g, t, hero);
  drawClawd(g, hero);
  g.restore();

  // 9:16 films re-lay the infographic out on the sheet itself (screen space),
  // instead of squeezing the 16:9 diagram through the world-space camera.
  if (PORTRAIT) {
    drawPortraitPanel(g, t, s, {
      k: smooth(prog(s.a, s.b, t)), duration: DURATION,
      subtitle: s.portraitSubtitle, points: s.points,
    });
  }
  if (opts.subtitles !== false) drawSubtitles(g, t);
  drawTransition(g, t, transitionAt(t));
  drawGrain(g, 0.82);
  return { t, frame, shot: s.id, cam, arc };
}

export function shotInfo(frame) {
  const t = frame / FPS;
  const s = shotAt(t);
  return { frame, t: +t.toFixed(3), shot: s.id, scene: s.scene, a: s.a, b: s.b };
}
