#!/usr/bin/env bash
# RELEASING.md §2's rows, run by release-walk.yml. `before` runs ahead of any engine, `engine`
# after setup-acp-engine has pointed Claude Code at the aimock fixtures. Each row appends one
# table line to $RUNNER_TEMP/rows.md and fails the job when its expectation does not hold.
set -euo pipefail
ROWS="$RUNNER_TEMP/rows.md"
row() { printf '| %s | %s |\n' "$1" "$2" >> "$ROWS"; echo "$1: $2"; }
fail() { echo "::error::$1"; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"

case "${1:-}" in
  before)
    printf '| Row | Result |\n| :-- | :-- |\n' > "$ROWS"
    tgz=$(ls "$RUNNER_TEMP"/pack/*.tgz)
    sum=$( (sha256sum "$tgz" 2>/dev/null || shasum -a 256 "$tgz") | cut -d' ' -f1)
    grep -qF "$sum" "$RUNNER_TEMP/pack/SHA256SUMS" || fail "the tarball does not match SHA256SUMS"
    row Tarball "sha256 \`$sum\`, matches SHA256SUMS"
    got=$(assayer --version)
    [ "$got" = "$(node -p "require('./runner/package.json').version")" ] || fail "assayer --version printed $got"
    row Starts "\`assayer --version\` prints $got"
    set +e; assayer doctor > doctor.txt; code=$?; set -e
    cat doctor.txt
    [ "$code" = 1 ] || fail "doctor with no engine exited $code, expected 1"
    row "Doctor, no engine" "exit 1: $(tail -1 doctor.txt)"
    ;;
  engine)
    assayer doctor > doctor.txt || { cat doctor.txt; fail "doctor with Claude Code installed is not ready"; }
    row "Doctor, Claude Code" "exit 0: $(tail -1 doctor.txt)"
    bash "$here/sandbox.sh" "$RUNNER_TEMP/sandbox"
    (cd "$RUNNER_TEMP/sandbox" && assayer review --engine claude-code) > review.txt 2>&1 || { cat review.txt; fail "the local round failed"; }
    cat review.txt
    grep -q 'completed: 1 finding(s)' review.txt && grep -q 'coupon.js:3' review.txt || fail "the round did not report the scripted finding at coupon.js:3"
    row Review "local round on \`main\` with uncommitted work: $(grep -m1 'completed:' review.txt), \`coupon.js:3\`"
    assayer telemetry status > telemetry.txt
    cat telemetry.txt
    grep -q 'forced by ASSAYER_TELEMETRY, DO_NOT_TRACK or CI' telemetry.txt || fail "telemetry is not forced off in CI"
    grep -q 'recently sent (0,' telemetry.txt || fail "telemetry recorded a send in CI"
    row Telemetry "forced off in CI, nothing sent"
    npm rm -g @prismalens/assayer > /dev/null
    hash -r  # bash remembers the removed binary's path otherwise
    if command -v assayer > /dev/null; then fail "assayer is still on PATH after npm rm -g"; fi
    row Uninstall "\`assayer\` is gone"
    ;;
  *) fail "usage: rows.sh before|engine" ;;
esac
