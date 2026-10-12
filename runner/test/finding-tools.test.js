import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = fileURLToPath(new URL('../src/finding-tools.js', import.meta.url));
const GOOD = '_🎯 Functional Correctness_ | _🟠 Major_ | _⚡ Quick win_\n\n**Off by one**\n\nbody';

it('refuses an inline finding off the diff, names the lines, and records only the good one', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'assayer-ft-'));
  const log = path.join(dir, 'tool-log.jsonl');
  writeFileSync(path.join(dir, 'd.diff'), 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -200,3 +202,10 @@\n x\n');
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER, 'github_inline_comment'], env: { ...process.env, ASSAYER_TOOL_LOG: log, ASSAYER_DIFF: path.join(dir, 'd.diff') } }));
  try {
    const bad = await client.callTool({ name: 'create_inline_comment', arguments: { path: 'a.ts', line: 48, body: GOOD } });
    assert.equal(bad.isError, true);
    assert.match(bad.content[0].text, /line 48 of a\.ts is outside the diff on the RIGHT side; the diff's RIGHT lines are 202-211/);
    assert.equal(existsSync(log), false, 'nothing recorded for the refused call');
    const good = await client.callTool({ name: 'create_inline_comment', arguments: { path: 'a.ts', line: 210, body: GOOD } });
    assert.notEqual(good.isError, true);
    assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 1);
  } finally { await client.close(); }
});

it('tells the engine that no commit id is needed', async () => {
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER, 'github_inline_comment'], env: { ...process.env, ASSAYER_TOOL_LOG: path.join(mkdtempSync(path.join(os.tmpdir(), 'assayer-ft-')), 'log') } }));
  try {
    const { tools } = await client.listTools();
    const t = tools.find((x) => x.name === 'create_inline_comment');
    assert.match(t.description, /no commit id is needed/);
    assert.match(t.inputSchema.properties.commitId.description, /Leave this out/);
  } finally { await client.close(); }
});

it('refuses a finding body without the header line or a bold title, and records it as refused', async () => {
  const { formatProblem } = await import('../src/finding-rules.js');
  assert.equal(formatProblem(GOOD), null);
  assert.match(formatProblem('Cache key omits userId.\n\n**Reason:** x\n\nCategory: Correctness | Severity: High'), /first line must be exactly/);
  assert.match(formatProblem('_🎯 Functional Correctness_ | _🟠 Major_ | _⚡ Quick win_\n\nno title here'), /bold title/);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'assayer-ft-'));
  const log = path.join(dir, 'tool-log.jsonl');
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER, 'github_inline_comment'], env: { ...process.env, ASSAYER_TOOL_LOG: log } }));
  try {
    const bad = await client.callTool({ name: 'create_inline_comment', arguments: { path: 'a.ts', line: 1, body: 'plain text' } });
    assert.equal(bad.isError, true);
    assert.equal(existsSync(log), false);
    assert.equal(readFileSync(`${log}.refused`, 'utf8').trim().split('\n').length, 1);
  } finally { await client.close(); }
});
