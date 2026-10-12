# Assayer

Open source code review that runs on your machine with your own Codex, Claude Code or OpenCode sign-in. It posts findings on the pull request under your own GitHub login, and on the next round re-checks its own threads and resolves the ones you fixed. There is no hosted service and no extra API key.

Status: alpha. Until the first npm release, install from a checkout.

## Install

```bash
git clone https://github.com/prismalens/assayer && cd assayer
cd runner && npm ci && npm link
npm i -g @openai/codex@0.162.1 @agentclientprotocol/codex-acp@2.1.1 && codex login    # the default engine
gh auth login
```

After the first release the first two lines become `npm i -g @prismalens/assayer`. Either way you need Node 24 or newer, `git`, `python3`, `gh` and one engine signed in.

`assayer doctor` checks what this machine has for a round: Node, git, python3, gh and its sign-in, and which engines are installed.

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

## Telemetry

The first `assayer` run in a terminal prints a notice and sends nothing. Later runs send usage counts to PostHog's EU region, so we can see whether Assayer is used and where rounds fail.

| Event | Properties |
| --- | --- |
| `install_active` | at most once a UTC day |
| `round_finished` | engine, conclusion, findings bucket (`0`, `1`, `2-5`, `6-20`, `>20`), duration bucket, whether it was posted |
| `refused` | engine, and which refusal: `closed`, `skip_label`, `already_reviewed`, `repo_config` |

Every event also carries `product`, how it was installed (`npm` or `checkout`), OS, CPU architecture, Node major version, the Assayer version, and a random install id kept in `~/.assayer/telemetry.json`. Timestamps are cut to the UTC day, and IP geolocation is turned off. Assayer never sends repository names, paths, logins, code, prompts, findings or model output.

`assayer telemetry off` turns it off, and `assayer telemetry status` shows the last 20 events sent. `ASSAYER_TELEMETRY=off`, `DO_NOT_TRACK=1` and `CI` each turn it off whatever the stored answer, and a run with no terminal never shows the notice, so it never starts.

## Layout

| Path | What it is |
| --- | --- |
| `runner/` | The `assayer` CLI and the engine runner over the Agent Client Protocol |
| `plugin/` | The Claude Code and Codex plugin |

## License

Apache-2.0. See `LICENSE`.

Contributing: see CONTRIBUTING.md. Security reports: see SECURITY.md.
