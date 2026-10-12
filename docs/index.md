---
layout: home
title: Assayer
---

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/hero-dark.svg">
  <img alt="assayer: code review that runs on your machine and posts as you" src="assets/hero-light.svg" style="max-width:100%">
</picture>

Assayer is open source code review that runs on your machine with your own Codex, Claude Code or OpenCode sign-in. It reviews a pull request, posts its findings inline under your own GitHub login, and can review what you are about to push before you push it. There is no hosted service and no extra API key.

```bash
assayer doctor                          # what this machine has for a round
assayer review owner/repo#123           # review and print
assayer review owner/repo#123 --post    # post the findings as you
```

- [Getting started](getting-started.md): install, sign in, first round.
- [How it works](how-it-works.md): what a round reads, what it posts, and how it closes its own threads.
- [Engines](engines.md): Codex, Claude Code and OpenCode.
- [Claude Code and Codex](agents.md): the plugin that lets an agent run Assayer for you.
- [Telemetry](telemetry.md): exactly what is sent, and how to turn it off.

Source, issues and releases: [github.com/prismalens/assayer](https://github.com/prismalens/assayer). Apache-2.0.
