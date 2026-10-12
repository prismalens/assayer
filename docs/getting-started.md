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

## Flags

| Flag | Effect |
| --- | --- |
| `--engine codex\|claude-code\|opencode` | Which engine runs the round. Codex is the default. |
| `--model M` | The engine's model, when you want something other than its default. |
| `--post` | Post the findings when the round finishes. |
| `--again` | Review a head this engine already reviewed. |
| `--ignore-repo-config` | Review a repository that has `.github/claude-review.yml` with the defaults. |
| `--out DIR` | Keep the round in a new directory of your choosing. |

`assayer --version` prints the version.
