// The live view while a round runs, on a terminal only: elapsed time, the tool calls the engine
// reported, and each finding the moment the engine files it. Only what the round directory
// records is shown; no file counts or progress estimate (the engines report reads unevenly).
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { oneLine as clean, severityOf } from './local.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SEV = { critical: ['Critical', 31], major: ['Major', 33], minor: ['Minor', 36] };

// New complete lines appended to a file since the last call.
function tail(file) {
  let offset = 0; let rest = '';
  return () => {
    let size;
    try { size = statSync(file).size; } catch { return []; }
    if (size <= offset) return [];
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(size - offset);
    try { readSync(fd, buf, 0, buf.length, offset); } finally { closeSync(fd); }
    offset = size;
    const parts = (rest + buf.toString('utf8')).split('\n');
    rest = parts.pop();
    return parts.filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  };
}

export function findingLine(entry, { color = true } = {}) {
  const body = entry.input?.body;
  if (typeof body !== 'string') return null;
  const after = body.slice(body.indexOf('</details>') + 1);
  const title = clean(/\*\*(.+?)\*\*/.exec(after)?.[1] ?? body.split('\n')[0]).slice(0, 110);
  const [label, code] = SEV[severityOf(body)];
  const tag = color ? `\x1b[${code}m● ${label.padEnd(8)}\x1b[0m` : `● ${label.padEnd(8)}`;
  return `  ${tag} ${clean(entry.input.path)}:${entry.input.line ?? '?'}  ${title}`;
}

export function startProgress(dir, { engine, stream = process.stderr, now = Date.now, every = 100 } = {}) {
  if (!stream.isTTY) return { stop() {} };
  const started = now();
  const raw = tail(path.join(dir, 'raw.jsonl'));
  const tools = tail(path.join(dir, 'tool-log.jsonl'));
  let calls = 0; let filed = 0; let frame = 0; let last = started;
  const clock = () => { const s = Math.floor((now() - started) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const tick = () => {
    for (const e of raw()) {
      if (e.kind !== 'update') continue;
      last = now();
      if (e.notification?.update?.sessionUpdate === 'tool_call') calls += 1;
    }
    const out = [];
    for (const e of tools()) {
      if (e.tool !== 'create_inline_comment') continue;
      const line = findingLine(e);
      if (line) { filed += 1; out.push(line); }
    }
    // A stalled provider looks like slow work from here; say how long it has been quiet.
    const quiet = Math.floor((now() - last) / 1000);
    const hush = quiet >= 120 ? ` · quiet ${Math.floor(quiet / 60)}m, Ctrl-C stops it` : '';
    const status = `${FRAMES[frame++ % FRAMES.length]} ${engine} reviewing · ${clock()} · ${calls} tool call${calls === 1 ? '' : 's'} · ${filed} filed${hush}`;
    stream.write(`\r\x1b[2K${out.map((l) => l + '\n').join('')}\x1b[2m${status.slice(0, (stream.columns ?? 120) - 1)}\x1b[0m`);
  };
  const timer = setInterval(tick, every);
  let stopped = false;
  return { stop() { if (stopped) return; stopped = true; clearInterval(timer); tick(); stream.write('\r\x1b[2K'); } };
}
