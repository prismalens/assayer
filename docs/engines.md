---
layout: page
title: Engines
---

| Engine | Install | Sign-in |
| --- | --- | --- |
| Codex | `npm i -g @openai/codex` | `codex login`, or `OPENAI_API_KEY` |
| Claude Code | `npm i -g @anthropic-ai/claude-code --allow-scripts=@anthropic-ai/claude-code` | run `claude` and type `/login`, or `ANTHROPIC_API_KEY` |
| OpenCode | `npm i -g opencode-ai@1.18.30 --allow-scripts=opencode-ai` | none needed for its free models, though they often stall mid-round; pick one with `--model` |

Assayer ships the ACP adapters for Codex (`@agentclientprotocol/codex-acp` 2.2.2) and Claude Code (`@agentclientprotocol/claude-agent-acp` 0.81.1), so the engine's own CLI is all you install; an adapter you installed yourself on PATH is used instead. Use whichever sign-in your plan offers. Each provider's own terms apply: [OpenAI](https://openai.com/policies/), [Anthropic](https://www.anthropic.com/legal), [OpenCode](https://opencode.ai).

Your first review asks which engine to use, offers to install it if it is missing, and saves it for every later review; `assayer config set engine <name>` changes it, and `--engine` overrides it for one round. `assayer doctor` shows which are ready, and notes when the installed version differs from the one Assayer was tested on. That is a note, never a block.

A round runs the engine with your own harness setup: its settings, skills, plugins and MCP servers load as they do when you run it yourself, and the model is the one you configured unless `--model` names another. Assayer passes it your environment minus its own `ASSAYER_*` settings and any GitHub token.

Each engine runs read-only: Codex in its Read-only mode, OpenCode with edits and shell commands set to ask, Claude Code in its Manual mode with reads outside the checkout blocked, and Assayer answers every request from a fixed allowlist. Your MCP servers are there, but a call to one is refused like any other tool outside that allowlist. [What each engine can read](how-it-works.md#what-the-engine-can-read) lists the rest.
