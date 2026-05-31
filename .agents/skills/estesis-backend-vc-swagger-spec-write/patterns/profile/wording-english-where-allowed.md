---
name: wording-english-where-allowed
title: Где английский остается обязательным
category: wording
kind: category
severity_when_violated: MEDIUM
applies_to:
  - любые YAML-файлы этапов
  - технические идентификаторы и тэги
related:
  - wording-russian-default
  - wording-service-names
source:
  - references/wording-registry.md (английский для API-терминов, OpenAPI tags оставляй на английском)
  - empirical (changes/016_lessons_resources/, changes/020_resource_owned_content_studio/)
---

# Где английский остается обязательным

## Правило

Английский сохраняется в технически точных частях контракта: `operationId`, `paths`, `tags` (OpenAPI tag values), `schema names`, `field names`, `enum values`, HTTP-методы и статусы, ссылки `$ref`, имена файлов, примеры payload, регистровые ссылки. Реестр замен и общий перевод на русский к этим элементам не применяются.

## Когда применяется

- любой YAML-файл этапа;
- любая постановка, где встречаются технические идентификаторы.

## Как проверить

- Технические идентификаторы должны оставаться на английском даже в новых постановках с русскими описаниями: `operationId: setLessonPublication`, `tags: [Lessons, Shop, Library]`, `path: /api/v1/lessons/{id}/publication`, поля вроде `isPublished`, enum значения `lessonResult`, `programLesson`.
- В тексте описаний backticked технические термины не нужно переводить: `\`isPublished=true\``, `\`409 Conflict\``, `\`bearerAuth\``, `\`PATCH /api/v1/events/{id}\``.
- Если новый код контракта намеренно введен на английском (например, новый enum value `published`), оставь его и просто опиши по-русски в `description` соответствующего поля/параметра.
- Если ревьюер видит, что кто-то перевел `operationId`, `tag name`, `schema name`, `field name` или enum value на русский — это нарушение этого паттерна и MEDIUM finding.

## Severity и риск

MEDIUM. Перевод технических идентификаторов на русский ломает совместимость с генераторами SDK, существующим бэкендом и Swagger UI: даже один неверно переведенный `operationId` или enum value делает контракт нерабочим без отдельного маппинга.

## Хороший пример

- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml:11-13` — теги `Studio Results`, `Studio Schedule`, `Studio Programs` (на английском), при этом `summary`/`description` методов по-русски.
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml:18,59,167,204` — `operationId` (`saveStudioResult`, `getStudioScheduleItems`, `createStudioScheduleItem`, `clearStudioSchedule`) и пути на английском, описание на русском.
- `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml:23-27` — теги `Lessons`, `Library`, `Shop`, `ResourceDocuments` на английском.

## Антипример

Гипотетический случай некорректного перевода технических идентификаторов:

```yaml
paths:
  /api/v1/уроки/{id}/публикация:
    post:
      operationId: установитьПубликациюУрока
      tags:
        - Уроки
      summary: Установить статус публикации
```

Корректный вариант — путь, `operationId`, `tags` на английском, остальной текст по-русски (см. `changes/016_lessons_resources/02_01_resources_lessons_shop_library.yaml:30-45`). Также не следует переводить enum значения вроде `published`/`unpublished` или поля вроде `isPublished` на русский даже когда правило русского-по-умолчанию применяется к окружающему тексту.

## Связанные паттерны

- [[wording-russian-default]] — общий принцип, для которого этот паттерн задает явные исключения.
- [[wording-service-names]] — service id (`calendar`, `resources`) — английский в путях/`$ref`, русский в прозе.

## Заметки для ревьюера

- Если в файле встречается русский в `operationId`/`tag`/`enum` — это всегда reportable, независимо от того, сколько правил остального файла соблюдено.
- В примерах payload (`example:`, `examples:`) английский допустим как часть данных payload, но если конкретное значение поля семантически русское (например, имя пользователя), оставляй его на русском.
