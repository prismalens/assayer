// `assayer doctor`: what this machine has for a round. It reports each engine as installed or
// not and its version, and never checks or warns about how an engine is signed in (PrismaLens's
// agent-sign-in-is-users-agreement ruling). A version other than the admitted one is a note.
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import { ENGINES } from './engines.js';

const MIN_NODE = 24;

export function onPath(cmd, env = process.env) {
  const exts = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD').split(';') : [''];
  for (const dir of (env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      try { accessSync(path.join(dir, cmd + ext), constants.X_OK); return path.join(dir, cmd + ext); } catch { /* next */ }
    }
  }
  return null;
}

function defaultProbe(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

const firstVersion = (s) => /\d+\.\d+\.\d+/.exec(s ?? '')?.[0] ?? null;

export function doctor({ probe = defaultProbe, which = onPath, nodeVersion = process.versions.node, platform = process.platform } = {}) {
  const checks = [];
  const add = (name, ok, detail, required = true) => checks.push({ name, ok, detail, required });
  if (platform === 'win32') add('platform', false, 'a round runs on Linux or macOS; on Windows, install and run Assayer inside WSL');

  add('node', Number.parseInt(nodeVersion, 10) >= MIN_NODE, `${nodeVersion} (needs ${MIN_NODE} or newer)`);
  for (const [name, args] of [['git', ['--version']], ['python3', ['--version']], ['gh', ['--version']]]) {
    const r = which(name) ? probe(name, args) : null;
    add(name, Boolean(r?.ok), r?.ok ? firstVersion(r.out) ?? 'installed' : 'not found on PATH');
  }
  const auth = which('gh') ? probe('gh', ['auth', 'status']) : null;
  add('gh sign-in', Boolean(auth?.ok), auth?.ok ? 'signed in' : 'run `gh auth login`');

  const engines = Object.entries(ENGINES).map(([id, row]) => {
    const cli = which(row.cli) ? probe(row.cli, ['--version']) : null;
    const adapter = row.command === row.cli ? cli?.ok : Boolean(which(row.command));
    const version = cli?.ok ? firstVersion(cli.out) : null;
    const ready = Boolean(cli?.ok && adapter);
    const missing = [...new Set([!cli?.ok && row.cli, !adapter && row.command].filter(Boolean))];
    const note = ready && row.admitted?.version && version && version !== row.admitted.version ? `; tested on ${row.admitted.version}` : '';
    const fix = [...new Set([!cli?.ok && row.install?.cli, !adapter && row.install?.adapter].filter(Boolean))];
    add(`engine ${id}`, ready, ready ? `${row.cli} ${version ?? ''}${note}`.trim() : `missing ${missing.join(' and ')}${fix.length ? `: npm i -g ${fix.join(' ')}` : ''}`, false);
    return ready;
  });

  const ok = checks.filter((c) => c.required).every((c) => c.ok) && engines.some(Boolean);
  return { ok, checks };
}

export function formatDoctor({ ok, checks }) {
  const lines = checks.map((c) => `${c.ok ? 'ok     ' : c.required ? 'missing' : '-      '}  ${c.name.padEnd(20)} ${c.detail}`);
  lines.push('', ok ? 'ready: assayer review can run here' : 'not ready: fix the missing lines above; at least one engine is needed');
  return lines.join('\n');
}
