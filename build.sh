#!/bin/bash
# Launcher -- build.sh is dev/build tooling, not site content, so the real
# script lives on the hugo branch (alongside config/themes/layouts), not
# here. This just fetches the current version of it and runs it against this
# checkout; edit the hugo-branch copy, not this one.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

git fetch origin hugo -q

REAL_BUILD_SH="$(mktemp)"
trap 'rm -f "$REAL_BUILD_SH"' EXIT
git show origin/hugo:build.sh > "$REAL_BUILD_SH"
chmod +x "$REAL_BUILD_SH"

"$REAL_BUILD_SH" "$ROOT"
