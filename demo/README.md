# JoinSheets

**English** · [Русский](README.ru.md)

![version](https://img.shields.io/badge/version-0.1.0b1-blue)
![license](https://img.shields.io/badge/license-Apache--2.0-green)
![status](https://img.shields.io/badge/status-beta-yellow)

A browser-only table builder:

- works with flat tables;
- builds a dataset through set operations (union, subtraction, intersection, etc.);
- parses core data types (text, dates, numbers, booleans, or empty values);
- computes fields (aggregation, formulas, priority-based collision resolution);
- supports core table operations (search, sort, group, filter);
- exports the result to Excel/CSV.

No external dependencies, no backend, no install -- just download the repository
and open `index.html`. Runs as a static site, entirely locally.

The optional [JoinSheetsImport](https://github.com/JoinSheets/JoinSheetsImport)
submodule adds an "Import" button for loading data from Excel.

Ships with a ready-to-try demo ([`sample-data/`](sample-data/)) for a quick start
with simple examples.

## License

Apache-2.0 — see [LICENSE](LICENSE).
