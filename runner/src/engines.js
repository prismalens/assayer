// The engine registry: what to spawn and how it takes its model and credential. Every row is
// an ACP agent on stdio. A row enters only after an admission run passes; `admitted` records it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import os from 'node:os';
import path from 'node:path';

// Env is an allowlist per row, never the runner's whole environment (prismalens#169).
const BASE_ENV = ['PATH', 'HOME', 'LANG', 'TERM', 'TMPDIR', 'NODE_OPTIONS'];

// Codex's read-only mode reads the whole disk, and codex-acp's per-turn policy drops any narrower
// allow, but keeps deny entries. So the default engine is kept out of where credentials live.
export const CODEX_DENY = Object.freeze(Object.fromEntries([
  '~/.config/gh', '~/.ssh', '~/.aws', '~/.azure', '~/.config/gcloud', '~/.kube', '~/.docker', '~/.npmrc', '~/.netrc',
  '~/.git-credentials', '~/.config/git/credentials', '~/.gnupg', '~/.claude/.credentials.json', '~/.local/share/opencode/auth.json',
].map((p) => [p, 'deny'])));

// The user's Codex config, read with a TOML parser: quoted keys, inline tables and comments are all
// valid there, and a regex missed them (adversary OBJ-012, OBJ-018).
function codexConfig(env) {
  const file = path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml');
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

// The user's own MCP servers: a real round's Codex called the user's Notion tools unasked. Codex's
// own inventory and the parsed config, top level and every profile, unioned.
export function codexUserMcpServers(env = process.env, list = codexMcpList) {
  const { toml } = codexConfig(env);
  const names = new Set([toml?.mcp_servers, ...profilesOf(toml).map((p) => p?.mcp_servers)]
    .filter((t) => t && typeof t === 'object').flatMap((t) => Object.keys(t)));
  for (const n of list(env)) names.add(n);
  return [...names];
}

function codexMcpList(env) {
  const r = spawnSync('codex', ['mcp', 'list', '--json'], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 15_000 });
  try { return r.status === 0 ? JSON.parse(r.stdout).map((s) => s.name).filter((n) => typeof n === 'string') : []; } catch { return []; }
}

// Codex loads a trusted project's .codex/config.toml, and codex-acp trusts the checkout, so a pull
// request could configure the engine reviewing it. The checkout's .codex/ and .agents/ (skills) are
// replaced before the engine starts; the review still sees them in the staged diff. The written
// config switches off the user's own MCP servers, which no thread-level override reached.
export function sealCodexCheckout(cwd, env = process.env) {
  rmSync(path.join(cwd, '.codex'), { recursive: true, force: true });
  rmSync(path.join(cwd, '.agents'), { recursive: true, force: true });
  const servers = codexUserMcpServers(env);
  mkdirSync(path.join(cwd, '.codex'), { recursive: true });
  writeFileSync(path.join(cwd, '.codex', 'config.toml'), stringifyToml({ mcp_servers: Object.fromEntries(servers.map((n) => [n, { enabled: false }])) }));
  return servers;
}

