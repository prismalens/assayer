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
    const p = install(d);
    assert.match(readFileSync(p, 'utf8'), new RegExp(MARKER));
    assert.equal(uninstall(d), p);
    assert.equal(existsSync(p), false);
    writeFileSync(p, '#!/bin/sh\necho mine\n');
    assert.throws(() => install(d), /another pre-push hook/);
    assert.throws(() => uninstall(d), /not assayer's hook/);
  });

  it('honours core.hooksPath', () => {
    const d = repo();
    mkdirSync(path.join(d, 'hooks-here'));
    execFileSync('git', ['config', 'core.hooksPath', 'hooks-here'], { cwd: d });
    assert.equal(install(d), path.join(d, 'hooks-here', 'pre-push'));
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
    assert.match(r.messages[0], /no local review\. Run: assayer review --head aaaaaaa --base ccccccc/);
    assert.equal(run([`(delete) ${Z} refs/heads/x ${R}`], [], 'block').code, 0);
    assert.deepEqual(run(line, [], 'off'), { code: 0, messages: [] });
  });
});
