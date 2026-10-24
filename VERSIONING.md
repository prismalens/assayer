# Versioning

Assayer is pre-1.0 and alpha. Versions use semver's shape but make no stability promise.

## 0.0.x

Every release is a patch: `0.0.P`. release-please runs with `versioning: "always-bump-patch"`
(#9), so a `feat:` or a breaking change bumps the patch too. Assayer stays on 0.0.x until the
maintainer decides it is ready to leave alpha; that change is a deliberate edit to
`release-please-config.json`, not something a commit message triggers.

Releases are cut by merging the release-please PR; [RELEASING.md](RELEASING.md) has the gate.

## Alpha

Assayer is alpha. Any 0.0.x release may change behaviour or
break a workflow. Read the
[release notes](https://github.com/prismalens/assayer/releases) before you upgrade.

## Channels

- **`latest`** on npm: every release.

There is no nightly channel yet.

## 1.0.0

`1.0.0` is a deliberate stability promise, not just the next number.
Until then, treat every `0.0.x` as free to change.
