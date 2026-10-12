import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findingLine, startProgress } from '../src/progress.js';

const body = (sev, title) => `_🎯 Functional Correctness_ | _${sev}_ | _⚡ Quick win_\n<details>x</details>\n**${title}**`;
const sink = (isTTY) => ({ isTTY, columns: 100, out: '', write(s) { this.out += s; } });
const plain = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

describe('live view', () => {
  it('prints nothing when stderr is not a terminal', () => {
    const s = sink(false);
    startProgress(mkdtempSync(path.join(os.tmpdir(), 'assayer-prog-')), { engine: 'codex', stream: s }).stop();
    assert.equal(s.out, '');
  });

  it('shows each finding once as it is filed, and counts reported tool calls', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'assayer-prog-'));
    writeFileSync(path.join(dir, 'raw.jsonl'), '');
    writeFileSync(path.join(dir, 'tool-log.jsonl'), '');
    const s = sink(true);
    const view = startProgress(dir, { engine: 'claude-code', stream: s, every: 1e9 });
    const call = JSON.stringify({ kind: 'update', notification: { update: { sessionUpdate: 'tool_call' } } });
    appendFileSync(path.join(dir, 'raw.jsonl'), `${call}\n${call}\n{"kind":"upd`);
    appendFileSync(path.join(dir, 'tool-log.jsonl'), JSON.stringify({ tool: 'create_inline_comment', input: { path: 'src/a.ts', line: 7, body: body('🔴 Critical', 'Cache key leaves out userId') } }) + '\n');
    appendFileSync(path.join(dir, 'tool-log.jsonl'), JSON.stringify({ tool: 'update_claude_comment', input: { body: '## Code review' } }) + '\n');
    view.stop();
    const out = plain(s.out);
    assert.match(out, /● Critical src\/a\.ts:7 {2}Cache key leaves out userId\n/);
    assert.match(out, /claude-code reviewing · 0:00 · 2 tool calls · 1 filed/);
    assert.equal(out.match(/Cache key/g).length, 1);
  });

  it('strips terminal control characters from engine text', () => {
    const line = findingLine({ input: { path: 'a\x1b[2Jb', line: 1, body: body('🟡 Minor', 'x\x07y') } }, { color: false });
    assert.equal(line, '  ● Minor    a [2Jb:1  x y');
  });
});
