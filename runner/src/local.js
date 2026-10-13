// Local mode: review what is not pushed yet. The working tree is captured as a dangling commit
// through a temporary index, so the user's index, refs and stash are never written; the only
// trace in their repository is loose objects that gc prunes.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const ZERO = /^0+$/;
const IDENTITY = { GIT_AUTHOR_NAME: 'assayer', GIT_AUTHOR_EMAIL: 'assayer@localhost', GIT_COMMITTER_NAME: 'assayer', GIT_COMMITTER_EMAIL: 'assayer@localhost' };

export function refusal(reason, message) {
  return Object.assign(new Error(message), { refusal: reason });
}

// GIT_OPTIONAL_LOCKS=0: without it a read like `status` may rewrite the user's index.
export function git(cwd, args, { env = {}, allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', ...env } }).trim();
  } catch (e) {
    if (allowFail) return null;
    throw new Error(`git ${args.slice(0, 2).join(' ')} failed: ${String(e.stderr ?? e.message).trim().split('\n')[0]}`);
  }
}

export function repoTop(cwd = process.cwd()) {
  const top = git(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true });
  if (!top) throw refusal('no_repo', 'not inside a git repository; run assayer review from a checkout, or pass owner/repo#N');
  return top;
}

export function snapshot(top, scratchIndex) {
  const head = git(top, ['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true });
  if (!head) throw refusal('no_base', 'HEAD has no commit yet; commit once first');
  const real = git(top, ['rev-parse', '--git-path', 'index']);
  const realPath = path.isAbsolute(real) ? real : path.join(top, real);
  try {
    if (existsSync(realPath)) copyFileSync(realPath, scratchIndex);
    const env = { GIT_INDEX_FILE: scratchIndex };
    if (!existsSync(realPath)) git(top, ['read-tree', 'HEAD'], { env });
    git(top, ['add', '-A', '--', ':/'], { env });
    const tree = git(top, ['write-tree'], { env });
    if (tree === git(top, ['rev-parse', 'HEAD^{tree}'])) return { head, tree, dirty: false };
    const commit = git(top, ['-c', 'commit.gpgSign=false', 'commit-tree', '--no-gpg-sign', tree, '-p', head, '-m', 'assayer snapshot'], { env: IDENTITY });
    return { head: commit, tree, dirty: true };
  } finally {
    rmSync(scratchIndex, { force: true });
  }
}

export function chooseBase(top, { base = null } = {}) {
  if (base) {
    const sha = git(top, ['rev-parse', '--verify', '-q', `${base}^{commit}`], { allowFail: true });
    if (!sha) throw refusal('no_base', `--base ${base} is not a commit here`);
    return { sha, source: `--base ${base}` };
  }
  const branch = git(top, ['symbolic-ref', '-q', '--short', 'HEAD'], { allowFail: true });
  const tries = [['upstream', '@{upstream}'], ['origin', 'refs/remotes/origin/HEAD'], ['main', 'refs/heads/main'], ['master', 'refs/heads/master']];
  for (const [source, ref] of tries) {
    if ((source === 'main' || source === 'master') && branch === source) continue;
    const sha = git(top, ['merge-base', 'HEAD', ref], { allowFail: true });
    if (sha) return { sha, source };
  }
  throw refusal('no_base', 'found no upstream, origin/HEAD, main or master to compare with; pass --base <ref>');
}

// `clone --shared` reads the user's objects through alternates, so the dangling snapshot is
// reachable without fetching and the network is never touched. Symlinks check out as plain
// files, as in github.js.
export function localCheckout(top, head, dir) {
  const env = { GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' };
  git(path.dirname(dir), ['clone', '-q', '--shared', '--no-checkout', '-c', 'core.symlinks=false', top, dir], { env });
  git(dir, ['checkout', '-q', '--detach', head], { env });
}

const STATUS = { A: 'added', D: 'removed', M: 'modified', R: 'renamed', C: 'added', T: 'modified' };

// GitHub-shaped file entries, so manifest.py's incremental path reads them unchanged.
export function changedFiles(cwd, base, head) {
  const nameStatus = git(cwd, ['diff', '-M', '-z', '--name-status', base, head]).split('\0').filter((x) => x !== '');
  const numstat = new Map();
  const ns = git(cwd, ['diff', '-M', '-z', '--numstat', base, head]).split('\0');
  for (let i = 0; i < ns.length; i += 1) {
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(ns[i]);
    if (!m) continue;
    let file = m[3];
    if (file === '') { file = ns[i + 2]; i += 2; }
    numstat.set(file, { additions: m[1] === '-' ? 0 : Number(m[1]), deletions: m[2] === '-' ? 0 : Number(m[2]), binary: m[1] === '-' });
  }
  const files = [];
  for (let i = 0; i < nameStatus.length;) {
    const code = nameStatus[i][0];
    const renamed = code === 'R' || code === 'C';
    const previous = renamed ? nameStatus[i + 1] : null;
    const filename = renamed ? nameStatus[i + 2] : nameStatus[i + 1];
    i += renamed ? 3 : 2;
    const stat = numstat.get(filename) ?? { additions: 0, deletions: 0, binary: false };
    const entry = { filename, status: STATUS[code] ?? 'modified', additions: stat.additions, deletions: stat.deletions };
    if (previous && code === 'R') entry.previous_filename = previous;
    if (!stat.binary) {
      const diff = git(cwd, ['diff', '-M', '--no-color', '--no-ext-diff', '--no-textconv', base, head, '--', ...(previous ? [previous] : []), filename]);
      const at = diff.indexOf('\n@@');
      if (at !== -1) entry.patch = diff.slice(at + 1);
    }
    files.push(entry);
  }
  return files;
}

export function sameTree(cwd, a, b) {
  return git(cwd, ['rev-parse', `${a}^{tree}`]) === git(cwd, ['rev-parse', `${b}^{tree}`]);
}

export const isZero = (sha) => ZERO.test(sha ?? '');

// A finding's first line is `_Category_ | _Severity_ | _Effort_`. The label sits between
// underscores, which \b treats as word characters. Unreadable shows as major; a threshold check
// passes `unreadable: 'critical'` so it counts at every level (adversary OBJ-026).
export function severityOf(body, unreadable = 'major') {
  return (/(?<![A-Za-z])(critical|major|minor)(?![A-Za-z])/i.exec(String(body ?? '').split('\n')[0])?.[1] ?? unreadable).toLowerCase();
}
