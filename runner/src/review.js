#!/usr/bin/env node
// `assayer review owner/repo#N`: one review round on this machine, on the operator's own engine
// sign-in, then (with --post) the findings on the pull request under the operator's own gh login.
// No control plane: identity follows where the round runs (#184, 2026-10-11 decision).
// `assayer publish <dir>` posts, or resumes posting, a round that already ran.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINES, codexSandboxModeSet } from './engines.js';
import { countBucket, createTelemetry, durationBucket } from './telemetry.js';
import { doctor, formatDoctor } from './doctor.js';
import { renderPrompt, renderCodexPrompt, promptHash, laneTokens } from './prompt.js';
import { checkout } from './github.js';
import { runRound } from './run.js';
import { LIVENESS_PREFIX, postRound, withoutEngineCredit } from './poster.js';
import { changedFiles, chooseBase, localCheckout, refusal as localRefusal, repoTop, sameTree, severityOf, snapshot, git as localGit } from './local.js';

export { severityOf };
import { hookCommand } from './hook.js';
import { startProgress } from './progress.js';
import { LABELS, missingFor, offerSetup, setupHint } from './setup.js';
import { KEYS, assayerHome, formatSettings, readSettings, resolveDefaults, writeSetting } from './settings.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = `usage:
  assayer review <owner/repo#N | PR URL> [--engine E] [--model M] [--post] [--again]
                 [--fail-on critical|major|minor] [--full] [--ignore-repo-config] [--out DIR]
  assayer review [--base REF] [--head REV] [--engine E] [--model M]
                 [--fail-on critical|major|minor] [--ignore-repo-config] [--out DIR]
                                                         reviews local changes, prints only
  assayer config [set <key> <value> | unset <key>]       engine, model, fail-on defaults
  assayer hook install|uninstall
  assayer publish <round dir or name>
  assayer telemetry on|off|status
  assayer doctor
  assayer --version`;


export function parseTarget(s) {
  const m = /^(?:https:\/\/github\.com\/)?([\w.-]+\/[\w.-]+)(?:#|\/pull\/)(\d+)\/?$/.exec(String(s ?? '').trim());
  if (!m) throw new Error(`cannot read ${JSON.stringify(s)} as owner/repo#N or a pull request URL`);
  return { repo: m[1], pr: Number(m[2]) };
}

export function parseArgs(argv) {
  const [cmd, target, ...rest] = argv;
  if ((cmd === 'doctor' || cmd === '--version') && target === undefined) return { cmd };
  if (cmd === 'telemetry') {
    if (!['on', 'off', 'status'].includes(target) || rest.length) throw new Error(USAGE);
    return { cmd, action: target };
  }
  if (cmd === 'config') {
    if (target === undefined) return { cmd, action: 'show' };
    if (target === 'set' && rest.length === 2 && rest[0] in KEYS) return { cmd, action: 'set', key: rest[0], value: rest[1] };
    if (target === 'unset' && rest.length === 1 && rest[0] in KEYS) return { cmd, action: 'unset', key: rest[0] };
    throw new Error(`assayer config [set <key> <value> | unset <key>]; keys: ${Object.keys(KEYS).join(', ')}`);
  }
  if (cmd === 'publish') {
    if (!target || rest.length) throw new Error(USAGE);
    return { cmd, dir: target };
  }
  if (cmd === 'hook') {
    if (!['install', 'uninstall', 'pre-push'].includes(target)) throw new Error(USAGE);
    return { cmd, action: target, args: rest };
  }
  if (cmd === 'review' && (target === undefined || target.startsWith('--'))) return parseLocal(target === undefined ? [] : [target, ...rest]);
  if (cmd !== 'review' || !target) throw new Error(USAGE);
  const o = { cmd, ...parseTarget(target), engine: null, model: null, post: false, again: false, ignoreRepoConfig: false, out: null, failOn: null, full: false };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    const need = () => { const v = rest[i + 1]; if (v === undefined) throw new Error(`${a} needs a value`); i += 1; return v; };
    if (a === '--engine') o.engine = need();
    else if (a === '--model') o.model = need();
    else if (a === '--post') o.post = true;
    else if (a === '--again') o.again = true;
    else if (a === '--ignore-repo-config') o.ignoreRepoConfig = true;
    else if (a === '--out') o.out = need();
    else if (a === '--fail-on') o.failOn = need();
    else if (a === '--full') o.full = true;
    else throw new Error(`unknown argument ${a}\n${USAGE}`);
  }
  checkEngine(o.engine);
  if (o.failOn !== null && !SEVERITIES.includes(o.failOn)) throw new Error(`--fail-on takes ${SEVERITIES.join(', ')}`);
  return o;
}

