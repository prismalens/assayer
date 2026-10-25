# Working in this repository

Assayer is a code review CLI that runs on the user's own machine. It drives the user's own coding agent (Codex, Claude Code or OpenCode, over the Agent Client Protocol), then prints the findings or posts them on the pull request under the user's own `gh` login. There is no server and no shared account.

Assayer moved here from `prismalens/gh-workflows` with its history (gh-workflows#59). Issue and PR numbers in commit messages before the move refer to gh-workflows.

## Tests

Node 22 or newer.

```bash
(cd runner && npm ci && npm test)
```

## Pins that move together

- `runner/prompt/` is rendered from the Actions lane's template in gh-workflows. `runner/prompt/README.md` has the re-sync rule.
- `plugin/skills/assayer-review/SKILL.md` describes the CLI in `runner/src/review.js`. A flag, refusal or verdict change edits both.

## Rulings that bind the code

- No hosted service in the review path. A round posts under the user's own `gh` login. There is no shared App and no identity setting (gh-workflows#184, 2026-10-11).
- A finding is Assayer's when its body ends in `<!-- assayer-finding engine=<e> -->`. Trust is a Bot, or a person with write or admin permission, never `author_association`.
- Assayer never passes the engine a GitHub credential: no `GH_TOKEN` or `GITHUB_TOKEN` in its environment, an empty `GH_CONFIG_DIR`, and only Assayer posts. What the engine may read beyond the checkout is set per engine row through the engine's own controls, never a sandbox of Assayer's (gh-workflows#184, 2026-09-26); `docs/how-it-works.md` lists each row as the credential canary measured it.
- The engine runs with the user's own harness setup: Assayer never overrides their settings, skills, plugins, MCP servers or model. Launch, env and user setup come from `@prismalens/agent-host`; Assayer keeps only its boundaries (#13).
- A pull request never configures the engine that reviews it. Agent config and instruction files it adds or changes (`.claude/`, `.codex/`, `.agents/`, `.opencode/`, `.mcp.json`, `AGENTS.md`, `CLAUDE.md`) go back to the base branch's version before the engine starts (#12).
- A finding the engine files is never dropped. Only a byte-identical re-filing merges. A finding whose severity cannot be read, or that was withheld, counts at every `--fail-on` level and in the pre-push hook.
- The pre-push hook counts every local review of the exact tree being pushed, not only the newest, and a review whose files are damaged counts as withheld.
- A hint that names a command uses `SELF` from `runner/src/settings.js`, so it reads `assayer` or `npx @prismalens/assayer`, whichever the user ran.

## Writing

- Comments and pull request text explain the current behaviour and its reason, for a reader who has not seen the conversation, review round or plan that produced it. No review-round IDs or session notes.

## Pull request titles

Conventional commits: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
