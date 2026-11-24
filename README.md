# JoinSheets.github.io

**English** · [Русский](README.ru.md)

Source for the [JoinSheets](https://github.com/JoinSheets) organization site —
built with [Hugo](https://gohugo.io/) and the [Compose](https://github.com/info-tech-io/compose)
theme. Live at <https://joinsheets.github.io/>.

## Branch structure

| Branch | Content |
|---|---|
| `main` | Site content (`content/`, `static/`), this README, a `build.sh` launcher |
| `hugo` | Hugo config, theme (submodule), build-time assets, the real `build.sh` |
| `gh-pages` | The built site |

Branches are kept separate so content history and config history don't mix.
`build.sh` is itself build tooling, not content, so it lives on `hugo` --
`main`'s own `build.sh` is a thin launcher that fetches and runs the current
`hugo`-branch copy, which overlays `hugo` onto `main` for the duration of a
build (see below).

## Submodules

- `static/demo` — the [JoinSheets](https://github.com/JoinSheets/JoinSheets)
  app itself (pinned to a release tag), served as the site's live demo.
- `content/docs/quick-start` — [JoinSheetsQuickStart](https://github.com/JoinSheets/JoinSheetsQuickStart)
- `content/docs/user-guide` — [JoinSheetsUserGuide](https://github.com/JoinSheets/JoinSheetsUserGuide)
- `content/docs/cookbook` — [JoinSheetsCookbook](https://github.com/JoinSheets/JoinSheetsCookbook)
- `content/docs/developers` — [JoinSheetsDocs](https://github.com/JoinSheets/JoinSheetsDocs)
- `themes/compose` (on the `hugo` branch) — the Compose theme.

[JoinSheetsRoast](https://github.com/JoinSheets/JoinSheetsRoast), the
advanced developer course, is **not** one of these submodules -- it builds
and deploys as its own standalone site
([joinsheets.github.io/JoinSheetsRoast/](https://joinsheets.github.io/JoinSheetsRoast/)),
linked from the developer docs' Contributing page rather than mounted in
this site's own navigation.

Each doc section is its own repository so it can be cloned, edited, and
versioned independently of the site itself — the site repo just points at a
commit of each.

## Building the site

No CI — this is built locally and the result is pushed by hand.

**You'll need:**
- [Hugo](https://gohugo.io/) **extended**, v0.148.0 (the version this site
  was set up against — check `hugo version`; a newer extended release will
  likely work too, `build.sh` just warns if it doesn't match)
- `git`

```bash
git clone https://github.com/JoinSheets/JoinSheets.github.io.git
cd JoinSheets.github.io
./build.sh
```

`./build.sh` here is a launcher -- it fetches the real script from the `hugo`
branch and runs it against this checkout (edit the `hugo`-branch copy, not
this one, if the build process itself needs to change). It:

1. Initializes/updates the submodules above.
2. Overlays `config/` + `themes/` + `layouts/` + `static/css/` + `static/images/` from the `hugo` branch
   onto this checkout (temporarily — it's undone at the end, `main` itself never carries them).
3. Runs `hugo --minify` into `public/` — the release site, `static/demo` at
   its normal pinned ref.
4. Builds a second time into `public-nightly/`, with `static/demo` switched
   to `develop`'s tip instead (restored to its real pinned ref afterward) —
   a day-to-day preview of the product's current `develop` state, not tied
   to release prep; run this whenever you want to eyeball what's on
   `develop`, release coming up or not.
5. Copies `public/` into a `gh-pages` git worktree at
   `../gh-pages.joinsheets.github.io`, and `public-nightly/demo/` into that
   worktree's `nightly-demo/` — **does not commit or push anything.**

The nightly preview isn't linked from anywhere on the site and is excluded
via `robots.txt` — reachable by URL (`/nightly-demo/`) if you know it's
there, not advertised.

Review the worktree, then commit and push it yourself:

```bash
cd ../gh-pages.joinsheets.github.io
git status
git add -A && git commit -m "Build: <date/reason>"
git push origin gh-pages
```

### Local preview without a full build

To just preview content changes without pulling in the `hugo` branch's
config each time:

```bash
git checkout origin/hugo -- config/ themes/ layouts/ static/css/ static/images/ .gitmodules
git submodule update --init --recursive -- themes/compose
hugo server -D
```

(then `git checkout -- .gitmodules && rm -rf config themes layouts static/css static/images` to clean up,
same as `build.sh` does automatically).

## Known limitations (stub phase)

- `content/docs/quick-start`/`user-guide`/`developers` now have real,
  front-mattered (`title`/`weight`) content. `content/docs/cookbook` has
  its index and one worked recipe so far — the rest of its planned recipes
  are a separate, not-yet-started task in that repo.
- After pulling new submodule commits, re-run `git submodule update --init`
  (or `--init --recursive` for a full build) before building — a bare
  `git pull`/`git checkout` on `main` does not update submodule content by
  itself.
