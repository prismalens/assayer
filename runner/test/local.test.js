import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, appendFileSync, mkdirSync, chmodSync, lstatSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshot, chooseBase, localCheckout, changedFiles, sameTree } from '../src/local.js';
import { buildManifest } from '../src/manifest.js';
import { renderCodexPrompt } from '../src/prompt.js';
import { parseArgs, severityOf, atOrAbove, publish, findingLines, failureLines, withheldCount } from '../src/review.js';
import { sanitize } from '../src/telemetry.js';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'assayer-local-'));
before(() => {
  process.env.HOME = tmp();
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_NOSYSTEM = '1';
});
const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();

// origin with two commits, a clone with one unpushed commit, an unstaged edit, an untracked
// file and an ignored one.
function fixture() {
  const root = tmp();
  const origin = path.join(root, 'origin');
  mkdirSync(origin);
  g(origin, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(origin, 'a.txt'), 'one\n');
  writeFileSync(path.join(origin, 'gone.txt'), 'bye\n');
  writeFileSync(path.join(origin, 'old.txt'), 'x\n'.repeat(20));
  g(origin, 'add', '.'); g(origin, 'commit', '-q', '-m', 'init');
  g(root, 'clone', '-q', 'origin', 'work');
  const work = path.join(root, 'work');
  g(work, 'mv', 'old.txt', 'new.txt'); g(work, 'rm', '-q', 'gone.txt'); g(work, 'commit', '-q', '-m', 'local');
  appendFileSync(path.join(work, 'a.txt'), 'two\n');
  writeFileSync(path.join(work, 'fresh.txt'), 'hello\n');
  writeFileSync(path.join(work, '.gitignore'), '*.log\n');
  writeFileSync(path.join(work, 'noise.log'), 'ignored\n');
  writeFileSync(path.join(work, 'bin.dat'), Buffer.from([0, 1, 2, 0, 255]));
  return { root, origin, work };
}

const state = (cwd) => [
  readFileSync(path.join(cwd, '.git', 'index')).toString('base64'),
  g(cwd, 'for-each-ref'), g(cwd, 'stash', 'list'), g(cwd, 'rev-parse', 'HEAD'),
  execFileSync('git', ['status', '--porcelain=v2', '-uall'], { cwd, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }),
].join('\n');

describe('local mode', () => {
  it('snapshots the working tree without touching the index, refs, stash or status', () => {
    const { work } = fixture();
    const before = state(work);
    const s = snapshot(work, path.join(tmp(), 'idx'));
    assert.equal(s.dirty, true);
    assert.equal(state(work), before);
    const files = g(work, 'ls-tree', '-r', '--name-only', s.head).split('\n');
    assert.ok(files.includes('fresh.txt'), 'untracked file is in the snapshot');
    assert.ok(!files.includes('noise.log'), 'ignored file is not');
    assert.equal(g(work, 'show', `${s.head}:a.txt`), 'one\ntwo');
  });

  it('takes a staged-then-edited file as it is on disk, and a clean tree is HEAD itself', () => {
    const { work } = fixture();
    g(work, 'add', 'a.txt'); appendFileSync(path.join(work, 'a.txt'), 'three\n');
    assert.match(g(work, 'show', `${snapshot(work, path.join(tmp(), 'i')).head}:a.txt`), /three$/);
    const clean = path.join(fixture().root, 'origin');
    const s = snapshot(clean, path.join(tmp(), 'i'));
    assert.deepEqual([s.dirty, s.head], [false, g(clean, 'rev-parse', 'HEAD')]);
  });

  it('chooses the upstream merge base, honours --base, falls back to HEAD on main, and refuses when there is none', () => {
    const { origin, work } = fixture();
    assert.deepEqual(chooseBase(work), { sha: g(origin, 'rev-parse', 'HEAD'), source: 'upstream' });
    assert.equal(chooseBase(work, { base: 'HEAD' }).source, '--base HEAD');
    assert.deepEqual(chooseBase(origin), { sha: g(origin, 'rev-parse', 'HEAD'), source: 'HEAD' }, 'main with no upstream reviews uncommitted work');
    g(origin, 'branch', '-m', 'trunk');
    assert.throws(() => chooseBase(origin), (e) => e.refusal === 'no_base');
    assert.throws(() => chooseBase(work, { base: 'nope' }), (e) => e.refusal === 'no_base');
  });

  it('checks out the snapshot offline and lists files in the shape the manifest reads', () => {
    const { work } = fixture();
    const s = snapshot(work, path.join(tmp(), 'i'));
    const base = chooseBase(work).sha;
    const dir = path.join(tmp(), 'checkout');
    localCheckout(work, s.head, dir);
    assert.ok(existsSync(path.join(dir, 'fresh.txt')));
    assert.equal(g(work, 'for-each-ref').includes('assayer'), false);
    const byName = Object.fromEntries(changedFiles(dir, base, s.head).map((f) => [f.filename, f]));
    assert.equal(byName['a.txt'].status, 'modified');
    assert.match(byName['a.txt'].patch, /^@@/);
    assert.equal(byName['fresh.txt'].status, 'added');
    assert.equal(byName['gone.txt'].status, 'removed');
    assert.deepEqual([byName['new.txt'].status, byName['new.txt'].previous_filename], ['renamed', 'old.txt']);
    assert.equal(byName['bin.dat'].patch, undefined);
    assert.equal(sameTree(work, base, base), true);
  });

  it('checks a symlink out as a plain file holding its target, never a link to follow', () => {
    const { work } = fixture();
    const outside = path.join(tmp(), 'secret.txt');
    writeFileSync(outside, 'CANARY');
    execFileSync('ln', ['-s', outside, path.join(work, 'link.txt')]);
    const s = snapshot(work, path.join(tmp(), 'i'));
    const dir = path.join(tmp(), 'checkout');
    localCheckout(work, s.head, dir);
    assert.equal(lstatSync(path.join(dir, 'link.txt')).isSymbolicLink(), false);
    assert.equal(readFileSync(path.join(dir, 'link.txt'), 'utf8'), outside);
  });

  it('builds the manifest from local files without calling gh', async () => {
    const { work } = fixture();
    const s = snapshot(work, path.join(tmp(), 'i'));
    const base = chooseBase(work).sha;
    const dir = path.join(tmp(), 'checkout');
    localCheckout(work, s.head, dir);
    const bin = tmp();
    const mark = path.join(bin, 'CALLED');
    writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\ntouch ${mark}\nexit 1\n`);
    chmodSync(path.join(bin, 'gh'), 0o755);
    const PATH = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${PATH}`;
    try {
      const m = await buildManifest({ cwd: dir, localFiles: changedFiles(dir, base, s.head), headSha: s.head, baseSha: base });
      assert.ok(m.manifest.files.some((f) => f.path === 'fresh.txt'));
    } finally { process.env.PATH = PATH; }
    assert.equal(existsSync(mark), false);
  });
});

