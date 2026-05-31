---
name: wording-russian-default
title: Человекочитаемый текст по умолчанию на русском
category: wording
kind: category
severity_when_violated: LOW
applies_to:
  - любые YAML-файлы этапов
  - '`info.title`, `info.description`'
  - '`summary`, `description` методов, параметров, схем, статусов, полей'
  - markdown-контекст и комментарии в `description`
related:
  - wording-english-where-allowed
  - wording-replacement-registry
  - wording-service-names
source:
  - references/wording-registry.md (правило про русский язык и реестр замен)
  - empirical (changes/016_lessons_resources/, changes/020_resource_owned_content_studio/)
---

# Человекочитаемый текст по умолчанию на русском

## Правило

Постановки пишутся на русском языке. Английский допустим только там, где это часть контракта (см. `wording-english-where-allowed`). В человекочитаемых `title`, `summary`, `description`, markdown-контексте и комментариях избегай англоязычных фраз без необходимости.

## Когда применяется

- любой `info.title`, `info.description`, `summary`, `description` в YAML;
- комментарии и markdown внутри `description: |`;
- ответы `responses[*].description` и описания параметров/полей.

## Как проверить

- Прочитай человекочитаемый текст и проверь, что осмысленные фразы — на русском, а не на английском.
- Часто встречающиеся англоязычные смесы: `the request body`, `the user`, `from stage 01`, `request data`, `response model`, `is not allowed`, `must be unique`. Они почти всегда переводимы.
- Особое внимание к multi-line `description: |` блокам: даже если первый абзац на русском, последующие могут уезжать в английский по инерции.
- Английский, оставшийся в backtick-обертке (`isPublished`, `409 Conflict`, `bearerAuth`) и в примерах payload — нормально и относится к контракту.
- Не путай это правило с замен-реестром (отдельный паттерн): здесь речь о выборе языка предложения, а не о конкретных словах вроде `publish` или `shop`.

## Severity и риск

LOW. Нарушение не ломает контракт и не блокирует разработчика, но снижает читаемость для команды и нарушает консистентность всего набора постановок. Накапливаясь, англо-русские "гибриды" вроде `Existing update метод из stage 01` усложняют ревью и навигацию.

## Хороший пример

- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml:3` — `title: 'API сервиса Ресурсов: расписание купленных занятий'`, описание метода и ответов целиком на русском.
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml:166-202` — описание `createStudioScheduleItem`, включая `400`, `403`, `404`, написано по-русски, при этом коды статусов и JSON примеры остаются английскими.
- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml:32-67` — `setLessonPublication`: `summary`, `description`, `responses[*].description` на русском, англ. остается только в `isPublished`, кодах статусов и enum значениях.

## Антипример

Гибридный текст из реальной постановки (`changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml:17-23`):

```yaml
summary: Установить publication status video lesson
description: |
  Устанавливает publication status для video lesson.

  Если `isPublished=false` и source video lesson сейчас published, service hard-deletes published source row и создает новую unpublished draft/source copy с новым id.
```

Здесь слова `publication status`, `video lesson`, `source`, `published`, `service hard-deletes`, `draft/source copy`, `unpublished` — все имеют русские эквиваленты из реестра замен. Корректный вариант пишется по образцу `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml:33-43`: "Установить статус публикации", "сервис выполняет hard-delete опубликованного оригинального ресурса", и т.д.

## Связанные паттерны

- [[wording-english-where-allowed]] — что именно остается на английском, чтобы не зачищать слишком агрессивно.
- [[wording-replacement-registry]] — конкретные слова, которые обязательно переводятся.
- [[wording-service-names]] — частный случай для названий сервисов.

## Заметки для ревьюера

- Старые iteration folders (особенно 013, 014, 019) могут быть полностью на английском. Не требуй массового переписывания, если пользователь явно не попросил; фиксируй как LOW finding и предлагай починить точечно при следующей правке файла.
- Если в новой постановке встречается английский в нестандартных терминах (`hard-delete`, `soft-delete`, `purge`), допустимо оставить английский термин в backtick, но окружающее предложение все равно русское.
