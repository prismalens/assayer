#!/usr/bin/env bash
# A throwaway repository whose uncommitted change carries one planted defect, for a local round.
set -euo pipefail
dir="$1"
mkdir -p "$dir" && cd "$dir"
git init -q -b main
git config user.email walk@example.invalid && git config user.name walk
printf 'export function applyCoupon(code, coupons) {\n  return coupons[code] ?? 0;\n}\n' > coupon.js
git add coupon.js && git commit -qm base
printf 'export function applyCoupon(code, coupons) {\n  // Codes can be expressions now.\n  return eval(code);\n}\n' > coupon.js