function checkEngine(engine) {
  if (engine !== null && !(engine in ENGINES)) throw new Error(`unknown engine ${engine}; known: ${Object.keys(ENGINES).join(', ')}`);
}

export const SEVERITIES = ['critical', 'major', 'minor'];

function parseLocal(rest) {
  const o = { cmd: 'review', local: true, engine: null, model: null, base: null, head: null, failOn: null, ignoreRepoConfig: false, out: null };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    const need = () => { const v = rest[i + 1]; if (v === undefined) throw new Error(`${a} needs a value`); i += 1; return v; };
    if (a === '--base') o.base = need();
    else if (a === '--head') o.head = need();
    else if (a === '--engine') o.engine = need();
    else if (a === '--model') o.model = need();
    else if (a === '--fail-on') o.failOn = need();
    else if (a === '--ignore-repo-config') o.ignoreRepoConfig = true;
    else if (a === '--out') o.out = need();
    else if (a === '--post' || a === '--again') throw new Error(`${a} needs a pull request; a local review prints only\n${USAGE}`);
    else throw new Error(`unknown argument ${a}\n${USAGE}`);
  }
  checkEngine(o.engine);
  if (o.failOn !== null && !SEVERITIES.includes(o.failOn)) throw new Error(`--fail-on takes ${SEVERITIES.join(', ')}`);
  return o;
}

function gh(args, { allow404 = false } = {}) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`gh is not available: ${r.error.message}`);
  if (r.status !== 0) {
    if (allow404 && /HTTP 404/.test(r.stderr)) return null;
    throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${r.stderr.trim().split('\n')[0]}`);
  }
  return r.stdout;
}

const ghJson = (p, opts) => { const s = gh(['api', p], opts); return s === null ? null : JSON.parse(s); };

// Every liveness comment on the PR with a parsed marker, oldest first.
export function livenessRecords(comments) {
  const out = [];
  for (const c of comments) {
    if (typeof c?.body !== 'string' || !c.body.startsWith(LIVENESS_PREFIX)) continue;
    const head = c.body.split('\n')[0];
    const field = (k) => (new RegExp(`\\b${k}=(\\S+)`).exec(head)?.[1] ?? null);
    out.push({
      id: c.id, login: c.user?.login ?? null, bot: c.user?.type === 'Bot',
      rounds: Number(field('rounds')) || 0, sha: field('sha'), engine: field('engine')?.replace(/-->$/, '') ?? null,
      reviewed: /: reviewed `/.test(c.body),
    });
  }
  return out;
}

// A head already reviewed by this engine, vouched for by an App or by someone who can write
// here, is not run again unless asked (OBJ-001). Association is not write access, so a person
// is checked through `canWrite(login)`, the effective permission. Returns the blocking record.
export function priorReview(records, { headSha, engine, canWrite }) {
  return records.find((r) => r.reviewed && r.sha === headSha && r.engine === engine && (r.bot || canWrite(r.login))) ?? null;
}

function writerCheck(repo) {
  const cache = new Map();
  return (login) => {
    if (!login || !/^[A-Za-z0-9-]+$/.test(login)) return false;
    if (!cache.has(login)) {
      const perm = gh(['api', `repos/${repo}/collaborators/${login}/permission`, '--jq', '.permission'], { allow404: true });
      cache.set(login, perm !== null && ['admin', 'write'].includes(perm.trim()));
    }
    return cache.get(login);
  };
}

