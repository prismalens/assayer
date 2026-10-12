import { it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRound } from '../src/run.js';

const FAKE = fileURLToPath(new URL('./fixtures/fake-agent.mjs', import.meta.url));

it('a round whose engine refuses Always ask fails closed and never sends the prompt', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'assayer-setmode-'));
  const repo = path.join(dir, 'repo');
  execFileSync('git', ['init', '-q', repo]);
  writeFileSync(path.join(dir, 'prompt.md'), 'review it');
  process.env.FAKE_AGENT_LOG = path.join(dir, 'prompted.log');
  const row = { command: process.execPath, args: () => [FAKE], envAllow: ['PATH', 'HOME', 'FAKE_AGENT_LOG'], prepare: ({ env }) => env, sessionMode: 'default' };
  const s = await runRound({ engine: 'fake', row, cwd: repo, prompt: path.join(dir, 'prompt.md'), out: path.join(dir, 'out'), engineGh: 'offline', mode: 'review', stage: false, timeoutMs: 30_000, idleMs: 30_000 }, { log: () => {} });
  assert.equal(s.conclusion, 'failed');
  assert.equal(s.errors[0]?._meta?.stage, 'session');
  assert.equal(existsSync(process.env.FAKE_AGENT_LOG), false, 'the prompt was sent to an engine that refused Always ask');
});

it('a subagent that works quietly past the idle clock is not cut off', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'assayer-slowtool-'));
  const repo = path.join(dir, 'repo');
  execFileSync('git', ['init', '-q', repo]);
  writeFileSync(path.join(dir, 'prompt.md'), 'review it');
  Object.assign(process.env, { FAKE_AGENT_LOG: path.join(dir, 'prompted.log'), FAKE_AGENT_MODE: 'slow-tool', FAKE_AGENT_WAIT: '1500' });
  const row = { command: process.execPath, args: () => [FAKE], envAllow: ['PATH', 'HOME', 'FAKE_AGENT_LOG', 'FAKE_AGENT_MODE', 'FAKE_AGENT_WAIT'], prepare: ({ env }) => env };
  try {
    const s = await runRound({ engine: 'fake', row, cwd: repo, prompt: path.join(dir, 'prompt.md'), out: path.join(dir, 'out'), engineGh: 'offline', mode: 'review', stage: false, timeoutMs: 20_000, idleMs: 400 }, { log: () => {} });
    assert.equal(s.conclusion, 'completed', 'an open tool call was cut off as idle');
  } finally { delete process.env.FAKE_AGENT_MODE; }
});
