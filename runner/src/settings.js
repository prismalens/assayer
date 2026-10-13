// The user's defaults in ~/.assayer/config.json. A flag beats the file, the file beats the
// built-in default. The first round on a terminal with no engine anywhere asks once and saves it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINES } from './engines.js';

// The command as the user ran it: under npx there is no `assayer` on PATH, so a hint naming it fails.
export const SELF = (process.argv[1] ?? '').includes(`${path.sep}_npx${path.sep}`) ? 'npx @prismalens/assayer' : 'assayer';

export const DEFAULT_ENGINE = 'codex';
const SEVERITIES = ['critical', 'major', 'minor'];
export const KEYS = {
  engine: (v) => (v in ENGINES ? null : `engine takes ${Object.keys(ENGINES).join(', ')}`),
  model: (v) => (v.trim() ? null : 'model needs a value'),
  'fail-on': (v) => (SEVERITIES.includes(v) ? null : `fail-on takes ${SEVERITIES.join(', ')}`),
};

// Where Assayer keeps its own state: defaults, telemetry and rounds. Engine sign-ins live elsewhere.
export const assayerHome = (env = process.env) => env.ASSAYER_HOME || path.join(os.homedir(), '.assayer');

export function settingsFile(dir = assayerHome()) {
  return path.join(dir, 'config.json');
}

export function readSettings(file = settingsFile()) {
  let s;
  try { s = JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw new Error(`${file} is not valid JSON; fix it or remove it (${e.message})`);
  }
  const out = {};
  for (const [k, v] of Object.entries(s ?? {})) if (k in KEYS && typeof v === 'string' && !KEYS[k](v)) out[k] = v;
  return out;
}

export function writeSetting(key, value, file = settingsFile()) {
  if (!(key in KEYS)) throw new Error(`unknown setting ${key}; known: ${Object.keys(KEYS).join(', ')}`);
  let raw = {};
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (value === undefined) delete raw[key];
  else {
    const bad = KEYS[key](value);
    if (bad) throw new Error(bad);
    raw[key] = value;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
  return raw;
}

// A saved model belongs to the saved engine, so it applies only when the engine came from the file.
export async function resolveDefaults(o, { settings, isTTY, pick, save, log }) {
  const r = { ...o };
  if (r.engine === null) {
    if (settings.engine) {
      r.engine = settings.engine;
      if (r.model === null && settings.model) r.model = settings.model;
    } else if (isTTY && pick) {
      r.engine = await pick();
      save('engine', r.engine);
      log(`assayer: ${r.engine} is now your default engine; change it with \`${SELF} config set engine <name>\`, or pass --engine for one round`);
    } else r.engine = DEFAULT_ENGINE;
  }
  if (r.failOn === null && settings['fail-on']) r.failOn = settings['fail-on'];
  return r;
}

export function formatSettings(settings, file = settingsFile()) {
  const keys = Object.keys(KEYS);
  const lines = keys.map((k) => `${k.padEnd(8)} ${settings[k] ?? (k === 'engine' ? `(unset; ${DEFAULT_ENGINE} without a terminal)` : '(unset)')}`);
  return [...lines, '', `from ${file}`].join('\n');
}
