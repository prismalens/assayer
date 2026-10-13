// `assayer hook`: an opt-in pre-push hook that never starts a round. A round takes minutes, and
// a hook that slow gets bypassed, so the hook only reads what `assayer review` already found
// for the tree being pushed. It warns by default, blocks only when asked, and fails open.
import { appendFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { git, isZero, severityOf, withheldCount } from './local.js';
import { assayerHome, SELF } from './settings.js';

export const MARKER = '# assayer pre-push hook';
const SCRIPT = `#!/bin/sh
${MARKER}
command -v assayer >/dev/null 2>&1 || { echo "assayer: not on PATH; push not checked" >&2; exit 0; }
exec assayer hook pre-push "$@"
`;
const MODES = ['off', 'warn', 'block'];

function hookPath(cwd) {
  const p = git(cwd, ['rev-parse', '--git-path', 'hooks/pre-push']);
  return path.isAbsolute(p) ? p : path.join(git(cwd, ['rev-parse', '--show-toplevel']), p);
}

export function install(cwd = process.cwd(), self = SELF) {
  // The hook runs `assayer` from PATH; an npx run leaves nothing there.
  if (self !== 'assayer') throw new Error('the hook needs assayer on PATH; install it first with `npm i -g @prismalens/assayer`');
  const p = hookPath(cwd);
  if (existsSync(p) && !readFileSync(p, 'utf8').includes(MARKER)) throw new Error(`${p} is another pre-push hook; assayer leaves it alone`);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, SCRIPT);
  chmodSync(p, 0o755);
  return p;
}

export function uninstall(cwd = process.cwd()) {
  const p = hookPath(cwd);
  if (!existsSync(p)) return null;
  if (!readFileSync(p, 'utf8').includes(MARKER)) throw new Error(`${p} is not assayer's hook; left alone`);
  rmSync(p);
  return p;
}

export function hookMode(env = process.env, cwd = process.cwd()) {
  const raw = (env.ASSAYER_PREPUSH ?? git(cwd, ['config', '--get', 'assayer.prepush'], { allowFail: true }) ?? 'warn').trim().toLowerCase();
  return MODES.includes(raw) ? { mode: raw } : { mode: 'warn', invalid: raw };
}

// Every local round's directory, wherever --out put it (adversary OBJ-030).
export const roundIndex = () => path.join(assayerHome(), 'local-rounds.jsonl');
export function indexRound(dir, index = roundIndex()) {
  mkdirSync(path.dirname(index), { recursive: true });
  appendFileSync(index, JSON.stringify({ dir }) + '\n');
}

