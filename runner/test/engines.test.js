import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINES } from '../src/engines.js';

describe('engine rows', () => {
  it('Claude Code asks before every gated call and reads only its checkout', () => {
    const row = ENGINES['claude-code'];
    assert.equal(row.sessionMode, 'default');
    assert.deepEqual(row.sessionMeta.claudeCode.options.settingSources, []);
    assert.equal(row.sessionMeta.claudeCode.options.settings.permissions.blockReadsOutsideWorkingDirectories, true);
  });

  it('Codex and OpenCode keep their own controls and set no mode', () => {
    assert.equal(ENGINES.codex.sessionMode, undefined);
    assert.equal(ENGINES.opencode.sessionMode, undefined);
  });
});
