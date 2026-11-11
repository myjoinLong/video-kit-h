// Single source of truth for project configuration.
// Priority: CLI flag  >  environment variable  >  config/project.json  >  built-in default.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const argv = process.argv.slice(2);

export function cliArg(name, fallback = undefined) {
  const i = argv.indexOf('--' + name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
export const envArg = (name, fallback = undefined) => process.env[name] ?? fallback;

const CONFIG_PATH = cliArg('config', path.join(ROOT, 'config', 'project.json'));
export const CONFIG_FILE = path.isAbsolute(CONFIG_PATH) ? CONFIG_PATH : path.resolve(ROOT, CONFIG_PATH);

const DEFAULTS = {
  schema: 1, title: 'Untitled', audio: 'assets/audio/demo.wav',
  audioFade: { tail: 0.6 }, duration: 12, fps: 24, layout: '16x9',
  bpm: 'auto', offset: 'auto', bpmRange: [70, 190],
  lyrics: 'assets/lyrics/demo.lrc', keywords: [], shotCount: 5, shots: 'auto',
  fontFile: 'auto', out: 'out/demo.mp4',
  style: { palette: 'warm-handdrawn', boilHz: 12, softEnding: true, interactions: true, heroU: 'auto' },
  generated: {
    spec: 'generated/spec.json', cards: 'generated/subtitle-cards.json',
    grid: 'generated/beat-grid.json', report: 'generated/prepare-report.json',
  },
};

function readConfig() {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch (e) { throw new Error(`Cannot read config ${CONFIG_FILE}: ${e.message}`); }
  const c = { ...DEFAULTS, ...raw, style: { ...DEFAULTS.style, ...(raw.style || {}) }, generated: { ...DEFAULTS.generated, ...(raw.generated || {}) } };
  // CLI / env overrides for the things people change most often
  c.layout = cliArg('layout', envArg('KIT_LAYOUT', c.layout));
  c.audio = cliArg('audio', envArg('KIT_AUDIO', c.audio));
  const d = cliArg('duration', c.duration);
  c.duration = (d === 'auto' || d === '') ? 'auto' : Number(d);
  c.fps = Number(cliArg('fps', c.fps));
  c.bpm = cliArg('bpm', c.bpm);
  c.offset = cliArg('offset', c.offset);
  c.lyrics = cliArg('lyrics', c.lyrics);
  c.out = cliArg('out', c.out);
  return c;
}

export const CONFIG = readConfig();
export const resolve = (p) => path.isAbsolute(p) ? p : path.resolve(ROOT, p);
export const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

export function readGenerated(key) {
  const p = resolve(CONFIG.generated[key]);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