describe('local prompt and CLI', () => {
  const tpl = readFileSync(new URL('../prompt/codex.md', import.meta.url), 'utf8');
  it('renders the pull request prompt unchanged, and a local one with no GitHub link or placeholder', () => {
    const pr = renderCodexPrompt(tpl, { repo: 'acme/widgets', pr: 42, baseSha: 'b'.repeat(40), headSha: 'a'.repeat(40) });
    assert.equal(pr, readFileSync(new URL('./fixtures/codex-pr-render.txt', import.meta.url), 'utf8'));
    const local = renderCodexPrompt(tpl, { repo: 'local/widgets', pr: 0, baseSha: 'b'.repeat(40), headSha: 'a'.repeat(40), local: { label: 'widgets', dirty: true } });
    assert.doesNotMatch(local, /github\.com|@@/);
    assert.match(local, /local changes in widgets that are not yet pushed/);
  });

  it('parses local mode and refuses what needs a pull request', () => {
    assert.deepEqual(parseArgs(['review']).local, true);
    assert.equal(parseArgs(['review', '--base', 'main', '--fail-on', 'major']).failOn, 'major');
    assert.throws(() => parseArgs(['review', '--post']), /needs a pull request/);
    assert.equal(parseArgs(['review', '--engine', 'opencode']).engine, 'opencode');
    assert.throws(() => parseArgs(['review', '--engine', 'nope']), /unknown engine/);
    assert.throws(() => parseArgs(['review', '--fail-on', 'loud']), /--fail-on takes/);
    assert.equal(parseArgs(['review', 'acme/w#3']).local, undefined);
  });

  it('maps severities onto --fail-on, counting an unreadable or withheld one at every level', () => {
    const f = (sev) => ({ body: `_🎯 Functional Correctness_ | _${sev}_ | _⚡ Quick win_\nbody` });
    assert.equal(severityOf('no header').toString(), 'major');
    assert.equal(severityOf('_bug_ | _critical_ | _x_'), 'critical', 'any case');
    assert.equal(atOrAbove([{ body: 'no header at all' }], 'critical'), 1, 'unreadable counts at every threshold');
    assert.equal(atOrAbove([{ body: '_bug_ | _critical_ | _x_' }], 'critical'), 1);
    // Only the middle field counts: a category naming a severity word does not.
    assert.equal(severityOf('_Minor UI glitch_ | _🔴 Critical_ | _⚡ Quick win_'), 'critical');
    assert.equal(severityOf('_Critical path_ | _🟡 Minor_ | _x_'), 'minor');
    assert.equal(atOrAbove([{ body: '_minor issue_ crashes on critical path' }], 'critical'), 1, 'no header shape: unreadable');
    assert.equal(atOrAbove([{ body: '\n_bug_ | _🟡 Minor_ | _x_' }], 'critical'), 1);
    assert.equal(withheldCount({ dropped: [{ why: 'recorder redacted this record: credential-shaped body', tool: 'create_inline_comment' }] }), 1);
    const findings = [f('🔴 Critical'), f('🟠 Major'), f('🟡 Minor')];
    assert.deepEqual(['critical', 'major', 'minor', null].map((x) => atOrAbove(findings, x)), [1, 2, 3, 0]);
  });

  it('will not publish a local round', async () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'round.json'), JSON.stringify({ mode: 'local' }));
    await assert.rejects(publish(dir), /nothing to post to/);
  });

  it('sends the round mode and the new refusals, nothing else', () => {
    assert.deepEqual(sanitize({ mode: 'local', reason: 'no_changes', path: '/home/x' }), { mode: 'local', reason: 'no_changes' });
    assert.deepEqual(sanitize({ mode: 'branch' }), {});
  });

  it('prints findings most severe first, keeping filing order within a severity', () => {
    const f = (sev, p, t) => ({ path: p, line: 1, body: `_🎯 Functional Correctness_ | _${sev}_ | _⚡ Quick win_\n<details></details>\n**${t}**` });
    const out = findingLines([f('🟡 Minor', 'a', 'one'), f('🔴 Critical', 'b', 'two'), f('🟠 Major', 'c', 'three'), f('🔴 Critical', 'd', 'four')]);
    assert.deepEqual(out.map((l) => l.trim().split('  ')[1]), ['two', 'four', 'three', 'one']);
  });

  it('prints no terminal escape the engine wrote', () => {
    const body = `_🟠 Major_\n<details></details>\n**all clear\x1b]0;pwned\x07**`;
    for (const tty of [false, true]) {
      const [line] = findingLines([{ path: 'a\x1b[2J.js', line: 1, body }], { tty });
      assert.equal(line.replace(/\x1b\[[0-9;]*m/g, '').includes('\x1b'), false);
      assert.equal(line.includes('\x07'), false);
    }
  });

  it('says why a round failed and what to do about it', () => {
    const lines = failureLines({ engine: 'codex', conclusion: 'failed', errors: [{ failure_class: 'auth-failed', message: 'Authentication required' }] });
    assert.deepEqual(lines, ['  auth-failed: Authentication required\n  -> sign in to codex once: run `codex login`']);
    assert.match(failureLines({ engine: 'opencode', conclusion: 'timed-out', timed_out_by: 'idle', errors: [] })[0], /went quiet.*idle/);
    assert.match(failureLines({ engine: 'codex', conclusion: 'failed', errors: [{ failure_class: 'api-unavailable', message: 'Selected model is at capacity.' }] }).join('\n'), /run it again in a few minutes/);
    assert.match(failureLines({ engine: 'codex', conclusion: 'failed', errors: [] })[0], /no reason recorded/);
  });

  it('renders summary markdown as terminal styling only on a terminal', async () => {
    const { terminalMarkdown } = await import('../src/review.js');
    assert.equal(terminalMarkdown('## Code review\n**Cache** key `x`', false), '## Code review\n**Cache** key `x`');
    assert.equal(terminalMarkdown('## Code review\n**Cache** key `x`', true), '\x1b[1mCode review\x1b[22m\n\x1b[1mCache\x1b[22m key \x1b[36mx\x1b[39m');
  });

  it('says a too-large change can be reviewed with --full, with the numbers', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'assayer-big-'));
    writeFileSync(path.join(dir, 'manifest-stderr.log'), 'review manifest: 90 file(s), 8123 reviewable line(s) (max_reviewable_lines=6000, max_file_lines=2000), refused=True');
    const lines = failureLines({ engine: 'codex', conclusion: 'refused', refused_size: true, errors: [] }, dir);
    assert.deepEqual(lines, ['  the change is too large for one round (8123 reviewable lines, over 6000); --full reviews it anyway, in a longer round']);
    assert.equal(parseArgs(['review', 'a/b#1', '--full']).full, true);
  });

  it('a too-large local round is not told to use --full, which only a pull request takes', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'assayer-big-local-'));
    writeFileSync(path.join(dir, 'round.json'), JSON.stringify({ mode: 'local' }));
    const [line] = failureLines({ engine: 'codex', conclusion: 'refused', refused_size: true, errors: [] }, dir);
    assert.match(line, /smaller commits with --head, or push it and review the pull request with --full/);
  });

  it('flags zero findings after refused commands instead of implying a clean result', async () => {
    const { refusalNote } = await import('../src/review.js');
    assert.match(refusalNote({ findings: 0, permissions: { rejected: 1 } })[0], /refused 1 command outside/);
    assert.deepEqual(refusalNote({ findings: 2, permissions: { rejected: 3 } }), []);
    assert.deepEqual(refusalNote({ findings: 0, permissions: { rejected: 0 } }), []);
  });
});
