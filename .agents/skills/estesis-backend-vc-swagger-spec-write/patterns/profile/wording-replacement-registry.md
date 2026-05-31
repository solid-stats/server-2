---
name: wording-replacement-registry
title: Реестр обязательных замен в человекочитаемом тексте
category: wording
kind: category
severity_when_violated: LOW
applies_to:
  - '`title`, `summary`, `description` (методов, параметров, схем, статусов, полей)'
  - markdown-контекст и комментарии внутри `description`
related:
  - wording-russian-default
  - wording-english-where-allowed
  - wording-service-names
source:
  - references/wording-registry.md (раздел "Реестр замен для человекочитаемого текста")
  - empirical (changes/016_lessons_resources/, changes/020_resource_owned_content_studio/)
---

# Реестр обязательных замен в человекочитаемом тексте

## Правило

В человекочитаемом тексте перечисленные английские слова переводятся на русский. Замены применяются в `title`, `summary`, `description`, markdown-контексте и комментариях. Технические идентификаторы (`paths`, `operationId`, schema names, field names, enum values, `$ref`, имена файлов) не переименовываются.

Реестр (точная форма выбирается по контексту):

- `publish` / `published` -> опубликовать / публикация / опубликованный
- `unpublish` / `unpublished` -> снять с публикации / снятие с публикации / неопубликованный
- `source` -> оригинальный / оригинальный ресурс
- `Shop` / `shop` / `витрина` -> магазин
- `request` -> запрос; `request body` -> тело запроса; `body` -> тело
- `response` -> ответ
- `update` -> редактировать / обновить
- `stage` -> этап
- `step` -> шаг
- `method` -> метод
- `fragment` -> фрагмент
- `mutation` -> изменение
- `calendar` -> календарь
- `event` / `events` -> ивент / событие

## Когда применяется

- любой текст, не относящийся к техническим идентификаторам, в YAML этапа;
- в первую очередь — заголовки/`summary`/`description` методов, параметров, схем и `responses[*].description`.

## Как проверить

- Прогон по реестру: ищи каждое из ключевых английских слов в YAML и проверяй, что это не техническое имя (поле, enum value, путь, `$ref`).
  - `rg -in "publish|published|unpublish" changes/<folder>` — кандидаты в публикацию.
  - `rg -in "\\bshop\\b|\\bShop\\b|витрина" changes/<folder>` — кандидаты в магазин.
  - `rg -in "\\bstage\\b|\\bstep\\b" changes/<folder>` — этап/шаг.
- Если слово встречается в обычном предложении (например, "fragment", "request body", "method"), оно должно быть переведено.
- Реестр НЕ применяется внутри backticks (`\`request body\`` оставлять не нужно; и форма `request body` без backticks в обычном тексте — это нарушение, надо `тело запроса`).
- При сомнении смотри образцы на 016/020: они правильно переведены и помогают подобрать форму.

## Severity и риск

LOW. Не ломает контракт, но создает hybrid wording, который `references/wording-registry.md` явно запрещает. Накапливающиеся неконсистентности затрудняют единый стиль и ревью.

## Хороший пример

- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml:5-21` — `info.description` использует "магазин", "статус публикации", "оригинальный урок", "неопубликованная копия ресурса", "обычный метод delete" вместо `shop`, `publish status`, `source`, `unpublished resource copy`.
- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml:82-83` — `summary: Блокировка update опубликованного урока`, `description: Существующий update метод из stage 01.` — `published` и `Lesson` корректно переведены, оставлены `update` (как термин действия) и `stage` (тоже из реестра — должно быть "этап"). Это пограничный случай — частично соответствует, частично нет.
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml:62-66` — "сервис Календаря", "ивент"/"событие", "запрос" в осмысленных местах.

## Антипример

`changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml:17-23`:

```yaml
summary: Установить publication status video lesson
description: |
  Устанавливает publication status для video lesson.

  Если `isPublished=true`, source video lesson становится published и purchasable.
```

Здесь нарушены сразу несколько строк реестра: `publication`/`published` -> публикация/опубликованный, `source` -> оригинальный, `video lesson` в обычной прозе можно оставить как термин, но `published` и `publication status` обязаны быть на русском. Корректно: "Установить статус публикации видеолекции" / "Если \`isPublished=true\`, оригинальная видеолекция становится опубликованной и доступной для покупки."

Другой пример — `stage 01` вместо `этап 01` в описаниях fragment-методов (`changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml:83`).

## Связанные паттерны

- [[wording-russian-default]] — общий принцип, частной реализацией которого является этот реестр.
- [[wording-service-names]] — отдельно для названий сервисов.
- [[wording-studio-lowercase]] — отдельный кейс для слова "студия".

## Заметки для ревьюера

- Реестр применяется только к человекочитаемой прозе. Не предлагать переименовать `field: source` или `enum: published` — это технические идентификаторы.
- Если слово находится в backtick (например, `\`source\`` как имя поля), оставляй как есть и не считай нарушением.
- В исторических постановках (013, 014, 022) реестр может массово нарушаться. Не требуй массового переписывания; фиксируй как LOW и предлагай дочистить при ближайшей правке.
