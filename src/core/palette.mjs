// Locked 13-colour warm hand-drawn palette. No pure black, no pure white.
// 其余键是通用画笔模块（ink / paint / paper）需要的派生色别名，
// 全部在本色板内取色，不引入色板之外的新色相；无纯黑、无纯白。
export const C = {
  // ---- 锁定色（第七章）----
  paper:     '#F4EAD6',   // 纸底 cream
  ink:       '#2E2A33',   // 墨线（替代纯黑）
  clay:      '#D97757',   // 主角陶土
  clayDk:    '#B4533A',   // 陶土深 / 印章字幕底
  clayLt:    '#E9A285',   // 陶土浅
  creamLite: '#FBF3E2',   // 最亮的白（替代纯白）/ 贴纸字幕毛边
  sky:       '#A8C8DC',   // 天蓝
  indigo:    '#5A6B8C',   // 靛蓝（数字世界）
  violet:    '#8C8496',   // 灰紫噪点
  teal:      '#6FA9A0',   // 水晶海
  tealLt:    '#8FC8C0',   // 海浪高光
  ochre:     '#E8B44A',   // 暖黄 / 太阳 / 窗光
  rose:      '#D98A8A',   // 玫瑰 / 小猫帽子

  // ---- 通用画笔兼容别名（同色板内派生）----
  paperDeep: '#E6D9BE',
  paperWarm: '#F7EEDC',
  paperCool: '#E9E1D2',
  inkSoft:   '#3E3944',
  inkLight:  '#5C5666',
  grass:     '#6FA9A0',
  wood:      '#B4533A',
  woodDeep:  '#8C4530',
  warm:      '#E8B44A',
  warmSky:   '#F0D08A',
  cool:      '#8C8496',
  skin:      '#E9A285',
  skinShade: '#D97757',
  scarf:     '#E8B44A',
  shadow:    '#5A6B8C',
  white:     '#FBF3E2',
  seamLight: '#E8B44A',
  windowLight: '#F0D08A',
  warmHalo:  '#F7E4BC',
};

const hexToRgb = (h) => {
  h = h.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const rgbToHex = (r) => '#' + r.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function mix(a, b, f) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]);
}
export const shade = (hex, amount) => (amount < 0 ? mix(hex, C.ink, -amount) : mix(hex, C.paper, amount));
export const tint = (hex, other, f) => mix(hex, other, f);
export function luma(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
