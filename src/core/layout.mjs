// Frame layout. One hand-drawn world, two framings.
//   horizontal (16x9) 1920x1080 : world coordinates = screen coordinates
//   vertical   (9x16) 1080x1920 : uniform 1.25x world scale, horizontal anchors
//                                 pulled in, vertical anchors spread out.
// IMPORTANT: shapes are never non-uniformly stretched. Only anchor positions move.
import { CONFIG } from './config.mjs';

const L = String(CONFIG.layout || '16x9').toLowerCase();
export const VERTICAL = L === 'vertical' || L === '9x16' || L === 'portrait' || L === '9:16';

export const W = VERTICAL ? 1080 : 1920;
export const H = VERTICAL ? 1920 : 1080;
export const CX = W / 2;
export const CY = H / 2;
export const WORLD_CX = 960;
export const WORLD_CY = 540;
export const WSCALE = VERTICAL ? 1.25 : 1;
export const VIS_W = W / WSCALE;
export const VIS_H = H / WSCALE;

export const VX = (x) => VERTICAL ? WORLD_CX + (x - WORLD_CX) * 0.52 : x;
export const VY = (y) => VERTICAL ? WORLD_CY + (y - WORLD_CY) * 1.02 : y;
export const VS = (v) => VERTICAL ? v * 1.04 : v;
export const toScreen = (wx, wy) => [CX + WSCALE * (wx - WORLD_CX), CY + WSCALE * (wy - WORLD_CY)];

const heroCfg = CONFIG.style?.heroU;
export const HERO_U = typeof heroCfg === 'number' ? heroCfg : (VERTICAL ? 42 : 30);

export const HERO_BOX = VERTICAL
  ? { x0: 248, x1: 832, y0: 788, y1: 1272 }
  : { x0: 820, x1: 1100, y0: 500, y1: 780 };

export const SPAN = VERTICAL
  ? { x0: -120, x1: 2040, yBottom: 1560, skyTop: -520, skyBottom: 760 }
  : { x0: -200, x1: 2120, yBottom: 1100, skyTop: -120, skyBottom: 640 };

export const LAYOUT_NAME = VERTICAL ? '9x16' : '16x9';
export const layout = { VERTICAL, W, H, CX, CY, WSCALE, VIS_W, VIS_H, HERO_U, LAYOUT_NAME };
