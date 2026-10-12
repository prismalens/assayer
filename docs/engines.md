---
layout: page
title: Engines
---

| Engine | Install | Sign-in |
| --- | --- | --- |
| Codex (default) | `npm i -g @openai/codex @agentclientprotocol/codex-acp@2.1.1` | `codex login`, or `OPENAI_API_KEY` |
| Claude Code | `npm i -g @anthropic-ai/claude-code @agentclientprotocol/claude-agent-acp@0.89.1` | run `claude` and type `/login`, or `ANTHROPIC_API_KEY` |
| OpenCode | `npm i -g opencode-ai@1.18.30` | none needed for its free models |

Use whichever sign-in your plan offers. Each provider's own terms apply: [OpenAI](https://openai.com/policies/), [Anthropic](https://www.anthropic.com/legal), [OpenCode](https://opencode.ai).

Your first review asks which engine to use, offers to install it if it is missing, and saves it as your default; `assayer config set engine <name>` changes it, and `--engine` overrides it for one round. `assayer doctor` shows which are ready, and notes when the installed version differs from the one Assayer was tested on. That is a note, never a block.

Each engine runs read-only: Codex starts in its read-only mode, OpenCode runs with edits and shell commands set to ask, Claude Code starts in its Always ask mode with reads outside the checkout blocked, and Assayer answers every request from a fixed allowlist. [What each engine can read](how-it-works.md#what-the-engine-can-read) lists the rest.