// Completed local rounds, newest first. A round whose event log is missing, has a line that no
// longer parses, lacks its finished event or holds fewer findings than its summary counted is
// withheld: the hook cannot say it was minor (adversary OBJ-032).
export function localRounds(root = path.join(assayerHome(), 'reviews'), index = roundIndex()) {
  const dirs = new Set(existsSync(root) ? readdirSync(root).map((n) => path.join(root, n)) : []);
  if (existsSync(index)) for (const l of readFileSync(index, 'utf8').split('\n')) { try { dirs.add(path.resolve(JSON.parse(l).dir)); } catch { /* torn line */ } }
  const out = [];
  for (const dir of dirs) {
    try {
      const round = JSON.parse(readFileSync(path.join(dir, 'round.json'), 'utf8'));
      const summary = JSON.parse(readFileSync(path.join(dir, 'summary.json'), 'utf8'));
      if (round.mode !== 'local' || summary.conclusion !== 'completed') continue;
      let broken = 0; let text = '';
      try { text = readFileSync(path.join(dir, 'events.jsonl'), 'utf8'); } catch { broken += 1; }
      const events = text.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { broken += 1; return []; } });
      const findings = events.filter((e) => e.type === 'finding');
      const finished = Date.parse(events.find((e) => e.type === 'finished')?.at ?? '');
      if (Number.isNaN(finished)) broken += 1;
      const missing = Math.max(0, (Number.isInteger(summary.findings) ? summary.findings : 0) - findings.length);
      out.push({ dir, round, findings, withheld: withheldCount(summary) + missing + broken, mtime: Number.isNaN(finished) ? 0 : finished });
    } catch { /* an unfinished or foreign directory */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

const atLeastMajor = (body) => severityOf(body) !== 'minor';

// Pure: one decision per pushed ref from git's stdin lines and the rounds on disk.
export function prePush({ lines, rounds, mode, treeOf, isAncestor }) {
  if (mode === 'off') return { code: 0, messages: [] };
  const messages = [];
  let block = false;
  for (const line of lines) {
    const [lref, lsha, , rsha] = line.trim().split(/\s+/);
    if (!lsha || isZero(lsha)) continue;
    const tree = treeOf(lsha);
    // A tag or ref on a blob or tree carries no commit to review (adversary OBJ-029).
    if (tree === null) { messages.push(`assayer: ${lref} is not a commit; nothing to review`); continue; }
    // Every review of this exact tree counts, not only the newest: the code is the same, so a later
    // clean run does not overrule an earlier finding, and no ordering can hide one (adversary OBJ-032).
    const matching = rounds.filter((r) => r.round.head_tree === tree && (isZero(rsha) || !rsha || isAncestor(r.round.base_sha, rsha)));
    if (!matching.length) {
      messages.push(`assayer: ${lref} at ${lsha.slice(0, 7)} has no local review. Run: ${SELF} review --head ${lsha.slice(0, 7)}${isZero(rsha) || !rsha ? '' : ` --base ${rsha.slice(0, 7)}`}`);
      block = true;
      continue;
    }
    let flagged = false;
    for (const round of matching) {
      const serious = round.findings.filter((f) => atLeastMajor(f.body));
      // A withheld finding's severity is unknown, so it blocks like a major one (adversary OBJ-027).
      if (round.withheld) messages.push(`assayer: ${lref}: round ${path.basename(round.dir)} withheld ${round.withheld} finding(s) Assayer could not read; see ${round.dir}`);
      if (serious.length) messages.push(`assayer: ${lref} has ${serious.length} major or critical finding(s) from round ${path.basename(round.dir)}:`);
      for (const f of serious) {
        const after = f.body.slice(f.body.indexOf('</details>') + 1);
        const title = (/\*\*(.+?)\*\*/.exec(after)?.[1] ?? '').replace(/[\x00-\x1f]/g, ' ').slice(0, 100);
        const sev = severityOf(f.body);
        messages.push(`  [${sev[0].toUpperCase()}${sev.slice(1)}] ${f.path}:${f.line ?? '?'}  ${title}`);
      }
      flagged ||= serious.length > 0 || round.withheld > 0;
    }
    if (!flagged) { messages.push(`assayer: ${lref} reviewed, nothing major (${matching[0].dir})`); continue; }
    if (matching.length > 1) messages.push(`assayer: every review of this exact code counts; delete a round directory you no longer trust`);
    block = true;
  }
  if (block && mode === 'block') messages.push('assayer: push blocked (assayer.prepush=block); `git push --no-verify` skips the check');
  else if (block) messages.push('assayer: pushing anyway; `git config assayer.prepush block` stops pushes like this');
  return { code: block && mode === 'block' ? 1 : 0, messages };
}

export function hookCommand({ action }, { cwd = process.cwd(), env = process.env, stdin = () => readFileSync(0, 'utf8') } = {}) {
  try {
    if (action === 'install') { process.stdout.write(`assayer: installed ${install(cwd)}\n`); return 0; }
    if (action === 'uninstall') { const p = uninstall(cwd); process.stdout.write(p ? `assayer: removed ${p}\n` : 'assayer: no hook installed\n'); return 0; }
  } catch (e) { process.stderr.write(`assayer: ${e.message}\n`); return 1; }
  try {
    const { mode, invalid } = hookMode(env, cwd);
    if (invalid) process.stderr.write(`assayer: assayer.prepush=${invalid} is not off, warn or block; using warn\n`);
    const r = prePush({
      lines: stdin().split('\n').filter(Boolean), rounds: localRounds(), mode,
      treeOf: (sha) => (git(cwd, ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], { allowFail: true }) ? git(cwd, ['rev-parse', `${sha}^{tree}`]) : null),
      isAncestor: (a, b) => git(cwd, ['merge-base', '--is-ancestor', a, b], { allowFail: true }) !== null,
    });
    for (const m of r.messages) process.stderr.write(m + '\n');
    return r.code;
  } catch (e) {
    process.stderr.write(`assayer: pre-push check skipped (${e.message})\n`);
    return 0;
  }
}
