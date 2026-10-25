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


it('records every finding, and tells the engine when one is off the diff or out of format', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'assayer-ft-'));
  const log = path.join(dir, 'tool-log.jsonl');
  writeFileSync(path.join(dir, 'd.diff'), 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -200,3 +202,10 @@\n x\n');
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER, 'github_inline_comment'], env: { ...process.env, ASSAYER_TOOL_LOG: log, ASSAYER_DIFF: path.join(dir, 'd.diff') } }));
  try {
    const off = await client.callTool({ name: 'create_inline_comment', arguments: { path: 'a.ts', line: 48, body: GOOD } });
    assert.match(JSON.parse(off.content[0].text).note, /line 48 of a\.ts is outside the diff.*202-211.*replaces: "f[0-9a-z]+-1"/s);
    const bare = await client.callTool({ name: 'create_inline_comment', arguments: { path: 'a.ts', line: 205, body: 'plain text' } });
    assert.match(JSON.parse(bare.content[0].text).note, /first line is not/);
    const good = await client.callTool({ name: 'create_inline_comment', arguments: { path: 'a.ts', line: 210, body: GOOD } });
    assert.equal(JSON.parse(good.content[0].text).note, undefined);
    assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 3, 'nothing is refused, so nothing is lost');
  } finally { await client.close(); }
});


it('a finding that misses the diff gets the numbered lines and an id, and a re-filing names it', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'assayer-ft-'));
  const log = path.join(dir, 'tool-log.jsonl');
  // The 0.0.2 walk's sandbox diff: the model filed lines 12 and 17 in a 10-line file.
  writeFileSync(path.join(dir, 'd.diff'), [
    'diff --git a/sum.js b/sum.js', '--- a/sum.js', '+++ b/sum.js', '@@ -1,6 +1,10 @@',
    '-// Sums the prices.', '+// Sums the prices with a discount.', '-export function total(items) {', '+export function total(items, discountPercent) {',
    '   let sum = 0;', '-  for (const item of items) sum += item.price;', '-  return sum;',
    '+  for (let i = 0; i <= items.length; i++) sum += items[i].price;', '+  return sum - sum * discountPercent;', '+}', '+',
    '+export function applyCoupon(code, coupons) {', "+  return eval('coupons.' + code);", ' }', ''].join('\n'));
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER, 'github_inline_comment'], env: { ...process.env, ASSAYER_TOOL_LOG: log, ASSAYER_DIFF: path.join(dir, 'd.diff') } }));
  try {
    const off = await client.callTool({ name: 'create_inline_comment', arguments: { path: 'sum.js', line: 17, body: GOOD } });
    const note = JSON.parse(off.content[0].text).note;
    assert.match(note, /line 17 of sum\.js is outside the diff/);
    assert.match(note, /^9:   return eval\('coupons\.' \+ code\);$/m);
    assert.match(note, /^4:   for \(let i = 0; i <= items\.length; i\+\+\)/m);
    const id = /replaces: "([^"]+)"/.exec(note)[1];
    const again = await client.callTool({ name: 'create_inline_comment', arguments: { path: 'sum.js', line: 9, body: GOOD, replaces: id } });
    assert.equal(JSON.parse(again.content[0].text).note, undefined);
    const rows = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(rows[0].id, id);
    assert.equal(rows[1].input.replaces, id);
    assert.equal(rows[1].id, undefined);
  } finally { await client.close(); }
});
