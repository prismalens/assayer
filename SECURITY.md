# Security Policy

## Supported versions

Assayer is pre-1.0. Security fixes land in the latest 0.x release; older
releases do not get fixes.

| Version | Supported |
| ------- | --------- |
| latest 0.x release | yes |
| anything older | no |

## Reporting a vulnerability

**Please do not report security issues through public GitHub issues.**

Use GitHub's private vulnerability reporting:

- Go to the repository's **Security** tab and choose
  **[Report a vulnerability](https://github.com/prismalens/assayer/security/advisories/new)**.

If you cannot use that, email **sumitpatel.14may@gmail.com** with the details.

Please include:

- A description of the issue and its impact.
- Steps to reproduce or a proof of concept.
- The Assayer version (`assayer --version` or package version), how you installed it, the engine used, and your OS.
- Any suggested remediation, if you have one.

Do **not** include real secrets, tokens, or private content in your report.

## What to expect

- Acknowledgement within a few days.
- An assessment of severity and a fix plan for confirmed issues.
- Credit in the release notes if you would like it.

## How Assayer works

Assayer is an open source code reviewer. It runs on the user's machine with their
own engine sign-in (Codex, Claude Code, or OpenCode) over the Agent Client
Protocol (ACP). It posts findings on pull requests under the user's own GitHub login
(`gh`), or through an optional telemetry Worker and dashboard. The engine never
receives a GitHub credential, and findings post only under the user's own login.

## Scope

Reports in these areas are especially valuable:

- **Credential isolation** — the engine receiving a GitHub credential, an API token,
  or environment variables outside its explicit allowlist.
- **Posting identity** — findings or summaries posting under an unexpected identity or
  outside the user's own GitHub login.
- **The ACP command and permission policy** — a way to make the engine edit, delete, or
  move files, or run mutating shell commands, without the runner's policy refusing it.
  The policy is a guardrail, not a sandbox, so any policy bypass is in scope.
- **Secret redaction** — finding or summary bodies containing credentials or private tokens
  reaching GitHub or telemetry payloads rather than being stripped and dropped.
- **Staging and binary execution** — staging executing a binary brought with the target
  checkout (committed binaries or local dependencies).
- **Daemon and runner token lifecycle** — job installation tokens surviving past round
  completion or leaking beyond their lease.
- **Path traversal** in any file read, checkout staging, or review artifact write.
