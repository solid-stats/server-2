---
name: wording-service-names
title: Названия сервисов по-русски в человекочитаемом тексте
category: wording
kind: category
severity_when_violated: LOW
applies_to:
  - '`info.description`, `summary`, `description` методов/схем/параметров/статусов'
  - markdown-контекст и комментарии
  - '`CONTEXT.md`, `CHANGES.md`, `INDEX.md` при упоминании сервисов в прозе'
related:
  - wording-russian-default
  - wording-english-where-allowed
  - wording-replacement-registry
source:
  - references/wording-registry.md (правило про "сервис Календаря", "сервис Ресурсов", "сервис Авторизации")
  - empirical (changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml)
---

# Названия сервисов по-русски в человекочитаемом тексте

## Правило

В обычном тексте называй сервисы по-русски: "сервис Календаря", "сервис Ресурсов", "сервис Авторизации", "основной backend" и т.п. Service id (`calendar`, `resources`, `auth`, `mainBackend`) остается только в технических местах: `paths`, registry-ссылки, имена файлов, `$ref`, кодовые значения. Гибридные фразы `Calendar Service`, `resources studio schedule flow`, `legacy-compatible patch` запрещены.

## Когда применяется

- любая постановка, где упоминается имя сервиса в прозе;
- особенно cross-service flows, где описывается, какой сервис вызывает какой;
- `info.description`, описания методов с межсервисными вызовами.

## Как проверить

- `rg -in "calendar service|resources service|auth service|main backend service|songs service|playlist service" changes/<folder>` — кандидаты на нарушение.
- `rg -in "сервис Календар|сервис Ресурс|сервис Авториз|основной backend" changes/<folder>` — выявляет корректные использования.
- Если фраза описывает действие сервиса в прозе ("Calendar Service создает событие" / "resources service вызывает"), переписать на "сервис Календаря создает событие" / "сервис Ресурсов вызывает".
- Если service id остается в backtick (`\`calendar\``, `\`resources\``) — это нормально.

## Severity и риск

LOW. Не ломает контракт, но `references/wording-registry.md` явно перечисляет гибридные фразы вроде `Calendar Service` как недопустимые и фиксирует это в `CHANGES.md` итерации 020 (`changes/020_resource_owned_content_studio/CHANGES.md:521`). Согласованность языка важна, потому что в больших постановках сервисы упоминаются десятки раз и плавающий стиль усложняет чтение.

## Хороший пример

- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml:8` — описание принадлежности данных: "Сервис Календаря — единственный владелец событий расписания. Сервис Ресурсов не хранит локальную таблицу расписания...".
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml:25` — описание вызовов с уточнением: "сервис Ресурсов сначала валидирует событие Календаря: получает событие через `GET /api/v1/events/{id}`...".
- `changes/020_resource_owned_content_studio/02_resources_owned_schedule.yaml:172` — "сервис Ресурсов проверяет... затем вызывает `POST /api/v1/events/bulk` сервиса Календаря".
- `changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml:3` — `title: 'API сервиса Календаря: общие события'`.

## Антипример

`changes/020_resource_owned_content_studio/CHANGES.md:536`:

```text
Resources service при удалении одного schedule item вызывает новый endpoint с internal `calendarEventId`, сохраненным в schedule record.
```

Здесь `Resources service` нужно заменить на "сервис Ресурсов", а `schedule item` / `schedule record` — на "элемент расписания" / "запись расписания". Корректная форма уже зафиксирована в `02_resources_owned_schedule.yaml` (см. примеры выше).

Аналогично из `changes/020_resource_owned_content_studio/CHANGES.md:855` — `calendar service-to-service authorization` стоит писать как "service-to-service авторизация сервиса Календаря" или "межсервисная авторизация для сервиса Календаря" (одно из выражений из реестра не отменяет другого).

## Связанные паттерны

- [[wording-russian-default]] — общий принцип русского по умолчанию.
- [[wording-english-where-allowed]] — почему service id (`calendar`, `resources`) остается на английском в путях/`$ref`.
- [[wording-replacement-registry]] — отдельный реестр конкретных слов.

## Заметки для ревьюера

- Принципы применяются и к CHANGES.md/CONTEXT.md/INDEX.md, не только к YAML — это часть planning-документации той же итерации.
- "основной backend" пишется с маленькой буквы; имена сервисов вроде "сервис Календаря", "сервис Ресурсов", "сервис Авторизации" — с заглавной "К/Р/А" в первом слове предметной части. Не делай "сервис календаря" с маленькой.
- Сервисы, которые в реестре сервисов имеют только английское имя (`mainBackend`) и не имеют устоявшегося русского названия — называй их "основной backend"; полные русские формы вроде "главный бэкенд" не вводи без необходимости.
