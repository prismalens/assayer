// The engines Assayer offers. What to spawn, its env and its user setup come from
// @prismalens/agent-host; a row here holds only Assayer's own facts and boundaries (#13).
import { readFileSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';
import os from 'node:os';
import path from 'node:path';
import { AGENT_REGISTRY, detectAgent, mergeConfigPatch, planLaunch } from '@prismalens/agent-host';
import { shippedAdapter } from '@prismalens/agent-adapters';

// The engine gets the user's own environment and setup, minus Assayer's own secrets and any
// GitHub credential (prismalens#817 ruling, 2026-10-25).
export const LAUNCH_POLICY = Object.freeze({
  userSetup: 'inherit',
  github: 'exclude',
  floor: { mode: 'inherit-minus-own-secrets', ownSecrets: { prefixes: ['ASSAYER_'], names: ['GH_TOKEN', 'GITHUB_TOKEN'] } },
});

// Codex's read-only mode reads the whole disk, and codex-acp's per-turn policy drops any narrower
// allow, but keeps deny entries. So the engine is kept out of where credentials live.
export const CODEX_DENY = Object.freeze(Object.fromEntries([
  '~/.config/gh', '~/.ssh', '~/.aws', '~/.azure', '~/.config/gcloud', '~/.kube', '~/.docker', '~/.npmrc', '~/.netrc',
  '~/.git-credentials', '~/.config/git/credentials', '~/.gnupg', '~/.claude/.credentials.json', '~/.local/share/opencode/auth.json',
].map((p) => [p, 'deny'])));

// The user's Codex config, read with a TOML parser: quoted keys, inline tables and comments are all
// valid there, and a regex missed them.
function codexConfig(env, file = path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml')) {
  try { return { file, toml: parseToml(readFileSync(file, 'utf8')) }; } catch { return { file, toml: null }; }
}
const profilesOf = (toml) => Object.values(toml?.profiles && typeof toml.profiles === 'object' ? toml.profiles : {});

// Codex ignores a permission profile when any loaded config sets sandbox_mode (its permissions
// docs), and the deny list above goes with it. Assayer leaves the user's CODEX_HOME in place.
export function codexSandboxModeSet(env = process.env) {
  const { file, toml } = codexConfig(env);
  if (!toml) return null;
  return toml.sandbox_mode !== undefined || profilesOf(toml).some((p) => p?.sandbox_mode !== undefined) ? file : null;
}

const binaries = (agent) => ({ command: AGENT_REGISTRY[agent].binary, cli: AGENT_REGISTRY[agent].companionBinary ?? AGENT_REGISTRY[agent].binary });

export const ENGINES = Object.freeze({
  opencode: {
    agent: 'opencode',
    ...binaries('opencode'),
    install: { cli: 'opencode-ai@1.18.30', signIn: null },
    admitted: { version: '1.18.30', by: 'prismalens#561' },
    stallMin: 5,
  },
  codex: {
    agent: 'codex',
    ...binaries('codex'),
    install: { cli: '@openai/codex', signIn: 'run `codex login`' },
    admitted: null,
    // Sol caps each tool output at 10k tokens; the Codex template reads the diff per file
    // instead of the lane's six scripted agents (#184 comment 6096062849).
    promptTemplate: 'codex.md',
    timeoutMin: 90,
    idleMin: 15,
    // Boundaries, not setup: no reads where credentials live, no web, and no browser or computer
    // use, which act as the user on GitHub (a real round tried Codex's GitHub app to post).
    overrides: { CODEX_CONFIG: JSON.stringify({
      web_search: 'disabled',
      features: { browser_use: false, browser_use_external: false, computer_use: false },
      default_permissions: 'assayer', permissions: { assayer: { filesystem: { glob_scan_max_depth: 3, ':minimal': 'read', ':workspace_roots': 'read', ...CODEX_DENY } } },
    }) },
  },
  'claude-code': {
    agent: 'claude-code',
    ...binaries('claude-code'),
    install: { cli: '@anthropic-ai/claude-code', signIn: 'run `claude` and type `/login`' },
    admitted: null, // prismalens#639 passes the gate; no admission record in this repo yet
    // A boundary over the user's settings: no reads outside the checkout.
    sessionMeta: { claudeCode: { options: { settings: { permissions: { blockReadsOutsideWorkingDirectories: true } } } } },
  },
});

// OpenCode reads outside the checkout only through external_directory, which the level sets to ask;
// a read is allowed by the policy, so Assayer denies it on every agent the level names.
function denyOutsideReads(files) {
  return Object.fromEntries(Object.entries(files).map(([file, content]) => {
    if (path.basename(file) !== 'opencode.json') return [file, content];
    const cfg = JSON.parse(content);
    const deny = { permission: { external_directory: { '*': 'deny' } } };
    const agents = Object.fromEntries(Object.keys(cfg.agent ?? {}).map((a) => [a, deny]));
    return [file, JSON.stringify(mergeConfigPatch(cfg, { ...deny, agent: agents }), null, 2)];
  }));
}

// The user's own adapter on PATH wins, else the one Assayer ships once the agent's CLI is on PATH,
// as PrismaLens's harnessLaunch does (#13). `which` lets doctor and setup ask without spawning.
export function engineLaunch(row, { pathEnv = process.env.PATH, which = null } = {}) {
  const d = AGENT_REGISTRY[row.agent];
  if (!which) return detectAgent(row.agent, { pathEnv, shippedAdapter }, d);
  if (which(d.binary)) return { command: d.binary, args: [] };
  const script = d.adapterPackage && d.companionBinary && which(d.companionBinary) ? shippedAdapter(d.adapterPackage) : null;
  return script ? { command: process.execPath, args: [script], shipped: true } : null;
}

// One round's launch plan. `row.launch` and `row.descriptor` let a test start a fake agent.
// A model goes in the row's env key when it has one, else through the session's model option.
export function planRound(row, { cwd, runDir, hostEnv = process.env, model = null, overrides = {} }) {
  const descriptor = row.descriptor ?? AGENT_REGISTRY[row.agent];
  const launch = row.launch ?? engineLaunch(row, { pathEnv: hostEnv.PATH }) ?? { command: row.command };
  const modelEnv = model && descriptor.envModelKey ? { [descriptor.envModelKey]: model } : {};
  const plan = planLaunch({
    agent: row.agent, level: 'supervised', policy: LAUNCH_POLICY, launch, cwd, runDir, hostEnv, descriptor,
    overrides: { ...row.overrides, ...modelEnv, ...overrides },
  });
  const sessionMeta = row.sessionMeta ? mergeConfigPatch(plan.sessionMeta ?? {}, row.sessionMeta) : plan.sessionMeta;
  return { ...plan, files: denyOutsideReads(plan.files), sessionMeta, modelViaSession: Boolean(model && !descriptor.envModelKey) };
}

// npm 11 skips install scripts unless allowed; Claude Code's and OpenCode's postinstalls put their
// native binaries in place.
const NEEDS_SCRIPTS = ['@anthropic-ai/claude-code', 'opencode-ai'];
export function installArgs(missing) {
  const pkgs = missing.map((m) => m.pkg);
  const allow = pkgs.filter((p) => NEEDS_SCRIPTS.some((n) => p === n || p.startsWith(`${n}@`)));
  return ['i', '-g', ...pkgs, ...allow.map((p) => `--allow-scripts=${p.replace(/(.)@[^/]*$/, '$1')}`)];
}
