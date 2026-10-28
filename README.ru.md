# JoinSheets.github.io

[English](README.md) · **Русский**

Исходники сайта организации [JoinSheets](https://github.com/JoinSheets) —
собран на [Hugo](https://gohugo.io/) с темой [Compose](https://github.com/info-tech-io/compose).
Живой адрес: <https://joinsheets.github.io/>.

## Структура веток

| Ветка | Содержимое |
|---|---|
| `main` | Контент сайта (`content/`, `static/`), этот README, `build.sh` |
| `hugo` | Конфиг Hugo, тема (submodule), ассеты для сборки |
| `gh-pages` | Собранный сайт |

Ветки разделены, чтобы история контента и история конфига не смешивались;
`build.sh` накладывает `hugo` на `main` только на время сборки.

## Submodules

- `static/demo` — само приложение [JoinSheets](https://github.com/JoinSheets/JoinSheets)
  (зафиксировано на релизном теге), показывается как живое демо сайта.
- `content/docs/quick-start` — [JoinSheetsQuickStart](https://github.com/JoinSheets/JoinSheetsQuickStart)
- `content/docs/user-guide` — [JoinSheetsUserGuide](https://github.com/JoinSheets/JoinSheetsUserGuide)
- `content/docs/cookbook` — [JoinSheetsCookbook](https://github.com/JoinSheets/JoinSheetsCookbook)
- `content/docs/developers` — [JoinSheetsDocs](https://github.com/JoinSheets/JoinSheetsDocs)
- `content/docs/advanced-course` — [JoinSheetsRoast](https://github.com/JoinSheets/JoinSheetsRoast),
  продвинутый курс для разработчиков (только на русском, без перевода на
  английский для этого раздела).
- `themes/compose` (в ветке `hugo`) — тема Compose.

Каждый раздел документации — отдельный репозиторий, чтобы его можно было
клонировать, редактировать и версионировать независимо от самого сайта —
репозиторий сайта просто указывает на коммит каждого из них.

## Сборка сайта

CI нет — собирается локально, результат пушится вручную.

**Понадобится:**
- [Hugo](https://gohugo.io/) **extended**, v0.148.0 (версия, под которую
  настроен сайт — проверить через `hugo version`; более новый extended-релиз
  скорее всего тоже подойдёт, `build.sh` просто предупредит, если версия не
  совпала)
- `git`

```bash
git clone https://github.com/JoinSheets/JoinSheets.github.io.git
cd JoinSheets.github.io
./build.sh
```

`build.sh`:
1. Инициализирует/обновляет submodules выше.
2. Накладывает `config/` + `themes/` из ветки `hugo` на этот чекаут
   (временно — в конце откатывается, сама `main` их никогда не несёт).
3. Собирает `hugo --minify` в `public/`.
4. Копирует результат в git worktree ветки `gh-pages` по пути
   `../joinsheets-github-io-gh-pages` — **ничего не коммитит и не пушит.**

Дальше — проверить worktree и закоммитить/запушить самостоятельно:

```bash
cd ../joinsheets-github-io-gh-pages
git status
git add -A && git commit -m "Build: <дата/причина>"
git push origin gh-pages
```

### Локальный предпросмотр без полной сборки

Чтобы просто посмотреть правки в контенте, не гоняя каждый раз конфиг из
ветки `hugo`:

```bash
git checkout origin/hugo -- config/ themes/ .gitmodules
git submodule update --init --recursive -- themes/compose
hugo server -D
```

(затем `git checkout -- .gitmodules && rm -rf config themes`, чтобы
откатить — то же самое `build.sh` делает автоматически).

## Известные ограничения (стадия заглушки)

- `content/docs/advanced-course` — это просто submodule-точка монтирования
  markdown-файлов JoinSheetsRoast (пока без Hugo front matter) — они
  рендерятся, но без собственной отсортированной по `weight` индексной
  страницы раздела, и Hugo сейчас помечает их как дефолтный язык
  (английский), хотя контент на русском. Вернёмся к этому, когда будет
  сделана переработка самого курса.
- После пулла новых коммитов submodules — перед сборкой заново выполнить
  `git submodule update --init` (или `--init --recursive` для полной
  сборки) — обычный `git pull`/`git checkout` на `main` сам по себе
  содержимое submodules не обновляет.
