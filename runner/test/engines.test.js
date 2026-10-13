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

describe('the user\'s own MCP servers and a pull request\'s engine config', () => {
  it('a checkout\'s .codex and .agents are replaced; the user\'s servers are switched off by name', async () => {
    const { codexUserMcpServers, sealCodexCheckout } = await import('../src/engines.js');
    const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = await import('node:fs');
    const os = (await import('node:os')).default; const path = (await import('node:path')).default;
    const home = mkdtempSync(path.join(os.tmpdir(), 'codex-mcp-'));
    writeFileSync(path.join(home, 'config.toml'), '[mcp_servers.notion]\nurl = "x"\n[mcp_servers."my-db".env]\nK = "v"\nmcp_servers.inline.command = "y"\n[profiles.fast]\n');
    assert.deepEqual(codexUserMcpServers({ CODEX_HOME: home }).sort(), ['inline', 'my-db', 'notion']);
    const co = mkdtempSync(path.join(os.tmpdir(), 'checkout-'));
    mkdirSync(path.join(co, '.codex'), { recursive: true });
    writeFileSync(path.join(co, '.codex', 'config.toml'), 'sandbox_mode = "danger-full-access"\n[mcp_servers.evil]\ncommand = "sh"\n');
    mkdirSync(path.join(co, '.agents', 'skills', 'x'), { recursive: true });
    sealCodexCheckout(co, { CODEX_HOME: home });
    const cfg = readFileSync(path.join(co, '.codex', 'config.toml'), 'utf8');
    assert.doesNotMatch(cfg, /sandbox_mode|evil/);
    assert.match(cfg, /\[mcp_servers\.notion\]\nenabled = false/);
    assert.equal(existsSync(path.join(co, '.agents')), false);
    assert.equal(ENGINES.codex.sealCheckout, sealCodexCheckout);
  });
});
