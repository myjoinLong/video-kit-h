// Camera: world space (px, y down) mapped to the current frame.
// Framing is authored as {x, y, zoom}; rot stays 0 — flat 2D only, never 3D.
// 画幅由 layout.mjs 决定：横屏世界坐标=屏幕坐标；竖屏统一等比放大 WSCALE。
import { W, H, CX, CY, WSCALE } from './layout.mjs';
export { W, H, CX, CY, WSCALE };

export function makeCam(x, y, zoom = 1, rot = 0) {
  return { x, y, zoom, rot };
}

export function camApply(g, cam) {
  const z = cam.zoom * WSCALE;
  const c = Math.cos(cam.rot || 0), s = Math.sin(cam.rot || 0);
  g.setTransform(z * c, z * s, -z * s, z * c, CX - z * (c * cam.x - s * cam.y), CY - z * (s * cam.x + c * cam.y));
}

export function camScreen(cam, wx, wy) {
  const z = cam.zoom * WSCALE;
  const c = Math.cos(cam.rot || 0), s = Math.sin(cam.rot || 0);
  const dx = wx - cam.x, dy = wy - cam.y;
  return [CX + z * (c * dx - s * dy), CY + z * (s * dx + c * dy)];
}

export function camWorld(cam, sx, sy) {
  const z = cam.zoom * WSCALE;
  const c = Math.cos(cam.rot || 0), s = Math.sin(cam.rot || 0);
  const dx = (sx - CX) / z, dy = (sy - CY) / z;
  return [cam.x + c * dx + s * dy, cam.y - s * dx + c * dy];
}

// visible world rectangle
export function camView(cam) {
  const hw = CX / (cam.zoom * WSCALE), hh = CY / (cam.zoom * WSCALE);
  return { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh, w: hw * 2, h: hh * 2 };
}

export function lerpCam(a, b, f) {
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    zoom: a.zoom + (b.zoom - a.zoom) * f,
    rot: (a.rot || 0) + ((b.rot || 0) - (a.rot || 0)) * f,
  };
}

// world units that equal one final-frame pixel at this zoom
export const pxOf = (cam) => 1 / cam.zoom;
// ink weight compensation: close framing keeps roughly the same drawn weight
export const weightOf = (cam) => Math.pow(1 / cam.zoom, 0.55);
