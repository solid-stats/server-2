---
name: iteration-no-rewriting-old-folders
title: Не переписывай старые iteration folders — создавай новую
category: iteration
kind: category
severity_when_violated: HIGH
applies_to:
  - правки в `Accepted` iteration folders
  - правки в iteration folders, на которые ссылаются другие итерации через `Depends On` или `Supersedes`
related:
  - iteration-folder-naming
  - iteration-changed-baselines-link
  - iteration-index-md-content
source:
  - references/estesis-profile.md (folder and iteration workflow)
  - empirical (changes/CATALOG.md, changes/013_label_public_songs/, changes/023_music_label_display_drafts/)
---

# Не переписывай старые iteration folders — создавай новую

## Правило

Если новая постановка меняет старые постановки, не переписывай старые iteration folders. Создай новую numbered папку в `changes/` и опиши связи через `INDEX.md`: `Depends On`, `Supersedes` и `Changed Baselines`. Папка `XXX_name` immutable: ее YAML-файлы этапов меняются только в рамках той же итерации (см. `CHANGES.md`), но не задним числом из-за новой бизнес-итерации. Это правило не применяется к старым OpenAPI 3.0 файлам только ради смены версии — их не переписывают только для апгрейда стиля.

## Когда применяется

- появилась новая бизнес-итерация, меняющая поведение уже принятой;
- кто-то открыл pull request, который правит YAML в `001`-`019` без новой папки;
- предлагается "обновить" старую `Accepted` iteration вместо создания новой;
- хочется переименовать поля в старой итерации ради единообразия с новой.

## Как проверить

- Сверь `git status` / `git diff` с iteration folders. Любая правка в `Accepted` iteration folder без соответствующей записи в `CHANGES.md` той же итерации — нарушение.
- Если правка реально нужна и она не является частью CHANGES внутри той же итерации, проверь, что вместо этого создана новая папка `XXX_*` с явными `Depends On <старая папка>` и `Supersedes <старое решение>`.
- Сверь с `CATALOG.md` и `Supersedes` секциями новых итераций: новые итерации должны ссылаться на старые, а не подменять их.
- При апгрейде OpenAPI стиля проверь, что правка ограничена единичными мелочами и пользователь явно ее попросил.

## Severity и риск

HIGH. Переписывание принятой итерации задним числом ломает immutable-контракт `changes/`: разработчики, уже реализовавшие старую итерацию, потеряют контекст; новые читатели увидят несогласованность между Stage Map старой папки и тем, что в ней лежит. История исчезает.

## Хороший пример

- `changes/023_music_label_display_drafts/INDEX.md:38-43` — новая итерация явно расширяет `005_music_labels_api` через `Changed Baselines`, не переписывая исходные YAML.
- `changes/021_resource_voice_range/INDEX.md:29-33` — `Supersedes` ссылается на конкретные поля в `014`/`016`/`017`, но эти папки остаются нетронутыми.
- `changes/022_resource_publish_lifecycle/INDEX.md:32-35` — supersedes "Существующее edit behavior" и "Существующее delete behavior", при этом исходные dependency iterations не редактируются.

## Антипример

```
git diff changes/006_video_lessons/02_01_resources_shop_library.yaml
# изменено поле schema VideoLesson, чтобы добавить новое поле coverColor
```

Правка: создать новую папку `changes/0NN_video_lessons_cover_color/`, описать в ее `INDEX.md` `Depends On: 006_video_lessons` и `Changed Baselines`, добавить новый YAML с extension-схемой; исходный `02_01_resources_shop_library.yaml` оставить без изменений.

## Связанные паттерны

- [[iteration-folder-naming]] — новая папка получает следующий глобальный индекс.
- [[iteration-changed-baselines-link]] — связь со старой итерацией фиксируется через `Changed Baselines` и `Supersedes`.
- [[iteration-index-md-content]] — `Supersedes` секция в `INDEX.md` обязательна, если новая папка заменяет старое решение.

## Заметки для ревьюера

- Исключение 1: правки внутри одной итерации в рамках `CHANGES.md`. Если YAML и `CHANGES.md` обновляются согласованно и пишут одну и ту же дату изменения, это допустимо.
- Исключение 2: апгрейд OpenAPI 3.0 → 3.1.0 в старых файлах. Не переписывай старые iteration folders с 3.0 только ради версии — это прямо разрешено правилом профиля (`references/estesis-profile.md`).
- Исключение 3: если старая итерация еще в статусе `Draft`/`Черновик` и активно дорабатывается, ее можно править в рамках того же CHANGES.md; статус `Accepted` обычно делает итерацию immutable.
