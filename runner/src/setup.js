// Getting an engine ready from the one command a stranger ran: what is missing, the exact
// npm command for it, and on a terminal an offer to run it. The engine's own sign-in stays
// the user's to do; Assayer only names the command.
import { spawnSync } from 'node:child_process';
import { ENGINES } from './engines.js';
import { onPath } from './doctor.js';

export const LABELS = { codex: 'Codex', 'claude-code': 'Claude Code', opencode: 'OpenCode' };

export function missingFor(engine, which = onPath) {
  const row = ENGINES[engine];
  const out = [];
  if (!which(row.cli)) out.push({ what: `the ${row.cli} CLI`, pkg: row.install.cli });
  if (row.command !== row.cli && !which(row.command)) out.push({ what: `its ACP adapter ${row.command}`, pkg: row.install.adapter });
  return out;
}

// npm 11 skips install scripts unless allowed; Claude Code's and OpenCode's postinstalls put their
// native binaries in place.
const NEEDS_SCRIPTS = ['@anthropic-ai/claude-code', 'opencode-ai'];
export function installArgs(missing) {
  const pkgs = missing.map((m) => m.pkg);
  const allow = pkgs.filter((p) => NEEDS_SCRIPTS.some((n) => p === n || p.startsWith(`${n}@`)));
  return ['i', '-g', ...pkgs, ...allow.map((p) => `--allow-scripts=${p.replace(/(.)@[^/]*$/, '$1')}`)];
}
export const installCommand = (missing) => `npm ${installArgs(missing).join(' ')}`;

export function setupHint(engine, missing) {
  const row = ENGINES[engine];
  const lines = [`${LABELS[engine]} needs ${missing.map((m) => m.what).join(' and ')}:`, `  ${installCommand(missing)}`];
  if (row.install.signIn) lines.push(`then sign in once: ${row.install.signIn}.`);
  return lines.join('\n');
}

// Returns true when the engine is installed afterwards. `confirm` and `run` are injectable.
export async function offerSetup(engine, { which = onPath, confirm, run = defaultRun, log = (s) => process.stderr.write(s + '\n') } = {}) {
  const missing = missingFor(engine, which);
  if (!missing.length) return true;
  log(setupHint(engine, missing));
  if (!(await confirm(`Run \`${installCommand(missing)}\` now?`))) return false;
  if (run(installArgs(missing)) !== 0) { log('assayer: the install failed; the npm output above says why'); return false; }
  const still = missingFor(engine, which);
  if (still.length) { log(`assayer: still missing ${still.map((m) => m.what).join(' and ')} on PATH after the install`); return false; }
  if (ENGINES[engine].install.signIn) log(`assayer: ${LABELS[engine]} is installed. If you have not signed in yet: ${ENGINES[engine].install.signIn}.`);
  return true;
}

function defaultRun(args) {
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { stdio: 'inherit' });
  return r.status ?? 1;
}
