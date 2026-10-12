# Releasing Assayer

A release is cut by merging the release PR that release-please keeps open on `main`. Before
merging it, one person walks the packed build on a clean machine as a stranger would. The walk
is the gate: CI proves the code, the walk proves the install.

## 1. Pack the candidate

```bash
git checkout <release PR head> && cd runner && npm ci && npm test
npm pack                     # prismalens-assayer-<version>.tgz
```

## 2. Walk it on a clean machine

Use a fresh container or VM with Node 24, git, python3 and gh, and none of your own config:

```bash
docker run --rm -it node:24 bash      # then install gh and python3, or use a fresh VM
npm i -g ./prismalens-assayer-<version>.tgz
```

| Step | Command | Pass when |
| --- | --- | --- |
| Starts | `assayer --version` | prints `<version>` |
| Doctor | `assayer doctor` | lists node, git, python3, gh; says which engines are missing |
| Engine | install one engine from the README and sign in; `assayer doctor` | that engine reads ready, exit 0 |
| Review | `assayer review <sandbox-owner>/<sandbox-repo>#<n>` in a terminal | the telemetry notice prints first; the round completes, prints findings and coverage, posts nothing |
| Post | `assayer publish <round dir>` | findings land inline under your login, each ending in the `assayer-finding` marker |
| Telemetry | `assayer telemetry status` | lists `install_active` and `round_finished` with no repository name, path or login |
| Off | `assayer telemetry off`, then another command | nothing new in `telemetry status` |
| Uninstall | `npm rm -g @prismalens/assayer` | `assayer` is gone; `~/.assayer` is the only thing left |

Use a sandbox repository you own for the review and post steps, never a real project.

## 3. Release

Record the walk's result on the release PR: the version, the machine, each row's outcome. Then
merge it. The `Release` workflow tags the version and publishes `@prismalens/assayer` with
provenance. Check it on npm:

```bash
npm view @prismalens/assayer version
npm view @prismalens/assayer --json | grep -A3 '"attestations"'
```

After the first release, remove `release-as` from `release-please-config.json`.
