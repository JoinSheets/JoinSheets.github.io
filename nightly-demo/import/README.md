# JoinSheetsImport

**English** · [Русский](README.ru.md)

![version](https://img.shields.io/badge/version-0.1.0b1-blue)
![license](https://img.shields.io/badge/license-Apache--2.0-green)
![status](https://img.shields.io/badge/status-beta-yellow)

A format converter: imports data from `.xlsx` into a [JoinSheets](https://github.com/JoinSheets/JoinSheets)
data source. Parses a flat spreadsheet into JoinSheets' data format and generates a
matching manifest fragment. No installation, no backend, no dependencies to download —
runs locally, in the browser.

The converter is optional — its absence does not affect [JoinSheets](https://github.com/JoinSheets/JoinSheets)'
core functionality.

Part of the [JoinSheets](https://github.com/JoinSheets) organization.

## License

Apache-2.0 — see [LICENSE](LICENSE).

The vendored parsing library (`vendor/xlsx.full.min.js`, [SheetJS](https://sheetjs.com/)
Community Edition) ships under its own copy of the same license — see
[`vendor/SHEETJS-LICENSE`](vendor/SHEETJS-LICENSE) — and is used as a dependency, with
its own separate copyright, not folded into this project's license.
