# Working in this repository

Assayer moved here from `prismalens/gh-workflows` with its history (gh-workflows#59). Issue and PR numbers in commit messages before the move refer to gh-workflows.

## Tests

```bash
(cd runner && npm ci && npm test)    # first: the Worker imports runner/src/poster.js
(cd worker && npm ci && npm test)
(cd dashboard && npm ci && npm test)
```

## Pins that move together

- `tools/review-config/schema.json` is the `.github/claude-review.yml` schema; the Worker and the dashboard both import it.
- `runner/prompt/` is rendered from the Actions lane's template in gh-workflows. `runner/prompt/README.md` has the re-sync rule.
- `plugin/skills/assayer-review/SKILL.md` describes the CLI in `runner/src/review.js`. A flag, refusal or verdict change edits both.

## Rulings that bind the code

- No hosted service in the review path. A local round posts under the user's own `gh` login; a self-hosted install posts as the adopter's own GitHub App. There is no shared App and no identity setting (gh-workflows#184, 2026-10-11).
- A finding is Assayer's when its body ends in `<!-- assayer-finding engine=<e> -->`. Trust is a Bot, or a person with write or admin permission, never `author_association`.
- The engine never receives a GitHub credential.

## Pull request titles

Conventional commits: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
