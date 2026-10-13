import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { install, uninstall, hookMode, prePush, MARKER } from '../src/hook.js';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'assayer-hook-'));
before(() => { process.env.GIT_CONFIG_GLOBAL = '/dev/null'; process.env.GIT_CONFIG_NOSYSTEM = '1'; });
const repo = () => { const d = tmp(); execFileSync('git', ['init', '-q', d]); return d; };

const Z = '0'.repeat(40);
const A = 'a'.repeat(40);
const R = 'c'.repeat(40);
const finding = (sev) => ({ path: 'a.js', line: 3, body: `_🎯 Functional Correctness_ | _${sev}_ | _⚡ Quick win_\nx` });
const round = (findings, base = 'b'.repeat(40)) => ({ dir: '/r', round: { head_tree: 'T', base_sha: base }, findings });
const run = (lines, rounds, mode, ancestor = true) => prePush({ lines, rounds, mode, treeOf: () => 'T', isAncestor: () => ancestor });

describe('pre-push hook', () => {
  it('installs, refuses a foreign hook, and uninstalls only its own', () => {
    const d = repo();
    const p = install(d, '/bin/assayer');
    assert.match(readFileSync(p, 'utf8'), new RegExp(MARKER));
    assert.equal(uninstall(d), p);
    assert.equal(existsSync(p), false);
    writeFileSync(p, '#!/bin/sh\necho mine\n');
    assert.throws(() => install(d, '/bin/assayer'), /another pre-push hook/);
    assert.throws(() => uninstall(d), /not assayer's hook/);
  });

  it('refuses to install from an npx run, which leaves nothing on PATH for the hook to call', () => {
    assert.throws(() => install(repo(), null), /npm i -g @prismalens\/assayer/);
    // Any lasting assayer on PATH will answer the hook, whoever runs the install.
    assert.ok(install(repo(), '/usr/lib/assayer/review.js'));
  });

  it('names the command as the user ran it: the PATH one, or the npx form for any other run', async () => {
    const { selfCommand } = await import('../src/settings.js');
    const me = path.resolve('src/review.js');
    assert.equal(selfCommand(me, me), 'assayer');
    assert.equal(selfCommand(me, null), 'npx @prismalens/assayer');
    assert.equal(selfCommand(me, '/usr/lib/node_modules/other/assayer.js'), 'npx @prismalens/assayer');
    const { onPath } = await import('../src/settings.js');
    const bin = path.join(tmp(), 'node_modules', '.bin'); (await import('node:fs')).mkdirSync(bin, { recursive: true });
    (await import('node:fs')).symlinkSync(me, path.join(bin, 'assayer'));
    assert.equal(onPath({ PATH: bin }), null, 'an npx or npm-script bin is not the user\'s PATH');
    const xfs = path.join(tmp(), 'xfs-123'); (await import('node:fs')).mkdirSync(xfs);
    (await import('node:fs')).symlinkSync(me, path.join(xfs, 'assayer'));
    assert.equal(onPath({ PATH: xfs }), null, 'a yarn dlx wrapper folder is temporary');
    const prefix = path.join(tmp(), 'global', 'bin'); (await import('node:fs')).mkdirSync(prefix, { recursive: true });
    (await import('node:fs')).symlinkSync(me, path.join(prefix, 'assayer'));
    assert.equal(onPath({ PATH: prefix }), me, 'a lasting install under TMPDIR still counts (OBJ-037)');
    const pnpm = path.join(tmp(), 'pnpm', 'bin'); (await import('node:fs')).mkdirSync(pnpm, { recursive: true });
    (await import('node:fs')).writeFileSync(path.join(pnpm, 'assayer'), `#!/bin/sh\nexec node "$basedir/x/review.js" "$@"\n# cmd-shim-target=${me}\n`, { mode: 0o755 });
    assert.equal(onPath({ PATH: pnpm }), me, 'a pnpm shell shim resolves to its script (OBJ-039)');
  });

  it('honours core.hooksPath', () => {
    const d = repo();
    mkdirSync(path.join(d, 'hooks-here'));
    execFileSync('git', ['config', 'core.hooksPath', 'hooks-here'], { cwd: d });
    assert.equal(install(d, '/bin/assayer'), path.join(d, 'hooks-here', 'pre-push'));
  });

  it('reads the mode from the environment, then git config, then defaults to warn', () => {
    const d = repo();
    assert.deepEqual(hookMode({}, d), { mode: 'warn' });
    execFileSync('git', ['config', 'assayer.prepush', 'block'], { cwd: d });
    assert.deepEqual(hookMode({}, d), { mode: 'block' });
    assert.deepEqual(hookMode({ ASSAYER_PREPUSH: 'off' }, d), { mode: 'off' });
    assert.deepEqual(hookMode({ ASSAYER_PREPUSH: 'loud' }, d), { mode: 'warn', invalid: 'loud' });
  });

  it('passes a reviewed push, and warns or blocks on major findings', () => {
    const line = [`refs/heads/x ${A} refs/heads/x ${R}`];
    assert.equal(run(line, [round([finding('🟡 Minor')])], 'block').code, 0);
    assert.deepEqual([run(line, [round([finding('🟠 Major')])], 'warn').code, run(line, [round([finding('🔴 Critical')])], 'block').code], [0, 1]);
    assert.match(run(line, [round([finding('🟠 Major')])], 'block').messages.at(-1), /--no-verify/);
  });

  it('finds every indexed round wherever --out put it, newest by recorded finish, and withholds damaged ones (OBJ-028, 030, 031, 032)', async () => {
    const { localRounds, indexRound } = await import('../src/hook.js');
    const { mkdirSync, writeFileSync, utimesSync } = await import('node:fs');
    const root = tmp(); const index = path.join(tmp(), 'local-rounds.jsonl');
    const save = (dir, findings, at, { count = findings.length, junk = '' } = {}) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'round.json'), JSON.stringify({ mode: 'local', head_tree: 'T', base_sha: 'b'.repeat(40) }));
      writeFileSync(path.join(dir, 'events.jsonl'), [...findings.map((f) => JSON.stringify({ type: 'finding', ...f })), junk, JSON.stringify({ type: 'finished', at })].filter(Boolean).join('\n'));
      writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ conclusion: 'completed', findings: count }));
    };
    const line = [`refs/heads/x ${A} refs/heads/x ${R}`];
    save(path.join(root, 'local-x-9999999999999'), [], '2026-10-01T00:00:00Z');
    const nested = path.join(tmp(), 'group', 'my-review');
    save(nested, [finding('🔴 Critical')], '2026-10-01T00:10:00Z');
    indexRound(nested, index);
    // A restored old summary gets a new mtime; the recorded finish still orders it first-last.
    const later = new Date('2027-01-01'); utimesSync(path.join(root, 'local-x-9999999999999', 'summary.json'), later, later);
    let rounds = localRounds(root, index);
    assert.equal(rounds[0].dir, nested);
    assert.equal(run(line, rounds, 'block').code, 1);
    // Findings the summary counted but the event log no longer holds, or a line that no longer parses.
    save(nested, [], '2026-10-01T00:10:00Z', { count: 1 });
    assert.equal(run(line, localRounds(root, index), 'block').code, 1);
    save(nested, [], '2026-10-01T00:10:00Z', { count: 0, junk: '{"type":"finding",' });
    rounds = localRounds(root, index);
    assert.equal(rounds[0].withheld, 1);
    assert.equal(run(line, rounds, 'block').code, 1);
  });

  it('any review of the same code with a finding or damage blocks, whatever its order (OBJ-032)', async () => {
    const { localRounds } = await import('../src/hook.js');
    const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const line = [`refs/heads/x ${A} refs/heads/x ${R}`];
    const crit = JSON.stringify({ type: 'finding', ...finding('🔴 Critical') });
    const cases = {
      'empty log, summary counted one': ['', 1],
      'Critical without finished': [crit, 1],
      'Critical, torn finished': [`${crit}\n{"type":"finished","at":`, 1],
      'missing log': [null, 1],
      'clean but no finished': ['', 0],
      'a null line': [`null\n${crit}`, 1],
    };
    for (const [name, [log, count]] of Object.entries(cases)) {
      const root = tmp();
      const save = (dir, text, n) => {
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, 'round.json'), JSON.stringify({ mode: 'local', head_tree: 'T', base_sha: 'b'.repeat(40) }));
        writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ conclusion: 'completed', findings: n }));
        if (text === null) rmSync(path.join(dir, 'events.jsonl'), { force: true }); else writeFileSync(path.join(dir, 'events.jsonl'), text);
      };
      save(path.join(root, 'old-clean'), JSON.stringify({ type: 'finished', at: '2026-10-01T00:00:00Z' }), 0);
      save(path.join(root, 'damaged'), log, count);
      assert.equal(run(line, localRounds(root, path.join(root, 'none.jsonl')), 'block').code, 1, name);
    }
    // The summary lost or torn after a round that recorded its own completion.
    for (const summary of [null, '{"conclusion":']) {
      const root = tmp(); const d = path.join(root, 'r'); mkdirSync(d);
      writeFileSync(path.join(d, 'round.json'), JSON.stringify({ mode: 'local', head_tree: 'T', base_sha: 'b'.repeat(40) }));
      writeFileSync(path.join(d, 'events.jsonl'), `${crit}\n${JSON.stringify({ type: 'finished', at: '2026-10-01T00:10:00Z', conclusion: 'completed' })}`);
      if (summary !== null) writeFileSync(path.join(d, 'summary.json'), summary);
      const rounds = localRounds(root, path.join(root, 'none.jsonl'));
      assert.equal(rounds.length, 1, String(summary));
      assert.equal(run(line, rounds, 'block').code, 1, String(summary));
    }
  });

  it('skips a ref that is not a commit and still checks the rest of the push (OBJ-029)', () => {
    const lines = [`refs/tags/blob ${'e'.repeat(40)} ${Z} ${Z}`, `refs/heads/x ${A} refs/heads/x ${R}`];
    const r = prePush({ lines, rounds: [round([finding('🔴 Critical')])], mode: 'block', treeOf: (sha) => (sha === A ? 'T' : null), isAncestor: () => true });
    assert.equal(r.code, 1);
    assert.match(r.messages[0], /not a commit/);
  });

  it('blocks on a withheld finding, whose severity is unknown (OBJ-027)', () => {
    const line = [`refs/heads/x ${A} refs/heads/x ${R}`];
    const r = run(line, [{ ...round([]), withheld: 1 }], 'block');
    assert.equal(r.code, 1);
    assert.match(r.messages.join('\n'), /withheld 1 finding/);
  });

  it('treats a round whose base is not behind the remote as no review, and skips deletes', () => {
    const line = [`refs/heads/x ${A} refs/heads/x ${R}`];
    const r = run(line, [round([])], 'block', false);
    assert.equal(r.code, 1);
    assert.match(r.messages[0], /no local review\. Run: (npx @prismalens\/)?assayer review --head aaaaaaa --base ccccccc/);
    assert.equal(run([`(delete) ${Z} refs/heads/x ${R}`], [], 'block').code, 0);
    assert.deepEqual(run(line, [], 'off'), { code: 0, messages: [] });
  });
});