function listComments(repo, pr) {
  const s = gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${pr}/comments?per_page=100`]);
  return JSON.parse(s).flat();
}

function renderFor(engine, { repo, pr, baseSha, headSha }) {
  const row = ENGINES[engine];
  const tpl = readFileSync(path.join(HERE, '..', 'prompt', row.promptTemplate ?? 'template.md'), 'utf8');
  const text = row.promptTemplate
    ? renderCodexPrompt(tpl, { repo, pr, baseSha, headSha })
    : renderPrompt(tpl, laneTokens({ repo, pr, level: 'high', mode: 'review' }));
  return { text, hash: promptHash(tpl) };
}

export function fileJournal(dir) {
  const file = path.join(dir, 'publish-journal.jsonl');
  const seen = new Map();
  if (existsSync(file)) {
    const text = readFileSync(file, 'utf8');
    for (const l of text.split('\n').filter(Boolean)) {
      try { const e = JSON.parse(l); seen.set(e.key, e.id); } catch { /* a torn last line is a write that never finished */ }
    }
    // Close a torn tail so the next record starts on its own line instead of joining it.
    if (text && !text.endsWith('\n')) appendFileSync(file, '\n');
  }
  return { has: (k) => seen.has(k), record: (k, id) => { seen.set(k, id); appendFileSync(file, JSON.stringify({ key: k, id, at: new Date().toISOString() }) + '\n'); } };
}

// Findings the runner lost before they became events. A corrupt tool-log line may have been
// one, so it counts as withheld rather than letting the verdict say "no findings" (OBJ-005).
export function withheldCount(summary) {
  const dropped = (summary.dropped ?? []).filter((d) => d.tool === 'create_inline_comment' || /finding/i.test(d.why ?? '')).length;
  return dropped + (summary.tool_log_corrupt_lines ?? 0);
}

// GitHub through a flaky network: a read is retried on any network error or a 502/503/504; a
// write only when the connection never opened, since a write that reached GitHub must not repeat.
const NEVER_CONNECTED = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'ENETUNREACH']);
export function retryingFetch(inner = globalThis.fetch, { tries = 3, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  return async (url, init = {}) => {
    const read = (init.method ?? 'GET') === 'GET';
    for (let i = 1; ; i += 1) {
      try {
        const res = await inner(url, init);
        if (read && i < tries && [502, 503, 504].includes(res.status)) { await wait(1000 * 3 ** (i - 1)); continue; }
        return res;
      } catch (e) {
        if (i >= tries || !(read || NEVER_CONNECTED.has(e?.cause?.code))) throw e;
        await wait(1000 * 3 ** (i - 1));
      }
    }
  };
}

export async function publish(dir, opts = {}) {
  try {
    return await publishOnce(dir, { ...opts, fetch: retryingFetch(opts.fetch ?? globalThis.fetch) });
  } catch (e) {
    if (e?.message !== 'fetch failed') throw e;
    throw new Error(`could not reach GitHub (${e.cause?.code ?? e.cause?.message ?? 'network error'}). What was posted is recorded; \`assayer publish ${path.basename(dir)}\` posts the rest`);
  }
}

