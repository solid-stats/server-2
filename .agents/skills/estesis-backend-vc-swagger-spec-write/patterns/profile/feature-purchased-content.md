---
name: feature-purchased-content
title: Прямая покупка и общий registry purchased-resources
category: ownership
kind: feature
severity_when_violated: HIGH
applies_to:
  - direct buy endpoints сервиса Ресурсов
  - per-type purchase history lists
  - studio endpoints, которые используют купленные копии
related:
  - feature-shop-vs-studio
  - feature-publish-lifecycle
  - feature-pagination-list-endpoints
source:
  - empirical (changes/019_resource_purchased_content, changes/020_resource_owned_content_studio, changes/022_resource_publish_lifecycle)
---

# Прямая покупка и общий registry purchased-resources

## Правило

Покупка ресурса — direct, через `POST /api/v1/shop/{resource}/{id}/buy`. Endpoint создает купленную копию, копирует требуемые S3-файлы и пишет одну запись в общую таблицу `purchasedResources`, ключ `(userId, resourceType, sourceId)`. Response — wrapper `{ purchase, resource }`, где `purchase` несет compact-метаданные (`id`, `purchasedAt`, `priceAtPurchase`), а `resource` — concrete short/list card именно для типа купленного ресурса. Repeated purchase того же source возвращает `409 Conflict`; updated-version purchase не поддерживается. История покупок выдается per-type методами: `GET /api/v1/library/purchased-{exercises|lessons|programs|video-lessons}`, каждый возвращает тот же `{purchase, resource}` wrapper и пагинацию.

## Когда применяется

Триггеры:
- Endpoint выполняет покупку или возвращает purchase history.
- Response содержит `purchase` объект и/или `resource` объект с purchased-copy id.
- Iteration описывает sourceId как historical source relation, который может указывать на удаленного предшественника.
- Studio iteration использует id купленных копий в путях расписания/результатов.

## Как проверить

- Direct buy paths следуют шаблону `POST /api/v1/shop/{resource}/{id}/buy` для всех supported resource types (exercise, lesson, program, video-lesson).
- Repeated buy того же source возвращает `409 Conflict`; не `200`, не `204`, не возвращает updated copy.
- `purchase` метаданные содержат только `id`, `purchasedAt`, `priceAtPurchase`. Никаких `resourceUpdatedAtAtPurchase`, `isFree`, `resourceType`, `resourceId` (см. 019 CHANGES).
- `resource` в response wrapper использует concrete short/list card именно для endpoint resource type, не cross-type `oneOf`/union.
- `sourceId` (или `resourceSourceId` в 020) указывает на исторический source marketplace id, может ссылаться на удаленную предшествующую source row после publish lifecycle (см. `[[feature-publish-lifecycle]]`); hydration не должен требовать active source row.
- Per-type purchase history endpoints используют `search` только по `name`/`title` ресурса, не по author profile fields.
- `priceAtPurchase` — scalar в той же business unit, что и source `price`. Не объект `{ amount, currency }`.
- `500` для S3 copy errors не используется — используется `502 Bad Gateway` с описанием, что service должен rollback database changes и best-effort удалить уже скопированные файлы.
- Free resources требуют zero-price purchase/access record перед тем, как они появятся в purchased history или allow review creation.
- Studio endpoints (020) используют `resourceId` купленной копии в путях, а не source id; resolve тип через purchase record, не передавай `resourceType` в payload.

## Severity и риск

HIGH: нарушение приводит к одной из этих ошибок: продажа дубликата того же ресурса одному пользователю; orphan покупки без записи в common table; неверное hydration purchased copy после publish-lifecycle hard-delete source; смешение source id и copy id в payload, что ломает studio scheduling.

## Хороший пример

- `changes/019_resource_purchased_content/INDEX.md:38-56` — фиксирует direct buy + common table + per-type history + 409 для repeated buy.
- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml:203-401` — все четыре direct buy endpoints одинаковой формы: `200` wrapper `{purchase, resource}`, `409` для repeated buy, `502` для S3 failure с rollback.
- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml:510-538` — `PurchasedResourceRecord` storage shape: ключ `(userId, resourceType, sourceId)`, без `resourceId`.
- `changes/019_resource_purchased_content/CHANGES.md:60-71` — CHANGES жестко фиксирует наследование `sourceId` (historical relation) и hydration независимо от source row.
- `changes/020_resource_owned_content_studio/CONTEXT.md:31-35` — studio использует id купленной копии, `resourceSourceId` для связи с маркетплейсом.

## Антипример

```yaml
# Repeated buy возвращает 200 с обновленной copy
post:
  operationId: buyExercise
  responses:
    '200':
      description: Покупка совершена или копия обновлена до текущей версии source.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/PurchasedExerciseHistoryItem'
```

Правка: добавить отдельную ветку `409 Conflict` с описанием "уже куплен; service must not create another purchase record, purchased copy, or S3 copy". Update-purchase удалить из контракта — purchased copies неизменяемы относительно source updates. Если нужно купить новую версию, это требует, чтобы source был unpublished/recreate (см. `[[feature-publish-lifecycle]]`) — новый source получает новый id и может быть куплен независимо.

## Связанные паттерны

- [[feature-publish-lifecycle]] — purchased copy `sourceId` может указывать на удаленный source; copies остаются hydrateable.
- [[feature-shop-vs-studio]] — direct buy живет в `shop`, history — в `library`, использование — в `studio`.
- [[feature-pagination-list-endpoints]] — purchase history endpoints соблюдают стандартный shape `data/limit/offset/total`.

## Заметки для ревьюера

- 019 несколько раз меняло форму response (single list → per-type → common card → per-type снова). Активным остается per-type методы с `purchase + resource` wrapper. Если кто-то предлагает union list — это backward step, ссылайся на 019 CHANGES.
- В studio iteration 020 поле связи переименовано c `sourceId` на `resourceSourceId`, см. 020 CHANGES (2026-05-21). 019 продолжает использовать `sourceId` в карточках; они синонимы и применяются в разных контекстах.
- Не нужно объявлять `isFree` flag отдельно — это вычисляется из `priceAtPurchase == 0`.
