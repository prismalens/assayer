import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINES } from '../src/engines.js';

describe('engine rows', () => {
  it('Claude Code asks before every gated call and reads only its checkout', () => {
    const row = ENGINES['claude-code'];
    assert.equal(row.sessionMode, 'default');
    assert.deepEqual(row.sessionMeta.claudeCode.options.settingSources, []);
    assert.equal(row.sessionMeta.claudeCode.options.strictMcpConfig, true, 'no claude.ai connectors in a round');
    assert.equal(row.sessionMeta.claudeCode.options.settings.permissions.blockReadsOutsideWorkingDirectories, true);
  });

  it('Codex and OpenCode keep their own controls and set no mode', () => {
    assert.equal(ENGINES.codex.sessionMode, undefined);
    assert.equal(ENGINES.opencode.sessionMode, undefined);
  });
});

describe('Codex credential paths', () => {
  it('denies where credentials live and leaves its own sign-in readable', () => {
    const cfg = JSON.parse(ENGINES.codex.prepare({ env: {} }).CODEX_CONFIG);
    const fs = cfg.permissions[cfg.default_permissions].filesystem;
    for (const p of ['~/.config/gh', '~/.ssh', '~/.aws', '~/.claude/.credentials.json']) assert.equal(fs[p], 'deny', p);
    assert.equal(Object.keys(fs).some((p) => p.startsWith('~/.codex')), false);
    assert.equal(cfg.sandbox_mode, undefined, 'a sandbox_mode would switch Codex back to the legacy settings and drop the profile');
  });
});

describe('a user sandbox_mode', () => {
  it('is found in the Codex config, top level or in a profile', async () => {
    const { codexSandboxModeSet } = await import('../src/engines.js');
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const os = (await import('node:os')).default; const path = (await import('node:path')).default;
    const home = mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    assert.equal(codexSandboxModeSet({ CODEX_HOME: home }), null);
    writeFileSync(path.join(home, 'config.toml'), 'model = "x"\n[profiles.fast]\n  sandbox_mode = "workspace-write"\n');
    assert.equal(codexSandboxModeSet({ CODEX_HOME: home }), path.join(home, 'config.toml'));
    const cfg = JSON.parse(ENGINES.codex.prepare({ env: {} }).CODEX_CONFIG);
    assert.equal(cfg.permissions.assayer.filesystem[':workspace_roots'], 'read');
  });
});
