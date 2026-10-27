# JoinSheets.github.io

**English** · [Русский](README.ru.md)

Source for the [JoinSheets](https://github.com/JoinSheets) organization site —
built with [Hugo](https://gohugo.io/) and the [Compose](https://github.com/info-tech-io/compose)
theme. Live at <https://joinsheets.github.io/>.

## Branch structure

| Branch | Content |
|---|---|
| `main` | Site content (`content/`, `static/`), this README, `build.sh` |
| `hugo` | Hugo config, theme (submodule), build-time assets |
| `gh-pages` | The built site |

Branches are kept separate so content history and config history don't mix;
`build.sh` overlays `hugo` onto `main` only for the duration of a build.

## Submodules

- `static/demo` — the [JoinSheets](https://github.com/JoinSheets/JoinSheets)
  app itself (pinned to a release tag), served as the site's live demo.
- `content/docs/advanced-course` — [JoinSheetsRoast](https://github.com/JoinSheets/JoinSheetsRoast),
  the advanced developer course (Russian only, no English translation for
  this section).
- `themes/compose` (on the `hugo` branch) — the Compose theme.

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

`build.sh`:
1. Initializes/updates the submodules above.
2. Overlays `config/` + `themes/` from the `hugo` branch onto this checkout
   (temporarily — it's undone at the end, `main` itself never carries them).
3. Runs `hugo --minify` into `public/`.
4. Copies the result into a `gh-pages` git worktree at
   `../joinsheets-github-io-gh-pages` — **does not commit or push anything.**

Review the worktree, then commit and push it yourself:

```bash
cd ../joinsheets-github-io-gh-pages
git status
git add -A && git commit -m "Build: <date/reason>"
git push origin gh-pages
```

### Local preview without a full build

To just preview content changes without pulling in the `hugo` branch's
config each time:

```bash
git checkout origin/hugo -- config/ themes/ .gitmodules
git submodule update --init --recursive -- themes/compose
hugo server -D
```

(then `git checkout -- .gitmodules && rm -rf config themes` to clean up, same
as `build.sh` does automatically).

## Known limitations (stub phase)

- `content/docs/advanced-course` is a plain submodule mount of
  JoinSheetsRoast's own Markdown files (no Hugo front matter yet) — they
  render, but without the section's own `weight`-ordered index page, and
  Hugo currently tags them as the default language (English) even though
  the content is Russian. To be revisited once the course's own rework is
  done.
