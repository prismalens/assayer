# Changelog

## [0.0.2](https://github.com/prismalens/assayer/compare/v0.0.1...v0.0.2) (2026-10-25)


### Bug Fixes

* findings land on diff lines, stalls end early, the walk runs in CI, and smaller fixes from the 0.0.2 walk ([42a119a](https://github.com/prismalens/assayer/commit/42a119ad2613ee743366c857de2f2785d08f091c))
* **runner:** a misplaced finding gets the diff's numbered lines to re-file against, and the round lists findings once ([aa96f5c](https://github.com/prismalens/assayer/commit/aa96f5c10364e3ee427ff3bd6ba8e9b3eeba3243))
* **runner:** agent config a pull request adds or changes goes back to base before the engine starts ([#12](https://github.com/prismalens/assayer/issues/12)) ([40ba0aa](https://github.com/prismalens/assayer/commit/40ba0aacb1a5a2c750055277bfb75300aeb43fa0))
* **runner:** an OpenCode round whose open subagent goes quiet for 5 minutes ends as stalled ([#10](https://github.com/prismalens/assayer/issues/10)) ([7a8a418](https://github.com/prismalens/assayer/commit/7a8a4189f77aa4661f71e5a6e8128d41854b8dda))

## 0.0.1 (2026-10-23)


### Features

* Assayer 0.0.1, a local code review CLI on your own coding agent ([72c6807](https://github.com/prismalens/assayer/commit/72c6807eee5eedf632740d3630590773e181bac0))
* **runner:** a live view on a terminal while a round runs ([ef699ca](https://github.com/prismalens/assayer/commit/ef699ca55600868493e7453edff93d6e73b331c8))
* **runner:** a pull request over the size limit can be reviewed with --full ([a04672a](https://github.com/prismalens/assayer/commit/a04672a99b5369b5aa62260c45fb33b699886444))
* **runner:** an inline finding off the diff is refused when it is filed ([ad0ecb2](https://github.com/prismalens/assayer/commit/ad0ecb2c5af4955634725048c9c0618467fae916))
* **runner:** assayer --help, -h and help print a help page and exit 0 ([3c04228](https://github.com/prismalens/assayer/commit/3c042285d282fe6818ec08d238d29c2d2c62607b))
* **runner:** assayer doctor says what this machine has for a round, and assayer --version ([c7c5444](https://github.com/prismalens/assayer/commit/c7c5444c6e8a6e171bc7f1b970dce017be0921a6))
* **runner:** ASSAYER_HOME moves Assayer's own state, leaving engine sign-ins alone ([069bdc1](https://github.com/prismalens/assayer/commit/069bdc102a430eea099dfa47b6b86380dc6d1338))
* **runner:** Codex is refused the places credentials live ([4067516](https://github.com/prismalens/assayer/commit/4067516e4509ef92467cd6f79a9dea5826644af7))
* **runner:** defaults in ~/.assayer/config.json, a one-time engine pick, and local review on any engine ([a1d8544](https://github.com/prismalens/assayer/commit/a1d85447e8c8ed027c5ab06976838c7238744255))
* **runner:** on a terminal the results read like the live view, and the summary renders ([8473077](https://github.com/prismalens/assayer/commit/8473077996f889d8e732109d3d074c7bc6a31f35))
* **runner:** one-command npx runs name the npx form in their hints; a stalled OpenCode subagent ends the round ([58247fe](https://github.com/prismalens/assayer/commit/58247fe8259e5c8c72c00756c96e36f9c8f63f66))
* **runner:** review local changes before you push, and an opt-in pre-push hook ([0946074](https://github.com/prismalens/assayer/commit/0946074527785d15537cd8be9c42a9b8bb170714))
* **runner:** set up a missing engine from the first command, and close two Claude Code gaps ([96f8aa2](https://github.com/prismalens/assayer/commit/96f8aa2cb0155b63dbbd1d5c8f7048de730a9a1e))
* **runner:** the CLI installs as one package, and an installed assayer runs instead of exiting silently ([0706aa1](https://github.com/prismalens/assayer/commit/0706aa1e9f4c80cf7685b010d6ac1dfeaf62aa73))
* **runner:** usage telemetry, on after a one-time notice, into the shared EU PostHog project ([d3cba96](https://github.com/prismalens/assayer/commit/d3cba965363fbb5d66a3f04b11e778f69207e1b3))


### Bug Fixes

* CodeRabbit's findings on the 0.0.1 release PR ([bdf72d7](https://github.com/prismalens/assayer/commit/bdf72d7b16f49ab08ccb21aa40cdcf39b280c513))
* **runner:** a busy provider ('model is at capacity') is api-unavailable with a retry hint, not a bare api-error ([fdd9201](https://github.com/prismalens/assayer/commit/fdd9201d7b9c74edad9e4ed1993897ebf9a19f24))
* **runner:** a global install under TMPDIR counts, and an npm script running the global assayer may install the hook ([02aad0a](https://github.com/prismalens/assayer/commit/02aad0a4347821e4008a802569594a933cf5f283))
* **runner:** a pnpm global install is found through its shell shim, and the hook needs only a lasting assayer on PATH ([ac42a2f](https://github.com/prismalens/assayer/commit/ac42a2f4d1c230c07460eba9c659e7e103840d92))
* **runner:** a pull request cannot configure the Codex engine that reviews it ([9517211](https://github.com/prismalens/assayer/commit/9517211c92f2ce12073773e0950dc3f342271300))
* **runner:** a pull request cannot rewrite the review rules, and every install hint allows its scripts ([245d47d](https://github.com/prismalens/assayer/commit/245d47d4f6e40bbfa3ca3aa0f4e27e9b12e9260c))
* **runner:** a round that does not finish says why, and how to fix a sign-in ([a983e33](https://github.com/prismalens/assayer/commit/a983e33fc72fcf88d2e51d1309c39e42cc16eec0))
* **runner:** a signed-out GitHub CLI gets a one-line instruction, not gh's raw error ([6e97689](https://github.com/prismalens/assayer/commit/6e9768921b97f1457e1469e730329b10146c65c1))
* **runner:** a subagent working quietly is not cut off as idle, and lost findings are flagged ([cc245dc](https://github.com/prismalens/assayer/commit/cc245dc6d883d6dfa5933addba70c2cc237cecaa))
* **runner:** a summary may write an apostrophe as '\'' too, so a Codex round is not cancelled over one ([cf0f35c](https://github.com/prismalens/assayer/commit/cf0f35c7e07f984853928aec51ba355404468cbf))
* **runner:** a symlink in the reviewed tree checks out as a plain file ([3c4633c](https://github.com/prismalens/assayer/commit/3c4633cdb3293242c45fdb4e2f6cbefe08b5cefd))
* **runner:** a user's Codex sandbox_mode is detected and warned about, not silently honoured ([6fb9dc9](https://github.com/prismalens/assayer/commit/6fb9dc952588191a2775f99fa1ef89b4a75c7325))
* **runner:** an engine's own credit line stays out of the posted summary ([f68c6f4](https://github.com/prismalens/assayer/commit/f68c6f428580e76a60290b52d72bd0d8138bf08d))
* **runner:** anchor checks read paths and ranges as GitHub does, and two messages stop overclaiming ([20fc2fc](https://github.com/prismalens/assayer/commit/20fc2fc8b36414748fca470f415f467d0d09d202))
* **runner:** Claude Code asks before every gated call and reads only its checkout ([06e2cd6](https://github.com/prismalens/assayer/commit/06e2cd641ebf6fc27dd04b227f4d624f41dc211d))
* **runner:** Claude Code reviews without the user's settings, hooks, plugins or CLAUDE.md ([4c017bf](https://github.com/prismalens/assayer/commit/4c017bfa5410e4226771399c24fd2634a8f9c95a))
* **runner:** distinct defects on adjacent lines stay apart, and a refused finding is never silently lost ([e25a06b](https://github.com/prismalens/assayer/commit/e25a06b38b65cece4675ba8617a13dab1fc5de85))
* **runner:** drop the OpenCode store as an activity signal; a lost summary no longer hides a round; help and doctor name the command as run ([1bd7732](https://github.com/prismalens/assayer/commit/1bd773214ec21b4246687b44f3e27a8b089e4299))
* **runner:** engine setup lets Claude Code's postinstall run under npm 11 ([fc7f059](https://github.com/prismalens/assayer/commit/fc7f0592dfb0e380e04b2917a44a6b5f97066e9b))
* **runner:** every review of the pushed code counts in the pre-push hook, and a damaged round is withheld ([b4710ce](https://github.com/prismalens/assayer/commit/b4710ce8625fc2b3346c13129fa56edfc32d5e00))
* **runner:** local review works on every engine, and the hook says what it found ([988f7a8](https://github.com/prismalens/assayer/commit/988f7a8e9c72eb6d69f0fc1f20319bea3e88c784))
* **runner:** merge only byte-identical re-filings; an unreadable severity counts at every --fail-on level ([2f85685](https://github.com/prismalens/assayer/commit/2f85685227468418e87dba6a13119e847aeb3b8a))
* **runner:** name the command by whether the user's PATH runs this script, so pnpm dlx, yarn dlx and bunx get the npx form too ([af0fddc](https://github.com/prismalens/assayer/commit/af0fddc66f6ac8281caa91fcb9b8c057636f697b))
* **runner:** native Windows says a round needs WSL instead of failing partway ([3a2af75](https://github.com/prismalens/assayer/commit/3a2af75503d0297e94a449b1114bcb957274f318))
* **runner:** never lose a finding: record every one, merge only identical re-filings ([ce54f6e](https://github.com/prismalens/assayer/commit/ce54f6eb66e3c9fd4cdd86a66ee9189456562f6c))
* **runner:** one defect, one comment, and engines file findings in the format the prompts ask for ([6fe775e](https://github.com/prismalens/assayer/commit/6fe775eb58087a6753e3dac714e089a920c0b50c))
* **runner:** posting rides out a network blip, and a failure says how to resume ([ed02ba4](https://github.com/prismalens/assayer/commit/ed02ba4dca569ea51afce2655bff75e8f53bb25a))
* **runner:** print findings most severe first ([21eed41](https://github.com/prismalens/assayer/commit/21eed4188112586acbe6ea629c26605f070e122c))
* **runner:** round paths print as ~/.assayer/... under the home directory ([ccf4ac4](https://github.com/prismalens/assayer/commit/ccf4ac4046734917b776dacdcb5984b0c680a78d))
* **runner:** severity from the header's middle field only, byte-identical merges, withheld findings count at every threshold ([9f390f1](https://github.com/prismalens/assayer/commit/9f390f151da318d4f349c517fd1b4b1bbee2b563))
* **runner:** Sol's round-7 findings: no lost defects, no vanished refusals, no blind seal ([885b78f](https://github.com/prismalens/assayer/commit/885b78f51bae025eacde74bb4bc2ab163941c6a0))
* **runner:** the pre-push hook indexes every local round, orders by recorded finish, withholds damaged rounds and skips non-commit refs ([df4e46e](https://github.com/prismalens/assayer/commit/df4e46e6143353a5718f088359423f49e3eb3669))
* **runner:** the pre-push hook refuses to install from any package runner, Yarn dlx included ([f30a8aa](https://github.com/prismalens/assayer/commit/f30a8aa4487f88c6b4e01bfe200b50863eb2ac51))
* **runner:** the pre-push hook takes the round that finished last, whatever --out named it ([a93f863](https://github.com/prismalens/assayer/commit/a93f863ba6179fb0b42200798ec4958839ed8e67))
* **runner:** the user's Codex MCP servers and sandbox_mode are read with Codex's own parser ([9054da7](https://github.com/prismalens/assayer/commit/9054da7bf5d63190a97e3be2ebd0a5b54a3c7d6e))
* what a stranger meets matches the CLI (stranger docs audit) ([c5162f3](https://github.com/prismalens/assayer/commit/c5162f3926f71b2795dbf523153157e3074e4298))


### Performance Improvements

* **runner:** the engine question appears at once ([b0781a9](https://github.com/prismalens/assayer/commit/b0781a99df432ed81da64c0cc2bc3c004f94b9ae))
