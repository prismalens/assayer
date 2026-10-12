# Assayer

Open source code review that runs on your machine with your own Codex, Claude Code or OpenCode sign-in. It posts findings on the pull request under your own GitHub login, and on the next round re-checks its own threads and resolves the ones you fixed. There is no hosted service and no extra API key.

Status: alpha. Install is from a checkout until the first npm release.

## Install

```bash
git clone https://github.com/prismalens/assayer && cd assayer
(cd worker && npm ci --omit=dev) && cd runner && npm ci && npm link
npm i -g @openai/codex@0.162.1 @agentclientprotocol/codex-acp@2.1.1 && codex login    # the default engine
gh auth login
```

## Review a pull request

```bash
assayer review owner/repo#123            # review and print
assayer review owner/repo#123 --post     # post the findings under your gh login
```

`runner/README.md` has every flag, the refusals, and how a round re-checks its own threads.

## Use it from Claude Code or Codex

The `assayer-review` skill teaches an agent to run a round, show you the findings before posting, and work the threads.

- Claude Code: `/plugin marketplace add prismalens/assayer`, then `/plugin install assayer@assayer`.
- Codex: copy `plugin/skills/assayer-review` into `~/.codex/skills/`.

## Layout

| Path | What it is |
| --- | --- |
| `runner/` | The `assayer` CLI and the engine runner over the Agent Client Protocol |
| `worker/` | Cloudflare Worker: optional telemetry, and the poster the CLI imports |
| `dashboard/` | Optional console over the telemetry |
| `plugin/` | The Claude Code and Codex plugin |
| `docs/design/` | Architecture and the engine credential research |

## License

Apache-2.0. See `LICENSE`.