async function publishOnce(dir, { log = (s) => process.stderr.write(s + '\n'), fetch = globalThis.fetch, token = null, login = null } = {}) {
  const round = JSON.parse(readFileSync(path.join(dir, 'round.json'), 'utf8'));
  if (round.mode === 'local') throw new Error('a local round has nothing to post to; push and review the pull request');
  const events = readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const finished = events.findLast((e) => e.type === 'finished');
  // A round that did not complete has nothing to stand on; posting its liveness would
  // overwrite a standing verdict with a failure (principle 14, OBJ-004).
  if (finished?.conclusion !== 'completed') throw new Error(`the round ended ${finished?.conclusion ?? 'without finishing'}; nothing to publish`);
  token ??= gh(['auth', 'token']).trim();
  // The login the comments will carry is the token's own, not whichever account gh has active.
  login ??= (await (await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } })).json()).login;
  if (typeof login !== 'string') throw new Error('could not read the login of the publishing token');
  const live = livenessRecords(listComments(round.repository, round.pr_number)).filter((r) => r.login === login);
  const rounds = Math.max(0, ...live.map((r) => r.rounds)) + 1;
  // Findings on an older head still land (GitHub shows them outdated); the verdict line does
  // not, or it would replace a newer head's verdict.
  const summary = JSON.parse(readFileSync(path.join(dir, 'summary.json'), 'utf8'));
  const headNow = () => ghJson(`repos/${round.repository}/pulls/${round.pr_number}`).head.sha;
  const current = headNow();
  const r = await postRound({
    fetch, token, appLogin: login, job: round, events, rounds, journal: fileJournal(dir), engineLiveness: true,
    engineDropped: withheldCount(summary),
    skipLiveness: current !== round.head_sha,
    // Asked again just before the verdict line, since posting the findings takes a while.
    livenessStillCurrent: async () => headNow() === round.head_sha,
  });
  log(`assayer: posted ${r.inline} inline, ${r.unplaced} as comments, ${r.refused - r.unplaced} dropped, summary ${r.summary ? 'posted' : 'absent'}, as ${login}${current !== round.head_sha ? `; verdict not updated, the PR moved to ${current.slice(0, 7)}` : ''}`);
  return r;
}

export function atOrAbove(findings, failOn) {
  if (!failOn) return 0;
  const rank = (x) => SEVERITIES.indexOf(x);
  return findings.filter((f) => rank(severityOf(f.body)) <= rank(failOn)).length;
}

export function readFindings(dir) {
  const events = readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { events, findings: events.filter((e) => e.type === 'finding') };
}

