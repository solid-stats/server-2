---
name: feature-pagination-list-endpoints
title: 'Cross-cutting: пагинированные list endpoints'
category: pagination
kind: feature
severity_when_violated: MEDIUM
applies_to:
  - любой GET endpoint, возвращающий список элементов
related:
  - feature-shop-vs-studio
  - feature-purchased-content
source:
  - backend-vc-swagger-spec-write/references/core-conventions.md (pagination, sorting, optional query parameters)
  - empirical (changes/014_exercises_resources, changes/019_resource_purchased_content, changes/020_resource_owned_content_studio, changes/005_music_labels_api)
---

# Cross-cutting: пагинированные list endpoints

## Правило

Любой list endpoint возвращает объект с обязательными полями `data` (массив), `limit`, `offset`, `total`. Не используй `page`/`pageSize`, не возвращай голый массив, не оборачивай в другой wrapper. Пагинация делается через query-параметры `limit` и `offset` (стандартные `$ref: '#/components/parameters/Limit'` и `Offset`). Сортировка делается через query-параметры `sortBy` (string enum) и `sortDir` (`asc`/`desc`). Свободный поиск делается через `search`, если только не нужен поиск по конкретному полю. Фильтры-списки имеют `default: []` и описание "пустой список означает все элементы, фильтр не применяется".

## Когда применяется

Триггеры:
- Endpoint — GET, возвращает несколько элементов.
- Endpoint имеет query-параметры пагинации.
- Endpoint возвращает массив записей с фильтрами/сортировкой.

## Как проверить

- Response schema: `type: object`, `required: [data, limit, offset, total]`, `data: array`, `limit/offset/total: integer`. См. `changes/019_resource_purchased_content/01_resources_purchased_content.yaml:434-451` для образца.
- Параметры пагинации: `limit` (integer, default обычно `20`), `offset` (integer, default `0`). По проекту нет `page`/`pageSize`.
- `sortBy` — string enum через `allOf` wrapper для `default` (см. core conventions (`backend-vc-swagger-spec-write/references/core-conventions.md`) правила для query enum schemas с `default`).
- `sortDir` — `asc`/`desc` через `allOf` wrapper с `default`.
- Фильтры-списки: `type: array`, `default: []`, `items: $ref ...`, описание "пустой список означает все элементы, фильтр не применяется".
- Свободный поиск называется `search`. Если ищем по конкретному полю — назови параметр по полю (`name`, `email` и т.п.).
- Если параметр опциональный non-list и бизнес-дефолт отсутствует, используй `anyOf` с `null` и `default: null` (см. core conventions (`backend-vc-swagger-spec-write/references/core-conventions.md`)).
- Для пагинированных wrappers cross-domain: `GetPurchasedExercisesResponse`, `GetCalendarEventsResponse`, `GetMusicLabelsResponse` — все имеют одну форму.
- Defaultный `limit` обычно `20`; некоторые специальные методы используют другие defaults (например, 019 stage purchase history = 50, потом 020 result list тоже был 50, но затем понижен до 20 — см. 020 CHANGES 2026-05-21 "Default limit 20"). При ревью смотри iteration CHANGES, чтобы понять текущий activе default.

## Severity и риск

MEDIUM: нарушение формы wrapper или замена `limit/offset` на `page/pageSize` ломает универсальные клиентские helpers и приводит к дублированию пагинирующего кода для каждого нового endpoint. Также `total` критически нужен для UI pagination controls; голый массив или wrapper без `total` блокирует страничную навигацию.

## Хороший пример

- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml:434-509` — все четыре purchase history responses одинаковой формы.
- `changes/020_resource_owned_content_studio/01_02_calendar_studio_schedule_events.yaml:275-293` — `GetCalendarEventsResponse` той же формы.
- `changes/014_exercises_resources/02_01_resources_exercises_shop_library.yaml:84-115` — типичный набор query параметров: `search`, фильтры-списки с `default: []`, `sortBy`/`sortDir` через `allOf` wrapper, `Limit`/`Offset` через `$ref`.
- `changes/005_music_labels_api/01_musicLabels_labels.yaml:185-205` — даже baseline 005 уже использует `{data, limit, offset, total}`.

## Антипример

```yaml
# page/pageSize и голый массив data
GetExercisesResponse:
  type: object
  required: [items, page, pageSize, totalCount]
  properties:
    items:
      type: array
      items: { $ref: '#/components/schemas/ShortExercise' }
    page: { type: integer }
    pageSize: { type: integer }
    totalCount: { type: integer }
```

Правка: переименовать в `data/limit/offset/total`; параметры пагинации — `limit`/`offset`, не `page`/`pageSize`. Это согласуется с core conventions (`backend-vc-swagger-spec-write/references/core-conventions.md`) и всеми iterations.

## Связанные паттерны

- [[feature-shop-vs-studio]] — shop/library/studio все возвращают пагинированные списки одной формы.
- [[feature-purchased-content]] — purchase history per-type endpoints используют точно ту же форму.

## Заметки для ревьюера

- В 020 для studio schedule сделана отдельная декларация, что `total` отражает количество элементов после всех post-фильтров до применения `limit`/`offset` (см. CHANGES 2026-05-25 про пагинацию). Когда post-фильтрация применяется на стороне вызывающего сервиса поверх данных Календаря, `total` все равно описывает результат поверх Календаря, не raw count событий.
- Для query-параметров с `default` enum необходим `allOf` wrapper вокруг `$ref` (а не sibling `default` рядом с `$ref`); иначе Swagger выдает "Property $ref is not allowed". См. core conventions (`backend-vc-swagger-spec-write/references/core-conventions.md`) и `[[response-status-200-vs-201]]`-стиль patterns.
- Особый случай: `visibleActiveProgramIds` в `GET /api/v1/studio/schedule/items` имеет обратную семантику — пустой список означает "программные элементы не возвращаются", не "все включены". Это интенсиональное отступление, зафиксированное в 020 CHANGES; при ревью не блокируй за нарушение общего правила, если есть явная запись в CHANGES.
