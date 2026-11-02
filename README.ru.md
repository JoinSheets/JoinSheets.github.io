# JoinSheets.github.io

[English](README.md) · **Русский**

Исходники сайта организации [JoinSheets](https://github.com/JoinSheets) —
собран на [Hugo](https://gohugo.io/) с темой [Compose](https://github.com/info-tech-io/compose).
Живой адрес: <https://joinsheets.github.io/>.

## Структура веток

| Ветка | Содержимое |
|---|---|
| `main` | Контент сайта (`content/`, `static/`), этот README, лаунчер `build.sh` |
| `hugo` | Конфиг Hugo, тема (submodule), ассеты для сборки, настоящий `build.sh` |
| `gh-pages` | Собранный сайт |

Ветки разделены, чтобы история контента и история конфига не смешивались.
`build.sh` сам по себе — это build-инструмент, а не контент, поэтому живёт в
ветке `hugo` — `build.sh` на `main` всего лишь тонкий лаунчер, который
подтягивает актуальную версию из `hugo` и запускает её; та версия и
накладывает `hugo` на `main` на время сборки (см. ниже).

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

`./build.sh` здесь — лаунчер: подтягивает настоящий скрипт из ветки `hugo` и
запускает его против этого чекаута (если сам процесс сборки нужно поменять —
редактировать версию на ветке `hugo`, не эту). Он:

1. Инициализирует/обновляет submodules выше.
2. Накладывает `config/` + `themes/` + `layouts/` + `static/css/` + `static/images/` из ветки `hugo`
   на этот чекаут (временно — в конце откатывается, сама `main` их никогда не несёт).
3. Собирает `hugo --minify` в `public/` — релизный сайт, `static/demo` на
   своём обычном закреплённом релизном коммите.
4. Собирает ещё раз, в `public-nightly/`, с `static/demo`, переключённым на
   текущий `develop` (после сборки возвращается обратно на свой реальный
   пин) — повседневный превью текущего состояния `develop`, не привязан к
   подготовке релиза; запускать когда угодно, чтобы посмотреть, что сейчас
   в `develop`, независимо от того, готовится ли релиз.
5. Копирует `public/` в git worktree ветки `gh-pages` по пути
   `../gh-pages.joinsheets.github.io`, а `public-nightly/demo/` — в
   `nightly-demo/` этого же worktree — **ничего не коммитит и не пушит.**

Ночной превью нигде не указан ссылкой на сайте и исключён из индексации
поисковиками через `robots.txt` — доступен по прямому адресу
(`/nightly-demo/`), если знать, что он там есть, но нигде не рекламируется.

Дальше — проверить worktree и закоммитить/запушить самостоятельно:

```bash
cd ../gh-pages.joinsheets.github.io
git status
git add -A && git commit -m "Build: <дата/причина>"
git push origin gh-pages
```

### Локальный предпросмотр без полной сборки

Чтобы просто посмотреть правки в контенте, не гоняя каждый раз конфиг из
ветки `hugo`:

```bash
git checkout origin/hugo -- config/ themes/ layouts/ static/css/ static/images/ .gitmodules
git submodule update --init --recursive -- themes/compose
hugo server -D
```

(затем `git checkout -- .gitmodules && rm -rf config themes layouts static/css static/images`, чтобы
откатить — то же самое `build.sh` делает автоматически).

## Известные ограничения (стадия заглушки)

- `content/docs/quick-start`/`user-guide`/`cookbook`/`developers` — это просто
  submodule-точки монтирования их собственных markdown-заглушек (без Hugo
  front matter) — рендерятся, но без собственных отсортированных по `weight`
  индексных страниц разделов. У `content/docs/advanced-course`
  (JoinSheetsRoast) front matter уже есть (`title`/`weight` на каждой главе);
  остальные разделы пока заглушки, будут наполняться по мере готовности
  реального контента.
- После пулла новых коммитов submodules — перед сборкой заново выполнить
  `git submodule update --init` (или `--init --recursive` для полной
  сборки) — обычный `git pull`/`git checkout` на `main` сам по себе
  содержимое submodules не обновляет.
