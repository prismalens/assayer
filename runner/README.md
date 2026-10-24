# runner

> **Assayer is alpha.** Any 0.0.x release may change behaviour or break a workflow; read the
> [release notes](https://github.com/prismalens/assayer/releases) before you upgrade. See
> [VERSIONING.md](https://github.com/prismalens/assayer/blob/main/VERSIONING.md).

Runs one review round over the [Agent Client Protocol](https://agentclientprotocol.com): spawns
an engine, opens a session on a checkout, offers the lane's two comment tools as MCP servers,
sends the lane's prompt, answers every permission request from the lane's tool allowlist, and
writes the round as assayer/v1 events.

`run.js` posts nothing to GitHub; only `assayer review --post` or `assayer publish` does, under
your own `gh` login. The engine's credential is its own sign-in on this machine, an API key in
the environment, or none for OpenCode's free models.

## Review a pull request from your terminal

`assayer review owner/repo#N` runs one round on this machine with your own engine sign-in and
prints the findings. `--post` puts them on the pull request under your own `gh` login, each
inline finding ending in the `assayer-finding` marker; `assayer publish <dir>` posts, or resumes
posting, a round that already ran. Nothing is hosted: a round run on your machine posts as you (#184).

```bash
# once, from a checkout of this repository
cd runner && npm ci && npm link
npm i -g @openai/codex@0.162.1 @agentclientprotocol/codex-acp@2.1.1 && codex login
gh auth login

assayer review prismalens/sreforge#183            # print only
assayer review prismalens/sreforge#183 --post     # post as you
```

`assayer review` with no target reviews local changes not yet pushed, against `--base` or the upstream, `origin`'s default branch, `main` or `master`. It snapshots the working tree through a temporary index into its own checkout, prints only, and exits 4 with `--fail-on critical|major|minor` when it finds that or worse. `assayer hook install|uninstall` manages an opt-in pre-push hook that reads finished local rounds and never starts one; `assayer.prepush` (`off`, `warn`, `block`) sets what it does.

`assayer doctor` lists what a round needs on this machine and exits non-zero when something required is missing; `assayer --version` prints the package version. `assayer telemetry on|off|status` controls the usage counts described in the top-level README's Telemetry section.

It refuses, before spending any quota, a PR that is closed, carries `claude_review_skip`, already
has this engine's review on its head (`--again` runs another), or whose repository has a
`.github/claude-review.yml` it cannot apply yet (#182; `--ignore-repo-config` reviews with the
workflow defaults). The round lives in `~/.assayer/reviews/<repo>-<pr>-<sha>-<time>/` unless
`--out` names a new directory. Assayer passes the engine no GitHub credential.

## Run one round

```bash
cd runner && npm ci
node src/run.js --cwd /path/to/checkout --prompt rendered-prompt.md --out ./round-1 \
  --engine opencode
```

`--cwd` must be a git checkout at the PR head. `--prompt` is the lane template already rendered.
`scripts/render-prompt.mjs --engine codex --repo owner/name --pr N --base-sha A --head-sha B`
renders the Codex template instead.
`scripts/render-prompt.mjs --repo owner/name --pr N [--level high] [--mode review-full |
incremental --range-base A --range-head B] [--path-instructions]` renders it the way the
workflow's `build-prompt` step does and prints the prompt hash on stderr; `prompt/README.md`
has the template's provenance and re-sync rule. A file still carrying `@@TOKEN@@` is refused. `--engine` is a row in
`src/engines.js`; `--model` defaults to the row's `defaultModel`, for OpenCode the newest free
tool-calling model in the models.dev catalog (`opencode models opencode` lists them; the free
tier needs no key or login). `--timeout-min` (default 20) bounds the round and `--idle-min` (default 8) cuts an engine that has sent no update for that long; either cancels the session, then kills the engine if it does not stop.
Under `assayer review` the engine gets no `GH_TOKEN` or `GITHUB_TOKEN` and an empty `GH_CONFIG_DIR`,
so its `gh` reads fail closed and only Assayer posts.

Staging never executes a binary the checkout brought with it: a committed `./actionlint` or
`node_modules/.bin/*` is skipped and the skip is recorded in the manifest's tool notes, since
staging runs on the runner's machine. The same rule is in the workflow's
own step.

The prompt tells the engine to read `.claude-review-manifest.json` and `.claude-review.diff`
from the checkout root. The Actions lane writes them before the review; so does the runner
with `--stage-manifest --repo owner/name --pr N [--head-sha SHA] [--mode review]`, which
runs `src/manifest.py`, the workflow's own manifest and context builders copied verbatim
(`src/manifest.js` wraps them with the workflow's defaults). Without it the engine has no
diff to review and says so in its summary. A staging failure is a round that never ran: the
engine is not spawned, and `events.jsonl` carries one `error` and a `failed` finish.

The output directory holds:

| File | What |
|---|---|
| `events.jsonl` | assayer/v1: `started`, `read`, `agent`, `finding`, `summary`, `usage`, `error`, `finished` |
| `raw.jsonl` | every ACP message: initialize, session, each `session/update`, each permission request with its decision, the stop |
| `tool-log.jsonl` | every call the engine made to `create_inline_comment` or `update_claude_comment`, as recorded by `src/finding-tools.js` |
| `summary.json` | conclusion, stop reason, turns, tool calls, reads, findings, permissions allowed and rejected, usage, errors, dropped items, wall clock |
| `engine-stderr.log`, `engine-config/`, `engine-xdg/` | the engine's own noise and the per-run config the runner wrote for it |

`run.js` exits 0 for `completed`, 3 for an engine error, 4 for a timeout and 2 for bad usage. `assayer review` exits 0 when the round completed, 3 when it did not, 4 when `--fail-on` found something at or above its level, 1 on a refusal and 2 on bad usage.

## What the pieces are

- `src/events.js`: the contract. Eight event types with fixed field lists, the lane's eight
  failure classes, and the same text tests `classify-failure` runs in the workflow.
- `src/policy.js`: the lane's `--allowed-tools` list as an ACP permission policy. Read, search
  and think are allowed; execute only for the listed `gh` read commands and only as a single
  command on a single line, with any control character refused outright; edit, delete, move
  and fetch are refused; the two comment tools are allowed.
- `src/finding-tools.js`: one MCP server per comment tool. Each call is appended to the tool
  log and answered with success. Findings and the summary are read from that log, never from
  what the engine narrated, so a call the model only described is not a finding.
- `src/gh-shim.sh`: the `gh` the engine sees. The lane's prompt posts its summary with
  `gh pr comment`, which is on the allowlist, so the runner puts this shim first on PATH: `pr
  comment` is recorded to the tool log as the summary and answered as gh would, `pr review`,
  `pr merge`, `pr close`, `pr edit` and `api` are refused, everything else runs the real gh.
  `--body-file` takes only `-` (stdin): a path would let a steered engine record any readable
  file, a token store or `/proc/self/environ`, as the summary the poster publishes. Nothing a
  round does reaches GitHub except reads.
- `src/acp-map.js`: `session/update` to events. `started.model` is the model asked for, verbatim; `started._meta.served_model` is the one the agent reports in its `session/new` answer, and `model_substituted` flags a difference (prismalens#727). One `read` per path per round from tool-call
  locations, flagged when outside the checkout. The last `update_claude_comment` wins, as the
  lane's comment does. A finding or summary body that carries a credential-shaped token (a
  GitHub, Anthropic, OpenAI, AWS or Slack token, a private key, a `TOKEN=` line) is dropped
  and counted, never recorded, since those bodies are what the poster publishes.
  `usage_update` gives context size and cost, not input and output tokens; those fields stay
  null and the gap is recorded in `_meta`. Stop reasons map to
  `completed`, `truncated`, `refused`, `cancelled`; an error or an engine exit before the stop
  is `failed`; the timeout is `timed-out`.
- `src/engines.js`: the registry. A row names the binary, its ACP arguments, the environment
  allowlist it receives (never the runner's whole environment), the credential kinds, and
  `prepare()`, which writes the engine's per-run config.

## The permission finding, and why the engine config matters

OpenCode 1.18.30 in ACP mode edits files and runs shell commands without a permission request
unless its own config says `ask`. Verified 2026-09-19: with a bare config, an edit, a delete
and a redirect into `/tmp` all landed with no `session/request_permission`. With the config
the registry row writes (`edit: ask`, `bash: ask`, `webfetch`, `websearch` and
`external_directory: deny`, `continue_loop_on_deny`), every edit and every command comes to
the runner first, the policy answers, and a refusal does not end the turn. That config, and
`--pure` with the project's own `opencode.json` disabled, is copied from the prismalens
registry row that passed prismalens#561.

The ACP policy is therefore a guardrail, not a boundary, as prismalens ADR 0003 says of every
agent. The runner adds no sandbox of its own: what the engine allows and blocks is the posture.

Codex runs through `@agentclientprotocol/codex-acp` 2.1.1, verified 2026-10-08 on
`gpt-6.1-sol` with a ChatGPT sign-in. The row starts it in the adapter's `read-only` mode, whose
default is a workspace-write mode with an automatic reviewer. Every command runs inside Codex's
own sandbox, with no writes and no network, and does not ask. A command that needs out asks, and
the policy answers. Codex's permission request quotes such a script into one word, and the
summary arrives as `gh pr comment --body "<lines>"`. The policy accepts a multi-line body only
inside single quotes, or inside double quotes whose only backslashes escape a backtick or `$`. A body
outside that is refused, and since Codex offers only `cancel` for that request and for every
edit, a refusal ends the round as `cancelled`, not `completed`. The probe's edit step therefore
ends its Codex run early. Nothing lands. The row also turns off the user's Codex plugins, web
search and the checkout's `AGENTS.md`; the sign-in stays in `CODEX_HOME`. Zed's
`@zed-industries/codex-acp` is deprecated: its 0.16.0 core cannot use `gpt-6.1-sol` on a
ChatGPT sign-in, and its refusal aborts the turn.

Codex reviews from its own template, `prompt/codex.md`, not the lane's. `gpt-6.1-sol` defaults
to `low` effort and cuts every tool output at 10,000 tokens, a per-model cap that
`tool_output_token_limit` does not raise. The lane template's six scripted agents and single
diff file left a 7,000-line pull request two-thirds read with no findings. The Codex template
asks for every reviewable file, read per file with `git diff <base> <head> -- <path>`, and a
summary that counts them. The row sets `xhigh` effort and a 90-minute, 15-idle-minute round;
the round renders the template with the pull request's two commits. The template forbids `;`, `|`,
`--jq` and fetches because one refusal ends the round. Codex asks for an MCP call with only a
tool-call id, so the runner merges the request with the streamed `tool_call` that named the
server and tool, and the policy allows the two comment tools by that name. A ChatGPT usage
limit arrives as agent text before a bare `Internal error`; it is recorded as `account-limit`
with the reset time Codex gave.

`scripts/permission-probe.sh <checkout>` repeats the check against the real binary: an allowed
command, a disallowed one, an edit and a delete, then proves nothing landed. Run it before
adding or bumping an engine row.

## Tests

`npm test` runs the unit tests: the contract's field lists and failure classes, the policy
on chained and disguised commands, the mapper on partial updates, duplicate reads, paths
outside the checkout, malformed findings, repeated summaries, every stop reason, non-USD
cost, and a corrupt tool log. The engine itself is covered by the probe script, not by CI,
because it needs a model.
