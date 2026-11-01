# Changelog

**English** · [Русский](CHANGELOG.ru.md)

All notable changes to JoinSheets are documented here. Dates are release dates (UTC).

## Planned next

Multi-language support for the app's own UI. The settings screen already has a
placeholder for it (Settings → Language) -- the translations themselves, and the
string extraction they need across the whole UI, are a separate, not-yet-started
release.

## [0.2.0b1] - 2026-11-01

### Added

- A settings screen (gear icon, top right, on every screen): currently holds a
  theme switcher; the language section is a placeholder for the next release.
  The chosen theme is saved and applied live across every open tab.
- Modular theming: the app's palette (~15 CSS custom properties) now lives in
  swappable `themes/*.css` files instead of being baked into `styles.css`. Four
  themes ship: Compose (matches joinsheets.github.io's own look -- the
  default), Auto (follows the OS/browser setting), Light, and Dark.
- A logo button in the nav header, linking to joinsheets.github.io.

### Changed

- The Export/Filter/Fields/Data nav buttons dropped their icons -- Filter's
  funnel icon was also the per-column quick-filter's own icon, so the same
  pictogram read as two different things. "Advanced filter" is now labeled
  "Filter".

## [0.1.0b1] - 2026-10-27

First release under the JoinSheets organization: ported from `ds-webui`
(DS-Pipeline org, last alpha `0.33.0a1`) -- code, comments, and the UI
translated to English, screens renamed (Data/Fields/Table), license switched to
Apache-2.0.
