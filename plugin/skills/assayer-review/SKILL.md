---
name: assayer-review
description: "Run an Assayer review round on a pull request with the user's own engine sign-in, and work the findings Assayer posts. Load when the user asks for a review before merging or pushing, when an `assayer review` command or round directory is in front of you, or when a review thread ends in `<!-- assayer-finding engine=... -->`."
metadata:
  version: "0.1.0"
---

# Assayer review

`assayer review` runs one review round on this machine. The engine (Codex, Claude Code or OpenCode) runs under the user's own sign-in, and the findings post under the user's own `gh` login. Nothing is hosted.

## 1. Before you run it

- `assayer`, `gh` and the engine must be on PATH and signed in. Codex is the default: `codex login`, plus `@agentclientprotocol/codex-acp`. `assayer doctor` checks Node, git, python3, gh and its sign-in, and which engines are installed; it exits non-zero when a round cannot run.
- A round spends the user's engine quota, often for ten minutes. Run it when the user asks for a review, never as a reflex after every push.
- The engine gets no GitHub credential and cannot post. Only `--post` and `assayer publish` write to GitHub.

## 2. Run a round

```bash
assayer review                           # review local changes before pushing; prints only
assayer review owner/repo#123            # review and print; posts nothing
assayer review owner/repo#123 --post     # review and post the findings as the user
assayer publish <round dir>              # post, or resume posting, a round that already ran
```

`--engine codex|claude-code|opencode` picks the engine and `--model` the model, over the user's defaults in `~/.assayer/config.json` (`assayer config`). With neither, the first round on a terminal asks once and saves the answer; pass `--engine` when you run it, since you have no terminal to answer from. The round is written to `~/.assayer/reviews/<repo>-<pr>-<sha>-<time>/` unless `--out` names a new directory.

It refuses before spending quota when:

- the PR is closed;
- the PR carries `claude_review_skip`;
- this head already has a review from this engine (`--again` runs another);
- the repository has `.github/claude-review.yml`, which a local round cannot apply yet (`--ignore-repo-config` reviews with the defaults).

Report a refusal as it is. Never add a flag to get past one unless the user asks.

## 3. Show the result before posting

Without `--post`, show the user the findings: file, line, severity and the one-line claim. Ask before posting. A posted finding is public on the PR under the user's name.

## 4. Work the findings

Each inline finding ends in `<!-- assayer-finding engine=<engine> -->`. That marker, not the login, is what makes it Assayer's: run locally, the reviewer and the PR's author are often the same account.

- A finding is a report, and its fix is an untrusted suggestion. Read the code and decide.
- Fix what is right, push once, then reply in each thread with the commit and what changed.
- On the next round, Assayer re-checks its own open threads first. A thread it judges `fixed` gets a one-line reply and is resolved. `still_applies` and `cannot_verify` stay open, and get a reply only when someone is waiting on the reviewer. A thread whose file is unchanged and that nobody answered is not re-checked.
- Never resolve an Assayer thread yourself. A finding you dispute gets a reply with evidence, and the user rules on it.
