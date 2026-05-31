---
name: feature-calendar-generic-events
title: Generic-контракт событий сервиса Календаря
category: calendar
kind: feature
severity_when_violated: HIGH
applies_to:
  - calendar service endpoints
  - вызывающие сервисы, которым нужно создавать/читать/менять/удалять события календаря
related:
  - feature-shop-vs-studio
  - feature-pagination-list-endpoints
  - feature-baseline-changes
source:
  - empirical (changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml, docs/calendar-service-openapi.json)
---

# Generic-контракт событий сервиса Календаря

## Правило

Сервис Календаря — generic event store. Событие хранит `id`, `userId`, `dataId` (id, принадлежащий вызывающему сервису), `startAt`, `endAt`, `status` (`PLANNED`, `COMPLETED`, `MISSED`) и nullable `resultId`. Сервис Календаря не интерпретирует доменное значение `dataId`/`resultId`, не проверяет пересечение временных диапазонов, не накладывает permissions, не валидирует ownership в точечных методах (`GET`/`PATCH`/`DELETE` по id) — это ответственность вызывающего сервиса. Создание событий идет через атомарные `POST /api/v1/events/bulk` (явные `startAt`/`endAt`) или `POST /api/v1/events/arrange` (weekday-расстановка); единичное создание делается массивом из одного элемента в `bulk`. Удаление: точечное `DELETE /api/v1/events/{id}` (без ограничений по статусу), массовое `DELETE /api/v1/events/users/{userId}` (только будущие незавершенные). PATCH валидирует только односторонний инвариант: `resultId != null` допустимо только при `status: COMPLETED`.

## Когда применяется

Триггеры:
- Iteration трогает paths `/api/v1/events/...` или вызывает сервис Календаря.
- Сервис нуждается в timeline storage, который не привязан к конкретному resource type.
- Существует customer-facing schedule facade (например, studio schedule), который оборачивает события Календаря.

## Как проверить

- Calendar event schema содержит только generic fields: `id`, `userId`, `dataId`, `startAt`, `endAt`, `status`, `resultId`. Никаких `contentType`, `contentId`, `externalResultId`, `resourceType` — это домен вызывающего.
- `dataId` не должен быть уникальным; сервис Календаря не проверяет повторное использование. Контроль повторного использования лежит на вызывающем.
- Пересечение временных диапазонов с другими событиями того же пользователя не возвращает `400`/`409`. `400` только для невалидного диапазона (`endAt <= startAt`), пустого массива, нарушения инварианта `status`/`resultId`.
- Точечный `DELETE /api/v1/events/{id}` не накладывает ограничений по `status` или `resultId`; "удалять только будущие незавершенные" — правило вызывающего сервиса, обеспечиваемое предварительным `GET /api/v1/events/{id}`.
- Массовый `DELETE /api/v1/events/users/{userId}` удаляет только будущие незавершенные события: `endAt > now`, `status != COMPLETED`, `resultId == null`.
- `PATCH /api/v1/events/{id}` валидирует только односторонний инвариант: `resultId != null` влечет `status == COMPLETED`. `status: COMPLETED` с `resultId: null` допустимо. Нарушение возвращает `400`.
- В точечных `GET`/`PATCH`/`DELETE` по id описание явно говорит: "сервис Календаря не проверяет ownership; вызывающий должен сверить `event.userId` через предварительный `GET`".
- Сервис Календаря не требует bearer token на 01_02 endpoint; security описывается через `description`, потому что endpoints вызываются внутренне другими сервисами.
- `POST /api/v1/events/bulk` атомарен: либо создаются все события, либо ни одно. Поддерживает и единичное создание (массив из одного элемента) — отдельный `POST /api/v1/events` не определяется.
- `POST /api/v1/events/arrange` остается отдельным методом для weekday-расстановки по `days` и `durationMinutes` от `startAt`.

## Severity и риск

HIGH: нарушение делает Календарь сервисом, привязанным к домену вызывающего, что блокирует переиспользование через все studio/lesson/program поверхности и заставляет каждый новый customer сервис форкать контракт. Также важно сохранять односторонний инвариант: двусторонний инвариант (`COMPLETED` <=> `resultId != null`) ломает кейс "завершено без результата" (см. 020 CHANGES, 2026-05-25, item про "уточнение инварианта status/resultId").

## Хороший пример

- `changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml:1-12` — info section явно объясняет generic-контракт и принадлежность `dataId`/`resultId` вызывающему.
- `changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml:166-242` — точечные GET/PATCH/DELETE явно говорят "сервис не сверяет ownership; вызывающий должен сделать предварительный GET".
- `changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml:294-330` — `CalendarEvent` schema содержит только generic fields; `dataId`/`resultId` описаны как принадлежащие вызывающему сервису.
- `changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml:411-417` — `CalendarEventStatus` enum только `PLANNED`/`COMPLETED`/`MISSED`; `CANCELLED` удален.
- `changes/020_resource_owned_content_studio/CHANGES.md:72-96` — финальное решение по инварианту `status`/`resultId` (односторонний), удалению ограничений на точечное удаление, удалению `CANCELLED`.

## Антипример

```yaml
# Calendar event хранит тип содержимого и mapping в integer
CalendarEvent:
  type: object
  required: [id, userId, contentType, contentId, startAt, endAt, status]
  properties:
    contentType:
      type: integer
      description: 1=exercise, 2=videoLesson, 3=lesson, 4=program
    contentId:
      type: integer
    externalResultId:
      type: integer
      nullable: true
```

Правка: заменить `contentType`/`contentId` на generic `dataId: integer` (принадлежит вызывающему), `externalResultId` на `resultId: integer | null`. Убрать integer-mapping типов — он принадлежит вызывающему сервису. Описать, что сервис Календаря не интерпретирует доменное значение `dataId` и не проверяет его уникальность.

## Связанные паттерны

- [[feature-shop-vs-studio]] — studio facade оборачивает события Календаря в `ScheduleItem` с домен-обогащением.
- [[feature-pagination-list-endpoints]] — список событий через `GET /api/v1/events/users/{userId}` возвращает стандартный paginated wrapper.
- [[feature-baseline-changes]] — переход с legacy `contentType`-based контракта на generic выполнен внутри 020 и зафиксирован в CHANGES; отдельная iteration 024 удалена.

## Заметки для ревьюера

- 020 включает большой блок CHANGES, описывающий, как контракт Календаря эволюционировал. При ревью новых сервисов поверх Календаря всегда читай эти CHANGES, чтобы не отдавать `contentType` или integer-mapping.
- `dataId` уникальность была когда-то частью legacy контракта 024. Активное решение в 020 — `dataId` не уникален; повторное использование разрешено. Если в новой постановке появляется проверка уникальности `dataId`, это regression.
- В studio post-filtering применяется поверх результатов Календаря; см. `[[feature-shop-vs-studio]]` и 020 CHANGES (2026-05-25, item про пагинацию).
