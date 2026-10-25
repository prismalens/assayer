---
layout: page
title: How it works
---

## One round

1. Assayer reads the pull request with your `gh` login and refuses, before spending any quota, if it is closed, carries the `claude_review_skip` label, or already has a review from this engine on its head.
2. It checks out the head in a fresh directory and builds a manifest: which files changed and which of them are reviewable.
3. The engine runs over the [Agent Client Protocol](https://agentclientprotocol.com) with your own sign-in and your own harness setup: its settings, skills, plugins and MCP servers load as when you run it yourself. It gets your environment minus Assayer's own `ASSAYER_*` settings. Assayer passes it no GitHub credential: the GitHub token variables are removed from its environment, its `gh` sees an empty config and git's credential helper is blank, so it cannot post. Every edit, write, web request, and shell command other than a short list of `gh` commands that the engine asks for is refused.
4. The engine records each finding and a summary through two tools. Assayer checks every finding before anything is posted: a body that looks like a credential is dropped, and a finding it cannot anchor to a changed line is posted as a plain comment instead.
5. With `--post`, the findings land as inline comments under your login, each ending in a hidden `assayer-finding` marker, and a summary comment gives the coverage.

## What the engine can read

The engine runs as your user. Where the engine has a control for it, Assayer keeps the engine in the review's checkout; it adds no sandbox of its own. A symlink in the reviewed tree checks out as a plain file holding its target, so no engine can follow one out of the checkout. Agent configuration and instruction files a pull request adds or changes (`.claude/`, `.codex/`, `.agents/`, `.opencode/`, `.mcp.json`, `opencode.json`, `AGENTS.md`, `CLAUDE.md`) are put back to the base branch's version in the review's checkout, so a pull request cannot configure the engine that reviews it; the repository's own config at the base stays, and the review still reads the changes in the diff.

| Engine | Files outside the checkout | Network |
|---|---|---|
| Claude Code | Refused: reads outside the working directory are blocked, and the session runs in Manual mode, so each shell command it asks for goes through Assayer's allowlist. | Refused |
| OpenCode | Refused: `external_directory` is denied for every agent. | Refused |
| Codex | Readable through its shell, except where credentials live: gh's config, SSH, cloud CLIs, Docker, npm and git credentials, GnuPG, and the Claude Code and OpenCode sign-ins, which Codex's sandbox refuses, unless your own Codex config sets `sandbox_mode` (Codex then ignores the profile, and Assayer warns each round). Codex cannot be kept to the checkout through its adapter today. | Refused by the sandbox |

Each row is what a canary measured on 2026-10-13: marker files outside the checkout, a symlink to one, a subagent read, `cat`, `gh auth status` and `curl`.

gh keeps its token in a file when there is no keyring (common on Linux and WSL); every engine is refused that file, Codex only while its config does not set `sandbox_mode`. Assayer drops a finding or summary that looks like a credential, but it cannot recognise an encoded one. Codex can still read the rest of your files, so for a pull request from someone you do not trust, review with Claude Code or OpenCode.

## After the review

Assayer does not yet re-check its own threads on a later round. Reply in a thread with the commit that fixes it, and resolve it yourself. `--again` runs a fresh review of a head this engine already reviewed.

## Whose name is on it

A round posts under the `gh` login that ran it. There is no shared bot account. A finding is recognised as Assayer's by its marker, not by who posted it.
