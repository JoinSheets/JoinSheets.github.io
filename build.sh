#!/bin/bash
# Builds the site locally and stages the result in a gh-pages worktree --
# does NOT commit or push anything. Run from a checkout of `main`, with
# submodules present (this script initializes them if missing).
#
# See README.md for what to install first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

EXPECTED_HUGO_VERSION="0.148.0"

if ! command -v hugo >/dev/null 2>&1; then
  echo "error: hugo not found on PATH. See README.md for install instructions." >&2
  exit 1
fi

hugo_version="$(hugo version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
if [ "$hugo_version" != "$EXPECTED_HUGO_VERSION" ]; then
  echo "warning: this site was set up against hugo $EXPECTED_HUGO_VERSION, found $hugo_version -- continuing anyway." >&2
fi

echo "==> Pulling in submodules (content/docs/advanced-course, static/demo)"
git submodule update --init --recursive

echo "==> Overlaying config/ + themes/ + layouts/ + static/css/ + static/images/ from the hugo branch"
git fetch origin hugo
git checkout "origin/hugo" -- config/ themes/ layouts/ static/css/ static/images/ .gitmodules
git submodule update --init --recursive -- themes/compose

echo "==> Building with hugo --minify"
rm -rf public
hugo --minify

echo "==> Staging the build in a gh-pages worktree (not committing)"
WORKTREE_DIR="$ROOT/../joinsheets-github-io-gh-pages"
if [ ! -d "$WORKTREE_DIR" ]; then
  if git show-ref --verify --quiet refs/heads/gh-pages; then
    git worktree add "$WORKTREE_DIR" gh-pages
  elif git fetch origin gh-pages 2>/dev/null && git show-ref --verify --quiet refs/remotes/origin/gh-pages; then
    git worktree add -b gh-pages "$WORKTREE_DIR" origin/gh-pages
  else
    # First run ever, nothing to base an orphan branch on locally or
    # remotely -- add a detached worktree, then make it an orphan in place
    # (older git versions don't support `worktree add --orphan`).
    git worktree add --detach "$WORKTREE_DIR" HEAD
    (cd "$WORKTREE_DIR" && git checkout --orphan gh-pages && git rm -rf . >/dev/null)
  fi
fi

# Replace the worktree's tracked content with the fresh build, keep .git alone.
find "$WORKTREE_DIR" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -r public/. "$WORKTREE_DIR/"
touch "$WORKTREE_DIR/.nojekyll"

# Undo the hugo-branch overlay on main: unstage config/themes/layouts/
# static/css/static/images (they don't belong in main's history) and
# restore main's own .gitmodules (the doc-section + demo submodules, not
# the theme). static/demo (a submodule on main) is left alone -- only
# static/css/ and static/images/ came from hugo.
git reset -q HEAD -- config themes layouts static/css static/images .gitmodules 2>/dev/null || true
rm -rf config themes layouts static/css static/images
git checkout -- .gitmodules

echo
echo "Done. Review the result:"
echo "  cd $WORKTREE_DIR && git status"
echo "then commit and push it yourself when you're happy with it."
