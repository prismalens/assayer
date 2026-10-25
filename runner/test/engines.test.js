import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINES, codexSandboxModeSet, planRound } from '../src/engines.js';

const HOST = {
  PATH: '/bin', HOME: '/h', MY_SETTING: 'kept', CODEX_HOME: '/h/.codex', XDG_CONFIG_HOME: '/h/.config', CLAUDE_CONFIG_DIR: '/h/.claude',
  GH_TOKEN: 'gho_x', GITHUB_TOKEN: 'ghp_x', GH_ENTERPRISE_TOKEN: 'x', ASSAYER_HOME: '/h/.assayer', ASSAYER_TELEMETRY: 'off',
};
const plan = (engine, extra = {}) => planRound(ENGINES[engine], { cwd: '/co', runDir: '/run', hostEnv: HOST, ...extra });

describe('the launch plan', () => {
  it('passes the user\'s environment, minus Assayer\'s own secrets and any GitHub credential', () => {
    for (const engine of Object.keys(ENGINES)) {
      const { env } = plan(engine);
      for (const k of ['PATH', 'HOME', 'MY_SETTING', 'CODEX_HOME', 'XDG_CONFIG_HOME', 'CLAUDE_CONFIG_DIR']) assert.equal(env[k], HOST[k], `${engine} ${k}`);
      for (const k of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN']) assert.equal(env[k], undefined, `${engine} ${k}`);
      assert.deepEqual(Object.keys(env).filter((k) => k.startsWith('ASSAYER_')), [], engine);
      assert.equal(env.GH_CONFIG_DIR, path.join('/run', 'gh'));
      assert.deepEqual([env.GIT_CONFIG_KEY_0, env.GIT_CONFIG_VALUE_0], ['credential.helper', '']);
    }
  });

  it('keeps the user\'s own setup: no --pure, no Assayer config, no switched-off MCP servers or plugins', () => {
    const oc = plan('opencode');
    assert.equal(oc.args.includes('--pure'), false);
    for (const k of ['OPENCODE_DISABLE_PROJECT_CONFIG', 'OPENCODE_DISABLE_CLAUDE_CODE']) assert.equal(oc.env[k], undefined, k);
    for (const content of Object.values(oc.files)) { const cfg = JSON.parse(content); assert.equal(cfg.mcp, undefined); assert.equal(cfg.model, undefined); }
    const cc = plan('claude-code').sessionMeta.claudeCode.options;
    assert.deepEqual(cc.settingSources, ['user', 'project', 'local']);
    assert.equal(cc.strictMcpConfig, undefined);
    const cx = JSON.parse(plan('codex').env.CODEX_CONFIG);
    for (const k of ['mcp_servers', 'model_reasoning_effort', 'project_doc_max_bytes', 'model']) assert.equal(cx[k], undefined, k);
    assert.equal(cx.features.plugins, undefined); assert.equal(cx.features.apps, undefined);
  });

  it('keeps the read boundaries: Codex out of credential paths, Claude Code and OpenCode in the checkout', () => {
    const cx = JSON.parse(plan('codex').env.CODEX_CONFIG);
    const fs = cx.permissions[cx.default_permissions].filesystem;
    for (const p of ['~/.config/gh', '~/.ssh', '~/.aws', '~/.claude/.credentials.json']) assert.equal(fs[p], 'deny', p);
    assert.equal(Object.keys(fs).some((p) => p.startsWith('~/.codex')), false);
    assert.equal(cx.sandbox_mode, undefined, 'a sandbox_mode would switch Codex back to the legacy settings and drop the profile');
    assert.equal(plan('claude-code').sessionMeta.claudeCode.options.settings.permissions.blockReadsOutsideWorkingDirectories, true);
    const oc = JSON.parse(Object.values(plan('opencode').files)[0]);
    assert.deepEqual(oc.permission.external_directory, { '*': 'deny' });
    for (const [name, a] of Object.entries(oc.agent)) assert.deepEqual(a.permission.external_directory, { '*': 'deny' }, name);
    assert.deepEqual(oc.permission.bash, { '*': 'ask' });
  });

  it('runs read-only through each engine\'s own mode', () => {
    assert.equal(plan('codex').level.mode.id, 'read-only');
    assert.equal(plan('claude-code').level.mode.id, 'default');
    assert.equal(plan('opencode').level.mechanism, 'opencode-permission');
  });

  it('sets a model through Claude Code\'s env key, and through the session for the others', () => {
    const cc = plan('claude-code', { model: 'claude-x' });
    assert.equal(cc.env.ANTHROPIC_MODEL, 'claude-x'); assert.equal(cc.modelViaSession, false);
    for (const engine of ['codex', 'opencode']) assert.equal(plan(engine, { model: 'm' }).modelViaSession, true, engine);
    assert.equal(plan('codex').modelViaSession, false, 'no model asked: the user\'s own');
  });
});

const tmpHome = (toml) => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
  if (toml !== null) writeFileSync(path.join(home, 'config.toml'), toml);
  return home;
};

describe('a user sandbox_mode', () => {
  it('is found however TOML writes the key, top level or in a profile', () => {
    assert.equal(codexSandboxModeSet({ CODEX_HOME: tmpHome(null) }), null);
    assert.equal(codexSandboxModeSet({ CODEX_HOME: tmpHome('model = "x"\n') }), null);
    for (const t of ['sandbox_mode = "read-only"', '"sandbox_mode" = "read-only"', "'sandbox_mode' = 'read-only'", 'model = "x"\n[profiles.fast]\nsandbox_mode = "workspace-write"']) {
      assert.ok(codexSandboxModeSet({ CODEX_HOME: tmpHome(t + '\n') }), t);
    }
  });
});
