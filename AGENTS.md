# Working in this repository

Assayer moved here from `prismalens/gh-workflows` with its history (gh-workflows#59). Issue and PR numbers in commit messages before the move refer to gh-workflows.

## Tests

```bash
(cd runner && npm ci && npm test)
```

## Pins that move together

- `runner/prompt/` is rendered from the Actions lane's template in gh-workflows. `runner/prompt/README.md` has the re-sync rule.
- `plugin/skills/assayer-review/SKILL.md` describes the CLI in `runner/src/review.js`. A flag, refusal or verdict change edits both.

## Rulings that bind the code

- No hosted service in the review path. A local round posts under the user's own `gh` login; a self-hosted install posts as the adopter's own GitHub App. There is no shared App and no identity setting (gh-workflows#184, 2026-10-11).
- A finding is Assayer's when its body ends in `<!-- assayer-finding engine=<e> -->`. Trust is a Bot, or a person with write or admin permission, never `author_association`.
- Assayer never passes the engine a GitHub credential: no `GH_TOKEN` or `GITHUB_TOKEN` in its environment, an empty `GH_CONFIG_DIR`, and only Assayer posts. What the engine may read beyond the checkout is set per engine row through the engine's own controls, never a sandbox of Assayer's (gh-workflows#184, 2026-09-26); `docs/how-it-works.md` lists each row as the credential canary measured it.

## Pull request titles

Conventional commits: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
