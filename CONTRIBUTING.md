# Contributing to Assayer

Thanks for your interest in improving Assayer — an open source code reviewer.

## Contribution status

**Assayer is open source (Apache-2.0) but is not accepting outside code
contributions yet.** The codebase is moving fast pre-1.0 and review bandwidth
goes into the release. Bug reports, feature requests, and discussions are
welcome — use the issue templates. Forking is of course fine under Apache-2.0.

When code contributions open, they will be gated by the Developer Certificate
of Origin (DCO, `Signed-off-by` on every commit) under Apache-2.0
inbound=outbound. This section will be updated when that happens.

Alongside the DCO, a one-time **Contributor License Agreement** ([CLA.md](CLA.md))
will apply. It exists for IP hygiene — keeping the project's copyright in
one clean place — and does not change the license: your contributions remain
licensed to everyone under Apache-2.0, inbound = outbound. It is **not in force
yet**: no CLA check runs on pull requests while outside code contributions
remain closed. Nothing is required of you until then.

## Ground rules

- **The trunk branch is `main`, and it is protected.** Every change lands
  through a pull request; direct pushes to trunk are not allowed.
- **Never commit secrets.** No API keys, tokens, or private credentials.
- Keep PRs focused: one logical change per PR makes review fast.

## Development setup

Requirements: **Node 24** and **npm**.

```bash
git clone https://github.com/prismalens/assayer.git
cd assayer
```

The repository consists of:
- `runner/`: the `assayer` CLI and engine runner over ACP
- `worker/`: Cloudflare Worker for optional telemetry and job coordination
- `dashboard/`: web console over telemetry
- `plugin/`: Claude Code and Codex review skill

## Tests

Run the test suites across each component:

```bash
(cd runner && npm ci && npm test)
(cd worker && npm ci --prefix ../runner --omit=dev && npm ci && npm test)
(cd dashboard && npm ci && npm test)
```

## Making a change

1. **Branch** off `main`: `git checkout -b fix/short-description main`.
2. Write tests for new functionality or bug fixes.
3. Ensure all test commands above pass cleanly.
4. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`, `perf:`.
5. **Open a PR** against `main`. The PR title must follow Conventional Commits.

## Code style

- Plain JavaScript on Node 24 for the runner and worker; TypeScript and React for the dashboard.
- Preserve existing formatting and indentation.
- Small, cohesive modules with explicit error handling and no committed credentials.

## Reporting bugs and requesting features

Use the issue templates in `.github/ISSUE_TEMPLATE/`. For security vulnerabilities,
**do not open a public issue** — follow [SECURITY.md](SECURITY.md).

## License

Assayer is distributed under the [Apache License 2.0](LICENSE) (see also
[NOTICE](NOTICE)). When contributions open, contributors will sign the
[CLA](CLA.md) alongside DCO sign-off.
