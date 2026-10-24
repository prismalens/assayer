#!/usr/bin/env node
// The lane's two comment tools, as one stdio MCP server the runner offers in session/new.
// Nothing is posted: each call is appended as a JSON line to $ASSAYER_TOOL_LOG and the
// engine is told it succeeded. The poster renders them later.
// Server name is argv[2]: `github_inline_comment` serves create_inline_comment,
// `github_comment` serves update_claude_comment, so the engine sees the same
// mcp__<server>__<tool> names the Actions lane's prompt uses.
import { appendFileSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { looksLikeSecret } from './acp-map.js';
import { anchorProblem, hunkRanges, numberedLines } from './diff-lines.js';
import { formatProblem } from './finding-rules.js';

const which = process.argv[2];
const log = process.env.ASSAYER_TOOL_LOG;
if (!which || !log) {
  process.stderr.write('usage: finding-tools.js <github_inline_comment|github_comment>, with ASSAYER_TOOL_LOG set\n');
  process.exit(2);
}

function record(tool, input, extra = {}) {
  // Redact before the write, not after: SessionMapper filters when it reads this log back, by
  // which time an unredacted body is already on disk for anyone who collects it (CWE-532).
  const secret = typeof input?.body === 'string' && looksLikeSecret(input.body);
  const entry = secret ? { ...input, body: null } : input;
  appendFileSync(log, JSON.stringify({
    at: new Date().toISOString(), server: which, tool, input: entry, ...extra,
    ...(secret ? { redacted: 'credential-shaped body' } : {}),
  }) + '\n');
}

let diff = null;
let offDiff = 0;
try { if (process.env.ASSAYER_DIFF) diff = hunkRanges(readFileSync(process.env.ASSAYER_DIFF, 'utf8')); } catch { diff = null; }

const server = new McpServer({ name: which, version: '0.0.0' });

if (which === 'github_inline_comment') {
  server.registerTool('create_inline_comment', {
    // Engines reached for `git rev-parse HEAD` to fill commitId, were refused, and filed nothing.
    description: 'Create an inline review comment on a specific line or range of the pull request diff. Assayer anchors every comment on the head commit itself; no commit id is needed.',
    inputSchema: {
      path: z.string().describe('File path relative to the repository root, as in the diff.'),
      body: z.string(),
      line: z.number().int().optional().describe('Last line of the range, in the new file (RIGHT) unless side is LEFT.'),
      startLine: z.number().int().optional().describe('First line of a multi-line range, in the same hunk as line.'),
      side: z.enum(['LEFT', 'RIGHT']).optional(),
      startSide: z.enum(['LEFT', 'RIGHT']).optional(),
      subjectType: z.string().optional(),
      commitId: z.string().optional().describe('Leave this out: Assayer uses the head commit.'),
      replaces: z.string().optional().describe('The id a reply gave a finding that missed the diff; this filing takes its place.'),
    },
  }, async (input) => {
    // Every finding is recorded, so none is lost if the engine never re-files it. One that misses
    // the diff gets an id and the diff's numbered lines; a re-filing that names the id takes its
    // place, and without one it posts as a plain comment.
    const format = formatProblem(input.body);
    const anchor = format ? null : diff && anchorProblem(diff, input, process.env.ASSAYER_CHECKOUT || null);
    const id = anchor ? `f${process.pid.toString(36)}-${++offDiff}` : null; // unique across server processes
    record('create_inline_comment', input, id ? { id } : {});
    let note = format ? `Recorded as written, but ${format}. Do not file this finding again; apply this to the next ones.` : null;
    if (anchor) {
      const rel = process.env.ASSAYER_CHECKOUT ? relative(process.env.ASSAYER_CHECKOUT, resolve(process.env.ASSAYER_CHECKOUT, String(input.path))) : String(input.path);
      const lines = numberedLines(diff, rel, input.side === 'LEFT' ? 'LEFT' : 'RIGHT', input.line);
      note = `Not placed inline: ${anchor}${lines ? ` The diff's lines of ${rel}, numbered:\n${lines}\n` : ' '}File it again with the line that holds the defect and replaces: "${id}"; if you do not, it posts as a plain comment.`;
    }
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, recorded: true, ...(note ? { note } : {}) }) }] };
  });
} else if (which === 'github_comment') {
  server.registerTool('update_claude_comment', {
    description: 'Update the review summary comment with the given body.',
    inputSchema: { body: z.string() },
  }, async (input) => {
    record('update_claude_comment', input);
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, recorded: true }) }] };
  });
} else {
  process.stderr.write(`finding-tools: unknown server ${which}\n`);
  process.exit(2);
}

await server.connect(new StdioServerTransport());
