// Cross-platform handwriting fonts. Two families are registered so a font
// string can carry BOTH Latin handwriting and CJK handwriting in one stack:
//   "Kit Hand" -> Latin (Ink Free / Segoe Print / Comic Sans / ...)
//   "Kit CN"   -> Chinese (KaiTi / FangSong / Noto CJK / ...)
// If neither is found the stack degrades to a generic cursive/serif — the
// picture still renders, only the letterforms change.
import fs from 'node:fs';
import { GlobalFonts } from '@napi-rs/canvas';
import { CONFIG, resolve } from './config.mjs';

const LATIN_CANDIDATES = [
  resolve('assets/fonts/hand.ttf'),
  'C:/Windows/Fonts/Inkfree.ttf',
  'C:/Windows/Fonts/segoepr.ttf',
  'C:/Windows/Fonts/comic.ttf',
  '/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf',
  '/System/Library/Fonts/Supplemental/Chalkduster.ttf',
  '/System/Library/Fonts/Supplemental/Marker Felt.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
];

const CJK_CANDIDATES = [
  resolve('assets/fonts/hand-cn.ttf'),
  'C:/Windows/Fonts/simkai.ttf',          // 楷体 — hand-written-ish, best match for the ink style
  'C:/Windows/Fonts/simfang.ttf',         // 仿宋
  'C:/Windows/Fonts/msyh.ttc',
  '/System/Library/Fonts/PingFang.ttc',
  '/System/Library/Fonts/Supplemental/Songti.ttc',
  '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
];

function pick(candidates, explicit, family) {
  const list = explicit && explicit !== 'auto' ? [resolve(explicit)] : candidates;
  for (const f of list) {
    try {
      if (f && fs.existsSync(f) && GlobalFonts.registerFromPath(f, family)) return true;
    } catch { /* try the next candidate */ }
  }
  return false;
}

const hasLatin = pick(LATIN_CANDIDATES, CONFIG.fontFile, 'Kit Hand');
const hasCJK = pick(CJK_CANDIDATES, CONFIG.fontFileCJK, 'Kit CN');

if (!hasLatin) console.warn('[font] No Latin handwriting font found — falling back to a generic cursive. Put a .ttf in assets/fonts/hand.ttf for the intended look.');
if (!hasCJK) console.warn('[font] No CJK handwriting font found — Chinese on-screen text may fall back to a system font. Set "fontFileCJK" in config/project.json.');

export const FONT_STACK = [
  ...(hasLatin ? ['"Kit Hand"'] : []),
  ...(hasCJK ? ['"Kit CN"'] : []),
  'cursive', 'serif',
].join(', ');

export const fontOf = (px) => `${px}px ${FONT_STACK}`;
export const hasCJKFont = hasCJK;
