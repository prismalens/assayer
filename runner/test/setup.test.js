import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installCommand, missingFor, offerSetup, setupHint } from '../src/setup.js';

const has = (...cmds) => (c) => (cmds.includes(c) ? `/bin/${c}` : null);

describe('engine setup', () => {
  it('names the CLI and the adapter it lacks, with pinned adapter versions', () => {
    const m = missingFor('claude-code', has('claude'));
    assert.deepEqual(m.map((x) => x.pkg), ['@agentclientprotocol/claude-agent-acp@0.89.1']);
    assert.equal(installCommand(missingFor('codex', has())), 'npm i -g @openai/codex @agentclientprotocol/codex-acp@2.1.1');
    assert.deepEqual(missingFor('opencode', has('opencode')), []);
    assert.match(setupHint('codex', missingFor('codex', has('codex'))), /codex-acp@2\.1\.1\nthen sign in once: run `codex login`\./);
  });

  it('runs nothing when the user declines, and reports a failed install', async () => {
    const runs = [];
    const quiet = { log: () => {}, which: has(), run: (a) => { runs.push(a); return 1; } };
    assert.equal(await offerSetup('opencode', { ...quiet, confirm: async () => false }), false);
    assert.deepEqual(runs, []);
    assert.equal(await offerSetup('opencode', { ...quiet, confirm: async () => true }), false);
    assert.deepEqual(runs, [['i', '-g', 'opencode-ai@1.18.30']]);
  });

  it('is ready once the install puts the commands on PATH', async () => {
    let installed = false;
    const logs = [];
    const ok = await offerSetup('codex', {
      which: (c) => (installed ? `/bin/${c}` : null), confirm: async () => true,
      run: () => { installed = true; return 0; }, log: (s) => logs.push(s),
    });
    assert.equal(ok, true);
    assert.match(logs.at(-1), /If you have not signed in yet: run `codex login`/);
  });
});

describe('npm install scripts', () => {
  it('allows Claude Code its postinstall, and nothing else', async () => {
    const { installArgs } = await import('../src/setup.js');
    assert.deepEqual(installArgs(missingFor('claude-code', has())), ['i', '-g', '@anthropic-ai/claude-code', '@agentclientprotocol/claude-agent-acp@0.89.1', '--allow-scripts=@anthropic-ai/claude-code']);
    assert.deepEqual(installArgs(missingFor('codex', has())), ['i', '-g', '@openai/codex', '@agentclientprotocol/codex-acp@2.1.1']);
  });
});