// The summary is GitHub markdown; on a terminal its headings, bold and code read as styling.
export function terminalMarkdown(md, tty) {
  if (!tty) return md;
  return md.split('\n').map((l) => {
    const h = /^#{1,6}\s+(.*)$/.exec(l);
    const line = (h ? h[1] : l).replace(/\*\*([^*]+)\*\*/g, '\x1b[1m$1\x1b[22m').replace(/`([^`]+)`/g, '\x1b[36m$1\x1b[39m');
    return h ? `\x1b[1m${line}\x1b[22m` : line;
  }).join('\n');
}

// Most severe first; the engine's filing order breaks ties.
const SEV_STYLE = { critical: ['Critical', 31], major: ['Major', 33], minor: ['Minor', 36] };

export function findingLines(findings, { tty = false } = {}) {
  return findings
    .map((f, i) => ({ f, i, sev: severityOf(f.body) }))
    .sort((a, b) => SEVERITIES.indexOf(a.sev) - SEVERITIES.indexOf(b.sev) || a.i - b.i)
    .map(({ f, sev }) => {
      const after = f.body.slice(f.body.indexOf('</details>') + 1);
      const title = (/\*\*(.+?)\*\*/.exec(after)?.[1] ?? f.body.split('\n')[0]).slice(0, 140);
      if (!tty) return `  [${sev[0].toUpperCase()}${sev.slice(1)}] ${f.path}:${f.line ?? '?'}  ${title}`;
      const [label, code] = SEV_STYLE[sev];
      return `  \x1b[${code}m● ${label.padEnd(8)}\x1b[0m ${f.path}:${f.line ?? '?'}  ${title.replace(/`([^`]+)`/g, '\x1b[36m$1\x1b[39m')}`;
    });
}

// Why a round did not complete, in words a first-time user can act on.
export function failureLines(s, dir = null) {
  const hint = {
    'auth-failed': ENGINES[s.engine]?.install?.signIn ? `sign in to ${s.engine} once: ${ENGINES[s.engine].install.signIn}` : null,
    'rate-limited': 'the engine hit its usage limit; try again after it resets',
    'account-limit': 'the engine account hit its plan limit',
    billing: 'the engine account needs billing set up',
    'model-unavailable': 'the model is not available to this account; pass --model or `assayer config set model <name>`',
  };
  const out = (s.errors ?? []).map((e) => `  ${e.failure_class}: ${String(e.message).split('\n')[0].slice(0, 200)}${e.reset_at ? ` (resets ${e.reset_at})` : ''}${hint[e.failure_class] ? `\n  -> ${hint[e.failure_class]}` : ''}`);
  if (s.refused_size) {
    let m = null;
    try { m = /(\d+) reviewable line\(s\) \(max_reviewable_lines=(\d+)/.exec(readFileSync(path.join(dir ?? '', 'manifest-stderr.log'), 'utf8')); } catch { /* the plain line below still says what to do */ }
    out.push(`  the change is too large for one round${m ? ` (${m[1]} reviewable lines, over ${m[2]})` : ''}; --full reviews it anyway, in a longer round`);
  }
  if (s.conclusion === 'timed-out') out.push(`  the engine went quiet or ran past its time limit (${s.timed_out_by ?? 'timeout'})`);
  if (!out.length && s.conclusion !== 'completed' && !s.refused_size) out.push(`  no reason recorded; the engine's own log is ${path.join('<round dir>', 'engine-stderr.log')}`);
  return out;
}

function printRound(dir) {
  const s = JSON.parse(readFileSync(path.join(dir, 'summary.json'), 'utf8'));
  const { events, findings } = readFindings(dir);
  if (s.conclusion !== 'completed') {
    process.stdout.write([`${s.conclusion}: the round did not finish`, ...failureLines(s, dir)].join('\n') + '\n');
    return;
  }
  const lines = [`${s.conclusion}: ${s.findings ?? 0} finding(s) in ${Math.round((s.wall_clock_ms ?? 0) / 1000)}s`];
  lines.push(...findingLines(findings, { tty: Boolean(process.stdout.isTTY) }));
  const summary = events.findLast((e) => e.type === 'summary');
  if (summary) lines.push('', terminalMarkdown(withoutEngineCredit(summary.body), Boolean(process.stdout.isTTY)));
  process.stdout.write(lines.join('\n') + '\n');
}

// The one-time question. Every engine is offered; one that is not installed says so, and
// choosing it leads to the setup offer below.
async function pickEngine() {
  const { select, isCancel } = await import('@clack/prompts');
  // A PATH lookup only: doctor's version probes took seconds before the question appeared.
  const choice = await select({
    message: 'Which engine should review? This becomes your default.',
    options: Object.keys(LABELS).map((id) => ({ value: id, label: LABELS[id], hint: missingFor(id).length ? 'not installed yet; Assayer can set it up' : 'installed' })),
  });
  if (isCancel(choice)) throw Object.assign(new Error('no engine chosen; nothing saved'), { cancelled: true });
  return choice;
}

// An engine that is not installed is set up here, or refused before anything is spent.
async function ensureEngine(engine, interactive) {
  const missing = missingFor(engine);
  if (!missing.length) return;
  if (!interactive) throw new Error(setupHint(engine, missing));
  const { confirm, isCancel } = await import('@clack/prompts');
  const ok = await offerSetup(engine, { confirm: async (message) => { const a = await confirm({ message }); return !isCancel(a) && a; } });
  if (!ok) throw new Error(`${LABELS[engine]} is not set up; \`assayer doctor\` lists what is missing`);
}

// Paths under the home directory print as ~/…, the way people type them.
const tilde = (p) => (p.startsWith(os.homedir() + path.sep) ? `~${p.slice(os.homedir().length)}` : p);

// A bare round name, as review prints it, is looked up among the kept rounds.
export function roundDir(arg, home = assayerHome()) {
  const kept = path.join(home, 'reviews', arg);
  return !existsSync(path.resolve(arg)) && !arg.includes(path.sep) && existsSync(kept) ? kept : path.resolve(arg);
}

// The user's own Codex sandbox_mode switches off the credential deny list; say so every round.
function warnCodexSandbox(engine, log) {
  const file = engine === 'codex' && codexSandboxModeSet();
  if (file) log(`assayer: ${tilde(file)} sets sandbox_mode, so Codex ignores the profile that keeps it out of your credential files (gh, SSH, cloud CLIs). Remove sandbox_mode or use another engine for pull requests you do not trust.`);
}

// The live view stops before the round's own closing line, so the two never share a row.
async function watched(dir, engine, log, run) {
  const view = startProgress(dir, { engine });
  // runRound's own closing tally repeats what printRound says next; anything else it logs stays.
  try { return await run((s) => { view.stop(); if (!/^assayer-run: [\w-]+ in \d+s, /.test(s)) log(s); }); } finally { view.stop(); }
}

// A refusal before any quota is spent; telemetry sends its kind, never the message.
const refusal = (reason, message) => Object.assign(new Error(message), { refusal: reason });

// The round's checkout is a shared clone of this repository at the snapshot, so the engine
// sees exactly the uncommitted and untracked work and the user's own files are never opened.
export async function reviewLocal(o, { log = (s) => process.stderr.write(s + '\n'), cwd = process.cwd() } = {}) {
  const top = repoTop(cwd);
  const label = path.basename(top).replace(/[^\w.-]/g, '-') || 'repo';
  const stamp = Date.now();
  const dir = path.resolve(o.out ?? path.join(assayerHome(), 'reviews', `local-${label}-${stamp}`));
  if (existsSync(path.join(dir, 'round.json'))) throw new Error(`${dir} already holds a round; pick a new --out`);
  mkdirSync(dir, { recursive: true });
  const snap = o.head
    ? { head: localGit(top, ['rev-parse', '--verify', `${o.head}^{commit}`]), dirty: false }
    : snapshot(top, path.join(dir, 'snapshot.index'));
  snap.tree = localGit(top, ['rev-parse', `${snap.head}^{tree}`]);
  const base = chooseBase(top, { base: o.base });
  if (sameTree(top, base.sha, snap.head)) throw localRefusal('no_changes', `nothing to review: ${snap.dirty ? 'the working tree' : snap.head.slice(0, 7)} matches ${base.sha.slice(0, 7)} from ${base.source}`);
  if (!o.ignoreRepoConfig && localGit(top, ['cat-file', '-e', `${snap.head}:.github/claude-review.yml`], { allowFail: true }) !== null) {
    throw localRefusal('repo_config', 'this repository has .github/claude-review.yml, which a local round cannot apply yet (#182); pass --ignore-repo-config to review with the defaults');
  }
  const checkoutDir = path.join(dir, 'checkout');
  localCheckout(top, snap.head, checkoutDir);
  const repo = `local/${label}`;
  const prompt = { text: renderCodexPrompt(readFileSync(path.join(HERE, '..', 'prompt', 'codex.md'), 'utf8'), { repo, pr: 0, baseSha: base.sha, headSha: snap.head, local: { label, dirty: snap.dirty } }) };
  prompt.hash = promptHash(prompt.text);
  writeFileSync(path.join(dir, 'prompt.md'), prompt.text);
  const round = { mode: 'local', repository: null, pr_number: null, local_path: top, head_sha: snap.head, head_tree: snap.tree, base_sha: base.sha, base_source: base.source, dirty: snap.dirty, engine: o.engine, model: o.model, where: 'local' };
  writeFileSync(path.join(dir, 'round.json'), JSON.stringify(round, null, 2) + '\n');
  log(`assayer: local changes in ${label}, ${snap.dirty ? 'working tree' : snap.head.slice(0, 7)} vs ${base.sha.slice(0, 7)} from ${base.source}, with ${o.engine}; round in ${tilde(dir)}`);
  warnCodexSandbox(o.engine, log);
  const summary = await watched(dir, o.engine, log, (log) => runRound({
    cwd: checkoutDir, prompt: path.join(dir, 'prompt.md'), out: dir, engine: o.engine, model: o.model, promptHash: prompt.hash,
    stage: true, repo, pr: '0', headSha: snap.head, baseSha: base.sha, mode: 'review', ghToken: '', engineGh: 'offline',
    localFiles: changedFiles(checkoutDir, base.sha, snap.head),
    timeoutMs: (ENGINES[o.engine].timeoutMin ?? 20) * 60 * 1000, idleMs: (ENGINES[o.engine].idleMin ?? 8) * 60 * 1000,
  }, { log }));
  printRound(dir);
  if (summary.conclusion !== 'completed') return { dir, summary, posted: null, blocking: false };
  const { findings } = readFindings(dir);
  const counts = Object.fromEntries(SEVERITIES.map((x) => [x, findings.filter((f) => severityOf(f.body) === x).length]));
  log(`assayer: ${findings.length} finding(s) (${counts.critical} critical, ${counts.major} major, ${counts.minor} minor), ${snap.dirty ? `working tree on ${localGit(top, ['rev-parse', '--short', 'HEAD'])}` : snap.head.slice(0, 7)} vs ${base.sha.slice(0, 7)} from ${base.source}; round in ${tilde(dir)}`);
  return { dir, summary, posted: null, blocking: atOrAbove(findings, o.failOn) };
}

export async function review(o, { log = (s) => process.stderr.write(s + '\n') } = {}) {
  const pr = ghJson(`repos/${o.repo}/pulls/${o.pr}`);
  if (pr.state !== 'open') throw refusal('closed', `${o.repo}#${o.pr} is ${pr.merged_at ? 'merged' : pr.state}`);
  // The skip label is a stop no summons lifts (README principle 11); a local run is a summons.
  if ((pr.labels ?? []).some((l) => l.name === 'claude_review_skip')) throw refusal('skip_label', `${o.repo}#${o.pr} carries claude_review_skip; remove the label to review it`);
  const headSha = pr.head.sha;
  // The PR's diff is three-dot: against the merge base, not the base branch's tip.
  const baseSha = ghJson(`repos/${o.repo}/compare/${pr.base.sha}...${headSha}`).merge_base_commit.sha;

  const prior = priorReview(livenessRecords(listComments(o.repo, o.pr)), { headSha, engine: o.engine, canWrite: writerCheck(o.repo) });
  if (prior && !o.again) throw refusal('already_reviewed', `${headSha.slice(0, 7)} already has a ${o.engine} review on record (comment ${prior.id} by ${prior.login}); pass --again to run another`);

  // Until the resolver is a package (#182), a local round knows only the workflow defaults. With
  // no repo config those are exact; with one, the round would review against the wrong rules.
  const cfg = gh(['api', `repos/${o.repo}/contents/.github/claude-review.yml?ref=${pr.base.sha}`], { allow404: true });
  if (cfg !== null && !o.ignoreRepoConfig) throw refusal('repo_config', `${o.repo} has .github/claude-review.yml, which a local round cannot apply yet (#182); pass --ignore-repo-config to review with the workflow defaults`);

  const dir = path.resolve(o.out ?? path.join(assayerHome(), 'reviews', `${o.repo.replace('/', '-')}-${o.pr}-${headSha.slice(0, 7)}-${Date.now()}`));
  // One directory, one round: a reused one would carry the last round's publish journal.
  if (existsSync(path.join(dir, 'round.json'))) throw new Error(`${dir} already holds a round; pick a new --out`);
  mkdirSync(dir, { recursive: true });
  const token = gh(['auth', 'token']).trim();
  const cwd = path.join(dir, 'checkout');
  log(`assayer: ${o.repo}#${o.pr} at ${headSha.slice(0, 7)} with ${o.engine}; round in ${tilde(dir)}`);
  warnCodexSandbox(o.engine, log);
  await checkout({ repository: o.repo, headSha, baseSha, token, dir: cwd });

  const prompt = renderFor(o.engine, { repo: o.repo, pr: o.pr, baseSha, headSha });
  writeFileSync(path.join(dir, 'prompt.md'), prompt.text);
  const round = { repository: o.repo, pr_number: o.pr, head_sha: headSha, base_sha: baseSha, engine: o.engine, model: o.model, where: 'local' };
  writeFileSync(path.join(dir, 'round.json'), JSON.stringify(round, null, 2) + '\n');

  const summary = await watched(dir, o.engine, log, (log) => runRound({
    cwd, prompt: path.join(dir, 'prompt.md'), out: dir, engine: o.engine, model: o.model, promptHash: prompt.hash,
    stage: true, repo: o.repo, pr: String(o.pr), headSha, mode: o.full ? 'review-full' : 'review', ghToken: token, engineGh: 'offline',
    timeoutMs: (ENGINES[o.engine].timeoutMin ?? 20) * 60 * 1000, idleMs: (ENGINES[o.engine].idleMin ?? 8) * 60 * 1000,
  }, { log }));
  printRound(dir);
  if (summary.conclusion !== 'completed') return { dir, summary, posted: null };
  const blocking = atOrAbove(readFindings(dir).findings, o.failOn);
  if (!o.post) { log(`assayer: not posted; run \`assayer publish ${path.basename(dir)}\` to post it`); return { dir, summary, posted: null, blocking }; }
  return { dir, summary, posted: await publish(dir, { log, token }), blocking };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { process.stderr.write(`${e.message}\n`); process.exit(2); }
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  if (o.cmd === '--version') { process.stdout.write(`${version}\n`); process.exit(0); }
  if (o.cmd === 'doctor') { const d = doctor(); process.stdout.write(formatDoctor(d) + '\n'); process.exit(d.ok ? 0 : 1); }
  const tel = createTelemetry({ version });
  if (o.cmd === 'telemetry') {
    if (o.action !== 'status') tel.set(o.action === 'on');
    process.stdout.write(tel.status() + '\n');
    process.exit(0);
  }
  if (o.cmd === 'hook') process.exit(hookCommand(o));
  if (o.cmd === 'config') {
    try {
      if (o.action !== 'show') writeSetting(o.key, o.action === 'set' ? o.value : undefined);
      process.stdout.write(formatSettings(readSettings()) + '\n');
      process.exit(0);
    } catch (e) { process.stderr.write(`assayer: ${e.message}\n`); process.exit(2); }
  }
  if (o.cmd === 'review' && process.platform === 'win32') {
    process.stderr.write('assayer: a review round runs on Linux or macOS; on Windows, install and run Assayer inside WSL\n');
    process.exit(1);
  }
  if (o.cmd === 'review') {
    try {
      o = await resolveDefaults(o, {
        settings: readSettings(), isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY), pick: pickEngine,
        save: (k, v) => writeSetting(k, v), log: (s) => process.stderr.write(s + '\n'),
      });
      await ensureEngine(o.engine, Boolean(process.stdin.isTTY && process.stdout.isTTY));
    } catch (e) { process.stderr.write(`assayer: ${e.message}\n`); process.exit(e.cancelled ? 130 : 2); }
  }
  tel.start();
  tel.active();
  const t0 = Date.now();
  const mode = o.local ? 'local' : 'pr';
  const run = o.cmd === 'publish'
    ? publish(roundDir(o.dir)).then(() => 0)
    : (o.local ? reviewLocal(o) : review(o)).then((r) => {
      tel.capture('round_finished', { mode, engine: o.engine, conclusion: r.summary.conclusion, findings: countBucket(r.summary.findings), duration_bucket: durationBucket(Date.now() - t0), posted: r.posted !== null });
      if (r.summary.conclusion !== 'completed') return 3;
      return r.blocking ? 4 : 0;
    });
  run.catch((e) => {
    if (e.refusal) tel.capture('refused', { mode, engine: o.engine, reason: e.refusal });
    process.stderr.write(`assayer: ${e.message}\n`);
    return e.refusal === 'no_changes' ? 0 : 1;
  }).then(async (code) => { await tel.flush(); process.exit(code); });
}