export const ENGINES = Object.freeze({
  opencode: {
    command: 'opencode',
    cli: 'opencode',
    install: { cli: 'opencode-ai@1.18.30', signIn: null },
    // --pure: no user plugins or global config; --cwd pins the project. Mirrors the prismalens
    // registry row that passed the #561 admission run.
    args: ({ cwd }) => ['acp', '--pure', '--cwd', cwd],
    envAllow: [...BASE_ENV, 'GH_TOKEN', 'GITHUB_TOKEN', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'],
    credentialKinds: ['api-key', 'user-login'],
    admitted: { version: '1.18.30', by: 'prismalens#561' },
    // OpenCode Zen's free tier needs no key or login. Of its free, non-deprecated, tool-calling
    // rows in the models.dev catalog on 2026-09-19, Muse Spark 1.3 (2026-09-02, 1M context) is
    // the newest; MiMo V2.5 and Nemotron 3 Ultra stalled on the lane's subagent plan.
    defaultModel: 'opencode/muse-spark-1.3-contributor-free',
    // The runner writes the engine's whole config per run: model, and the permission block
    // that makes OpenCode ask before an edit or a shell command so the ACP policy is the
    // answer. Without it OpenCode edits and runs without asking (verified 2026-09-19 on
    // 1.18.30: an edit, a delete and a redirect all landed with no request_permission).
    // The repo's own opencode.json and CLAUDE.md-style files stay inert.
    prepare({ model, outDir, env }) {
      const configDir = path.join(outDir, 'engine-config');
      const dataDir = path.join(outDir, 'engine-xdg');
      mkdirSync(configDir, { recursive: true }); mkdirSync(dataDir, { recursive: true });
      writeFileSync(path.join(configDir, 'opencode.json'), JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        ...(model ? { model } : {}),
        permission: { edit: 'ask', bash: 'ask', webfetch: 'deny', websearch: 'deny', external_directory: 'deny' },
        // A refused tool would otherwise end the turn before the summary (prismalens#639 finding 1).
        experimental: { continue_loop_on_deny: true },
        share: 'disabled',
      }, null, 2) + '\n');
      return {
        ...env, XDG_CONFIG_HOME: dataDir, OPENCODE_CONFIG_DIR: configDir,
        OPENCODE_DISABLE_PROJECT_CONFIG: '1', OPENCODE_DISABLE_CLAUDE_CODE: '1',
      };
    },
  },
  codex: {
    // @agentclientprotocol/codex-acp, the maintained adapter on the Codex App Server. Zed's
    // @zed-industries/codex-acp 0.16.0 is deprecated: its old core is refused gpt-6.1 on a
    // ChatGPT login, and its only refusal aborts the turn.
    command: 'codex-acp',
    cli: 'codex',
    install: { cli: '@openai/codex', adapter: '@agentclientprotocol/codex-acp@2.1.1', signIn: 'run `codex login`' },
    args: () => [],
    envAllow: [...BASE_ENV, 'GH_TOKEN', 'GITHUB_TOKEN', 'CODEX_HOME', 'OPENAI_API_KEY', 'CODEX_API_KEY'],
    credentialKinds: ['api-key', 'user-login'],
    admitted: null,
    // Sol defaults to low effort and caps each tool output at 10k tokens; the Codex template
    // reads the diff per file instead of the lane's six scripted agents (#184 comment 6096062849).
    promptTemplate: 'codex.md',
    timeoutMin: 90,
    idleMin: 15,
    // The adapter's default mode writes the workspace with an automatic reviewer. read-only puts
    // Codex's own sandbox around every command and asks the runner before leaving it. The
    // sign-in stays in the user's CODEX_HOME: a copied auth.json forks the rotating refresh token.
    sealCheckout: sealCodexCheckout,
    prepare({ model, env }) {
      return {
        ...env, INITIAL_AGENT_MODE: 'read-only', NO_BROWSER: '1',
        CODEX_CONFIG: JSON.stringify({
          web_search: 'disabled', project_doc_max_bytes: 0, model_reasoning_effort: 'xhigh', ...(model ? { model } : {}),
          // A real round tried Codex's own GitHub app to post its summary; no app, browser or computer use.
          features: { plugins: false, apps: false, browser_use: false, browser_use_external: false, computer_use: false },
          default_permissions: 'assayer', permissions: { assayer: { filesystem: { glob_scan_max_depth: 3, ':minimal': 'read', ':workspace_roots': 'read', ...CODEX_DENY } } },
        }),
      };
    },
  },
  'claude-code': {
    command: 'claude-agent-acp',
    cli: 'claude',
    install: { cli: '@anthropic-ai/claude-code', adapter: '@agentclientprotocol/claude-agent-acp@0.89.1', signIn: 'run `claude` and type `/login`' },
    args: () => [],
    envAllow: [...BASE_ENV, 'GH_TOKEN', 'GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_MODEL', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_EXECUTABLE', 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS',
      'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'],
    credentialKinds: ['api-key', 'bedrock', 'vertex', 'foundry', 'user-login'],
    admitted: null, // prismalens#639 passes the gate; no admission record in this repo yet
    // No user settings, hooks, plugins or CLAUDE.md, and no reads outside the checkout. The adapter
    // starts in the user's own defaultMode ("auto" ran shell unasked), so the round sets Always ask
    // and every gated call reaches the policy (planner ruling, run-plan 2026-10-13).
    sessionMeta: { claudeCode: { options: { settingSources: [], strictMcpConfig: true, settings: { permissions: { blockReadsOutsideWorkingDirectories: true }, attribution: { commit: '', pr: '' }, includeCoAuthoredBy: false } } } },
    sessionMode: 'default',
    prepare({ model, env }) {
      return { ...env, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1', ...(model ? { ANTHROPIC_MODEL: model } : {}) };
    },
  },
});

// npm 11 skips install scripts unless allowed; Claude Code's and OpenCode's postinstalls put their
// native binaries in place.
const NEEDS_SCRIPTS = ['@anthropic-ai/claude-code', 'opencode-ai'];
export function installArgs(missing) {
  const pkgs = missing.map((m) => m.pkg);
  const allow = pkgs.filter((p) => NEEDS_SCRIPTS.some((n) => p === n || p.startsWith(`${n}@`)));
  return ['i', '-g', ...pkgs, ...allow.map((p) => `--allow-scripts=${p.replace(/(.)@[^/]*$/, '$1')}`)];
}

// `extraAllow` names one credential variable the caller handed this round (--credential-env),
// so a key under a name of the operator's choosing reaches the engine and nothing else does.
export function engineEnv(row, source = process.env, extraAllow = []) {
  const out = {};
  for (const k of [...row.envAllow, ...extraAllow]) if (source[k] !== undefined) out[k] = source[k];
  return out;
}
