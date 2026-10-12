---
layout: page
title: Engines
---

| Engine | Install | Sign-in |
| --- | --- | --- |
| Codex (default) | `npm i -g @openai/codex @agentclientprotocol/codex-acp` | `codex login`, or `OPENAI_API_KEY` |
| Claude Code | `npm i -g @anthropic-ai/claude-code @agentclientprotocol/claude-agent-acp` | `claude` sign-in, or `ANTHROPIC_API_KEY` |
| OpenCode | `npm i -g opencode-ai` | none needed for its free models |

Use whichever sign-in your plan offers. Each provider's own terms apply: [OpenAI](https://openai.com/policies/), [Anthropic](https://www.anthropic.com/legal), [OpenCode](https://opencode.ai).

Your first review asks which installed engine to use and saves it as your default; `assayer config set engine <name>` changes it, and `--engine` overrides it for one round. `assayer doctor` shows which are ready, and notes when the installed version differs from the one Assayer was tested on. That is a note, never a block.

Each engine runs read-only: Codex starts in its read-only mode, OpenCode runs with edits and shell commands set to ask, and Assayer answers every request from a fixed allowlist.
