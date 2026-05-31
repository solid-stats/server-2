---
name: feature-shop-vs-studio
title: Магазин (shop), библиотека (library) и студия (studio) — три отдельные поверхности
category: ownership
kind: feature
severity_when_violated: MEDIUM
applies_to:
  - resource service endpoints, отдающие списки/детали ресурсов
  - studio endpoints, работающие с купленными копиями
related:
  - feature-resource-ownership
  - feature-purchased-content
  - feature-publish-lifecycle
source:
  - empirical (changes/014_exercises_resources, changes/016_lessons_resources, changes/017_programs_resources, changes/019_resource_purchased_content, changes/020_resource_owned_content_studio)
---

# Магазин (shop), библиотека (library) и студия (studio) — три отдельные поверхности

## Правило

Контракт сервиса Ресурсов содержит три независимых поверхности с отдельными paths, отдельными ответами и отдельной семантикой:

- `/api/v1/shop/{resource}` — публичная витрина source-ресурсов; ответы возвращают только published source, `isPurchased` опционально через optional bearer token; не требует обязательной авторизации.
- `/api/v1/library/{resource}` и `/api/v1/library/purchased-{resource}` — приватная библиотека текущего пользователя; покрывает source-ресурсы, доступные пользователю (created или purchased), и историю покупок копий.
- `/api/v1/studio/...` — приватные studio-поверхности, работающие с купленными копиями (results, schedule, programs); используют id купленных копий, а не source id.

Не сваливай одну поверхность в другую. Не используй один endpoint, чтобы отдать одновременно shop и library cards с разной семантикой `id`.

## Когда применяется

Триггеры:
- Iteration трогает магазин, библиотеку или студию resource service.
- Endpoint path содержит `shop`, `library`, `studio` сегмент.
- Response содержит `isPublished`, `isPurchased`, `sourceId`, `resourceSourceId` или `purchasedAt`.

## Как проверить

- Public shop endpoints не имеют обязательного `security: bearerAuth`, потому что optional token поведение описывается через `description`, а не через `security: [{}]`. См. core conventions (`backend-vc-swagger-spec-write/references/core-conventions.md`) и `[[security-do-not-add-security-clause-for-optional-auth]]`.
- Shop card id = source id; library purchased card id = id купленной копии, plus `sourceId`/`resourceSourceId` указывает на historical source.
- Studio endpoints используют id купленной копии в путях/payload (`resourceId`, `scheduleItemId`). Не путать с source id магазина.
- Каждая поверхность имеет свой tag в OpenAPI: `Shop`, `Library`, `Purchases`, `Studio Results`, `Studio Schedule`, `Studio Programs`. Не дублируй endpoint в нескольких tags — выбирай по поверхности.
- В studio endpoints клиент не передает `resourceType` в теле запроса — тип резолвится сервисом Ресурсов через purchase record по `resourceId`. См. `changes/020_resource_owned_content_studio/CONTEXT.md:42`.
- `isPurchased` — read field, который вычисляется из common purchased-resources таблицы (см. 019). Anonymous shop response сетит `isPurchased = false`.
- Library auth должен быть обязательным (`security: bearerAuth`), shop — optional через description.

## Severity и риск

MEDIUM: смешение поверхностей не ломает API напрямую, но создает путаницу между source id и copy id, между опубликованным и купленным, между публичной и приватной выдачей. Это распространенный источник багов в клиенте, когда studio пытается вызывать buy по copy id или library начинает отдавать unpublished чужие ресурсы. Также влияет на observability — разные tags нужны для swagger UI.

## Хороший пример

- `changes/014_exercises_resources/02_01_resources_exercises_shop_library.yaml:14-19` — отдельные tags `Library` и `Shop` для одной iteration.
- `changes/014_exercises_resources/02_01_resources_exercises_shop_library.yaml:163-200` — shop list работает без обязательной авторизации; `includePurchased` берет current user из optional token.
- `changes/019_resource_purchased_content/01_resources_purchased_content.yaml:15-201` — `/library/purchased-{resource}` endpoints все требуют bearer, search ограничен `name/title` ресурса, не author.
- `changes/020_resource_owned_content_studio/CONTEXT.md:42` — studio schedule использует `resourceId` купленной копии без `resourceType` в payload; тип резолвится через purchase record.
- `changes/019_resource_purchased_content/CHANGES.md:1-21` — narrowing `search` в `purchased-*` до resource name документировано отдельно.

## Антипример

```yaml
# Studio endpoint требует от клиента передавать resourceType
/api/v1/studio/schedule/items:
  post:
    requestBody:
      content:
        application/json:
          schema:
            type: object
            required: [resourceType, resourceId, startAt, endAt]
            properties:
              resourceType:
                $ref: '#/components/schemas/ResourceType'
              resourceId:
                type: integer
```

Правка: убрать `resourceType` из тела запроса. Резолвить тип на бекенде через purchase record по `resourceId`. Если тип не поддерживается на этом этапе (например, только `lesson`), вернуть `400` с описанием причины. Это убирает дублирование данных между клиентом и сервером и согласуется с решением 020.

## Связанные паттерны

- [[feature-purchased-content]] — studio работает с купленными копиями, выдаваемыми history endpoints из 019.
- [[feature-resource-ownership]] — все три поверхности используют общие правила `permissions/check` и ownership ошибок.
- [[security-do-not-add-security-clause-for-optional-auth]] — shop optional token описан в `description`, а не через `security: [{}]`.

## Заметки для ревьюера

- В legacy iterations (006 video lessons) shop response уже отделен от library response через имена схем `ShopVideoLesson`/`LibraryVideoLesson`. Новые iterations должны следовать тому же naming.
- Search в shop может работать по author name (исторически), а в library `/purchased-*` — только по resource name/title. Это умышленный contract drift, зафиксированный в 019 CHANGES.
- Studio endpoints — это не альтернатива library; они дополняют library и работают поверх купленных копий. Не пиши studio endpoint, который дублирует library list по source id.
