# JoinSheetsImport

[English](README.md) · **Русский**

![version](https://img.shields.io/badge/version-0.1.0b1-blue)
![license](https://img.shields.io/badge/license-Apache--2.0-green)
![status](https://img.shields.io/badge/status-beta-yellow)

Конвертер форматов: импортирует данные из `.xlsx` в источник данных для [JoinSheets](https://github.com/JoinSheets/JoinSheets).
Разбирает плоскую таблицу в ленивый формат данных JoinSheets и генерирует соответствующий
фрагмент манифеста. Не требует установки, не требует серверной части или скачивания зависимостей,
работает локально, в браузере.

Отсутствие конвертора не влияет на основной функционал [JoinSheets](https://github.com/JoinSheets/JoinSheets)
— его наличие опционально.

Часть организации [JoinSheets](https://github.com/JoinSheets).

## Лицензия

Apache-2.0 — см. [LICENSE](LICENSE).

Вендоренная библиотека разбора (`vendor/xlsx.full.min.js`, [SheetJS](https://sheetjs.com/)
Community Edition) распространяется по своей отдельной копии той же лицензии — см.
[`vendor/SHEETJS-LICENSE`](vendor/SHEETJS-LICENSE) — и используется как зависимость, со
своим отдельным копирайтом, не объединяется с лицензией этого проекта.
