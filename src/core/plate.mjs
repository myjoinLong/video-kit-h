// Offscreen plate cache. Static scenery (paper, hills, ground, stone) is painted
// once per shot framing and blitted per frame, so 6,370 frames stay cheap.
// Plates are drawn in world coordinates at a fixed scale chosen to match the
// shot's zoom, which also keeps paper grain from being re-randomised per frame.
import { createCanvas } from '@napi-rs/canvas';

const MAX_PLATES = 34;
const store = new Map();

export function plate(key, { x0, y0, x1, y1, scale = 1 }, drawWorld) {
  const hit = store.get(key);
  if (hit) {
    store.delete(key);
    store.set(key, hit); // refresh LRU order
    return hit;
  }
  const w = Math.max(1, Math.ceil((x1 - x0) * scale));
  const h = Math.max(1, Math.ceil((y1 - y0) * scale));
  const canvas = createCanvas(w, h);
  const g = canvas.getContext('2d');
  g.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
  drawWorld(g);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const entry = { canvas, x0, y0, x1, y1, scale, w, h };
  store.set(key, entry);
  while (store.size > MAX_PLATES) {
    const oldest = [...store.keys()][0];
    store.delete(oldest);
  }
  return entry;
}

// draw a cached plate into the current (camera-transformed) context
export function blit(g, p, alpha = 1) {
  if (alpha !== 1) g.globalAlpha *= alpha;
  g.drawImage(p.canvas, p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
}

export function clearPlates() {
  store.clear();
}
export function plateStats() {
  return [...store.entries()].map(([k, v]) => ({ key: k, w: v.w, h: v.h, scale: v.scale, mb: +((v.w * v.h * 4) / 1048576).toFixed(2) }));
}
export function totalPlateMB() {
  let mb = 0;
  for (const v of store.values()) mb += (v.w * v.h * 4) / 1048576;
  return +mb.toFixed(1);
}
