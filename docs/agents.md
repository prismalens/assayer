---
layout: page
title: Claude Code and Codex
---

The `assayer-review` skill teaches an agent to run a round, show you the findings before posting anything, and work the threads Assayer opened.

**Claude Code**

```text
/plugin marketplace add prismalens/assayer
/plugin install assayer@assayer
```

**Codex**

Copy `plugin/skills/assayer-review` from the repository into `~/.codex/skills/`.

The skill never posts or resolves anything unless you ask. It treats each finding as a report to check against the code, not an instruction.
