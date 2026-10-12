// Product telemetry, the PrismaLens design (prismalens/prismalens#602) for a CLI: on after a
// one-time notice, and the run that shows the notice sends nothing (Homebrew's rule). Every
// property is an enum, a bucket or a boolean, and sanitize() drops anything else before a
// request is built. Never sent: repository names, paths, logins, finding text, model output.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The shared PrismaLens EU project; a public, ingest-only key meant to ship in clients.
const POSTHOG_KEY = 'phc_pCgmw347sL5wFdtsf5eTG4NEki5DyyFwHNXiyUjT5UcW';
const POSTHOG_CAPTURE_URL = 'https://eu.i.posthog.com/i/v0/e/';
const SEND_TIMEOUT_MS = 3_000;
const RECENT_MAX = 20;

export const RUN_MODES = ['npm', 'checkout'];
export const CONCLUSIONS = ['completed', 'failed', 'refused', 'cancelled'];
export const REFUSALS = ['closed', 'skip_label', 'already_reviewed', 'repo_config'];
export const COUNT_BUCKETS = ['0', '1', '2-5', '6-20', '>20'];
export const DURATION_BUCKETS = ['<1m', '1-5m', '5-15m', '>15m'];

const ALLOWED = {
  product: ['assayer'],
  engine: ['codex', 'claude-code', 'opencode'],
  conclusion: CONCLUSIONS,
  reason: REFUSALS,
  findings: COUNT_BUCKETS,
  duration_bucket: DURATION_BUCKETS,
  posted: [true, false],
  run_mode: RUN_MODES,
  build: ['release', 'dev'],
  os: ['aix', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos', 'win32'],
  arch: ['arm', 'arm64', 'ia32', 'loong64', 'mips', 'mipsel', 'ppc', 'ppc64', 'riscv64', 's390', 's390x', 'x64'],
  node_major: 'number',
};

export function sanitize(props) {
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    const allowed = ALLOWED[k];
    if (allowed === 'number') { if (Number.isInteger(v)) out[k] = v; continue; }
    if (allowed?.includes(v)) out[k] = v;
  }
  return out;
}

export function countBucket(n) {
  if (!Number.isInteger(n) || n <= 0) return '0';
  if (n === 1) return '1';
  if (n <= 5) return '2-5';
  return n <= 20 ? '6-20' : '>20';
}

export function durationBucket(ms) {
  if (!Number.isFinite(ms) || ms < 60_000) return '<1m';
  if (ms < 5 * 60_000) return '1-5m';
  return ms < 15 * 60_000 ? '5-15m' : '>15m';
}

// A global npm install runs from node_modules; anything else is someone's checkout, which the
// shared project's test-account filter drops as `build = dev`.
export function runMode(file = fileURLToPath(import.meta.url)) {
  return file.split(path.sep).includes('node_modules') ? 'npm' : 'checkout';
}

function isOff(v) { return ['off', '0', 'false'].includes(String(v ?? '').trim().toLowerCase()); }

// An automated run cannot see the notice, so CI never counts as an install.
export function forcedOff(env = process.env) {
  if (isOff(env.ASSAYER_TELEMETRY)) return true;
  const dnt = env.DO_NOT_TRACK?.trim();
  if (dnt && !isOff(dnt)) return true;
  return env.CI !== undefined && env.CI !== '';
}

const NOTICE = `assayer sends usage counts to help decide what to build next: which engine ran, whether
the round finished, bucketed finding counts and durations, OS and Node version. Never repository
names, paths, logins, code or findings. This run sends nothing.
Turn it off with \`assayer telemetry off\`, ASSAYER_TELEMETRY=off or DO_NOT_TRACK=1.`;

export function createTelemetry({
  dir = path.join(os.homedir(), '.assayer'), env = process.env, fetchImpl = fetch,
  now = () => new Date(), isTTY = Boolean(process.stderr.isTTY), version = '0.0.0',
  log = (s) => process.stderr.write(s + '\n'),
} = {}) {
  const file = path.join(dir, 'telemetry.json');
  const recentFile = path.join(dir, 'telemetry-sent.json');
  const startedAt = now().getTime();
  const pending = [];
  const read = () => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
  const write = (s) => { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(s, null, 2) + '\n'); };
  const recent = () => { try { return JSON.parse(readFileSync(recentFile, 'utf8')); } catch { return []; } };

  // The first run on a terminal shows the notice; one with no terminal records nothing, so
  // telemetry never starts unseen.
  function start() {
    if (forcedOff(env)) return;
    const s = read();
    if (s?.noticedAt || !isTTY) return;
    write({ ...s, enabled: s?.enabled ?? true, installId: s?.installId ?? randomUUID(), noticedAt: now().toISOString() });
    log(NOTICE);
  }

  function canSend(s) {
    return Boolean(s?.enabled && s.noticedAt && !forcedOff(env) && startedAt > Date.parse(s.noticedAt));
  }

  function capture(event, props = {}) {
    const s = read();
    if (!canSend(s)) return;
    const day = now().toISOString().slice(0, 10);
    const body = {
      api_key: POSTHOG_KEY, event, distinct_id: s.installId, timestamp: `${day}T00:00:00.000Z`,
      properties: {
        ...sanitize({ ...props, product: 'assayer', run_mode: runMode(), build: runMode() === 'npm' ? 'release' : 'dev', os: process.platform, arch: process.arch, node_major: Number.parseInt(process.versions.node, 10) }),
        app_version: version, $geoip_disable: true, $process_person_profile: false, $lib: 'assayer-cli', $lib_version: version,
      },
    };
    const { api_key: _key, ...shown } = body;
    try { writeFileSync(recentFile, JSON.stringify([shown, ...recent()].slice(0, RECENT_MAX), null, 2) + '\n'); } catch { /* the record is a convenience */ }
    pending.push(fetchImpl(POSTHOG_CAPTURE_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    }).catch(() => undefined));
  }

  function active() {
    const s = read();
    if (!canSend(s)) return;
    const day = now().toISOString().slice(0, 10);
    if (s.lastActiveDay === day) return;
    write({ ...s, lastActiveDay: day });
    capture('install_active');
  }

  function set(enabled) {
    const s = read();
    write({ ...s, enabled, installId: s?.installId ?? randomUUID(), noticedAt: s?.noticedAt ?? now().toISOString() });
  }

  function status() {
    const s = read();
    const state = forcedOff(env) ? 'off (forced by ASSAYER_TELEMETRY, DO_NOT_TRACK or CI)' : s?.enabled === false ? 'off' : s?.noticedAt ? 'on' : 'on after the notice on your next run in a terminal';
    const sent = recent();
    return [`telemetry: ${state}`, `recently sent (${sent.length}, newest first, ${recentFile}):`, ...sent.map((p) => `  ${JSON.stringify(p)}`)].join('\n');
  }

  // Sends are bounded by their own timeout, so waiting here costs at most SEND_TIMEOUT_MS.
  const flush = () => Promise.all(pending);

  return { start, active, capture, set, status, flush };
}
