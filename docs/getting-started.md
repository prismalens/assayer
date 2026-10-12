---
layout: page
title: Getting started
---

## What you need

- Node 24 or newer, `git` and `python3`.
- The GitHub CLI, signed in: `gh auth login`.
- One engine, installed and signed in. See [Engines](engines.md).

## Install

Until the first npm release, install from a checkout:

```bash
git clone https://github.com/prismalens/assayer && cd assayer
cd runner && npm ci && npm link
```

After the first release this becomes `npm i -g @prismalens/assayer`.

Then check the machine:

```bash
assayer doctor
```

It lists Node, git, python3, gh and its sign-in, and each engine as ready or missing, and exits non-zero when a round cannot run.

## Your first round

```bash
assayer review owner/repo#123
```

The round checks out the pull request's head in a fresh directory, runs the engine over it, and prints the findings. Nothing is posted. The round is kept under `~/.assayer/reviews/`.

When the findings look right, post them as you:

```bash
assayer publish ~/.assayer/reviews/<round dir>
# or, next time, review and post in one go:
assayer review owner/repo#123 --post
```

## Review before you push

```bash
assayer review                    # unpushed commits plus uncommitted and untracked changes
assayer review --base main        # compare with another base
assayer review --fail-on major    # exit 4 when anything major or worse is found
assayer hook install              # opt-in pre-push hook: warns about unreviewed or failing pushes
```

The round reviews a snapshot of your working tree in its own checkout, so your files, index and stash are never touched. It prints only; there is nothing to post to.

The hook never starts a review. It looks for a finished local round covering what you push, warns when there is none or when it found something major, and blocks only with `git config assayer.prepush block` (or `ASSAYER_PREPUSH=block`). `git push --no-verify` skips it.

## Flags

| Flag | Effect |
| --- | --- |
| `--engine codex\|claude-code\|opencode` | Which engine runs this round, over your saved default. |
| `--model M` | The engine's model, when you want something other than its default. |
| `--post` | Post the findings when the round finishes. |
| `--again` | Review a head this engine already reviewed. |
| `--ignore-repo-config` | Review a repository that has `.github/claude-review.yml` with the defaults. |
| `--out DIR` | Keep the round in a new directory of your choosing. |

## Defaults

The first review on a terminal with no `--engine` asks which installed engine to use and saves the answer to `~/.assayer/config.json`. Without a terminal, in CI or a script, it never asks and uses Codex.

```bash
assayer config                          # show the defaults
assayer config set engine claude-code   # or codex, opencode
assayer config set model <model>        # applies only with the saved engine
assayer config set fail-on major        # local review exits 4 at or above it
assayer config unset model
```

A flag always wins for that round.

Assayer keeps its defaults, telemetry state and rounds in `~/.assayer`; set `ASSAYER_HOME` to keep them somewhere else. Engine sign-ins are the engines' own and stay where they are.

`assayer --version` prints the version.
