---
layout: page
title: Telemetry
---

The first `assayer` run in a terminal prints a notice and sends nothing. Later runs send usage counts to PostHog's EU region, so the project can see whether Assayer is used and where rounds fail.

| Event | Properties |
| --- | --- |
| `install_active` | at most once a UTC day |
| `round_finished` | `pr` or `local`, engine, conclusion, findings bucket (`0`, `1`, `2-5`, `6-20`, `>20`), duration bucket, whether it was posted |
| `refused` | `pr` or `local`, engine, and which refusal: `closed`, `skip_label`, `already_reviewed`, `repo_config`, `no_base`, `no_changes`, `no_repo` |

Every event also carries `product`, how it was installed (`npm` or `checkout`), OS, CPU architecture, Node major version, the Assayer version, and a random install id kept in `~/.assayer/telemetry.json`. Timestamps are cut to the UTC day, and IP geolocation is turned off.

Never sent: repository names, paths, logins, code, prompts, findings or model output.

## Turning it off

- `assayer telemetry off`; `assayer telemetry on` turns it back on.
- `ASSAYER_TELEMETRY=off`, `DO_NOT_TRACK=1` or `CI` in the environment turn it off whatever the stored answer.
- A run with no terminal never shows the notice, so it never starts.

`assayer telemetry status` shows the setting and the last 20 events sent, exactly as sent.
