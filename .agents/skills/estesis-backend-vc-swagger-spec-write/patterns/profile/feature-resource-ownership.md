---
name: feature-resource-ownership
title: Owner vs admin permission check, ownership errors
category: ownership
kind: feature
severity_when_violated: HIGH
applies_to:
  - protected resource endpoints (создание/редактирование/удаление/публикация ресурсов сервиса Ресурсов)
  - endpoints, фильтрующие по чужому объекту через id-фильтр
related:
  - feature-permissions-endpoints
  - feature-publish-lifecycle
  - feature-shop-vs-studio
source:
  - empirical (changes/014_exercises_resources, changes/016_lessons_resources, changes/017_programs_resources, changes/020_resource_owned_content_studio)
---

# Owner vs admin permission check, ownership errors

## Правило

Resource mutations описывают `403` как переключатель между двумя permission-вызовами в зависимости от того, является ли текущий пользователь автором: для автора — `UPDATE_MY_RESOURCES` или `UPDATE_ALL_RESOURCES` с `requireAll: false`; для не-автора — `UPDATE_ALL_RESOURCES` с `requireAll: true` (аналогично для DELETE). Само сервис Ресурсов не делает прямой role check, а только вызывает `/api/v3/permissions/check`. Для read/list endpoints, фильтрующих по чужому/недоступному объекту через id-фильтр (`resourceId`, `scheduleItemId`, `visibleActiveProgramIds`), возвращай `403` если объект существует, но не принадлежит/недоступен текущему пользователю, и `404` если объект не найден.

## Когда применяется

Триггеры:
- Endpoint в сервисе Ресурсов выполняет mutation над author-owned resource (`POST/PATCH/DELETE` на `/api/v1/exercises|lessons|programs|video-lessons/{id}` и nested).
- Endpoint принимает id-фильтр, который может указывать на чужой ресурс (`resourceId`, `scheduleItemId`, `programId`, `visibleActiveProgramIds`).
- Endpoint в `mainBackend` или `musicLabels` проверяет permissions для admin-only поверхности (`GET_ALL_APPEALS`, `RESOLVE_APPEAL`).

## Как проверить

- В `403`-описании mutation endpoint должно быть две ветки: автор и не-автор, со своими payloads `/api/v3/permissions/check`. Не описывай в постановке прямой role check (`if user.role == teacher` и т.п.).
- Permission codes используют snake-case-upper, что соответствует существующему контракту permissions service (`UPDATE_MY_RESOURCES`, `UPDATE_ALL_RESOURCES`, `DELETE_MY_RESOURCES`, `DELETE_ALL_RESOURCES`, `CREATE_RESOURCE`).
- Для read/list с id-фильтром явно описаны `403` и `404` (см. `changes/020_resource_owned_content_studio/CONTEXT.md` правило про ownership errors).
- Для `403` ownership-доступа фраза должна явно говорить: "объект существует, но не принадлежит/недоступен текущему пользователю".
- Для draft endpoints, где draft принадлежит автору, `403` "draft belongs to another user" не должен вызывать `permissions/check` — это уже сделанная local-ownership проверка.
- Endpoints, требующие `GET_ALL_APPEALS`, описывают payload `{ "permissions": ["GET_ALL_APPEALS"], "requireAll": true }` (см. `changes/018_music_label_appeal_drafts`).
- Endpoints типа publication, document add/delete используют те же двух-веточные permission checks, что и main edit/delete.

## Severity и риск

HIGH: нарушение приводит либо к утечке чужих ресурсов через слишком слабый `permissions/check`, либо к ложным `403` для admin с правом `UPDATE_ALL_RESOURCES`, либо к тому, что разработчик хардкодит role checks и пропускает RBAC. Также влияет на consistency: разные iterations должны единообразно вызывать `/api/v3/permissions/check` вместо локальных role checks.

## Хороший пример

- `changes/014_exercises_resources/01_resources_exercises_create_delete.yaml:67-74` — `editExerciseDraft` описывает `403` с двух-веточным permission payload (author vs not-author).
- `changes/014_exercises_resources/01_resources_exercises_create_delete.yaml:248-258` — `deleteExercise` с тем же двух-веточным шаблоном для DELETE permissions.
- `changes/020_resource_owned_content_studio/CONTEXT.md:55` — фиксирует общее правило: ошибки владения используют `403`, отсутствие — `404`.
- `changes/018_music_label_appeal_drafts/01_musicLabels_appeal_drafts.yaml:48-54` — `403` для admin-only by-appeal read с явным payload `GET_ALL_APPEALS`/`requireAll: true`.
- `changes/020_resource_owned_content_studio/CHANGES.md:214-220` — фиксирует ownership errors для id-фильтров: `403` если чужой, `404` если не найден.

## Антипример

```yaml
delete:
  operationId: deleteExercise
  responses:
    '403':
      description: Только автор или admin может удалить exercise.
```

Правка: явно описать оба permission checks. Например:

```yaml
'403':
  description: |
    Returned when the selected permission check below returns false.

    - If the current user is the exercise author, call `/api/v3/permissions/check` with `{ "permissions": ["DELETE_MY_RESOURCES", "DELETE_ALL_RESOURCES"], "requireAll": false }`.
    - If the current user is not the exercise author, call `/api/v3/permissions/check` with `{ "permissions": ["DELETE_ALL_RESOURCES"], "requireAll": true }`.
```

## Связанные паттерны

- [[feature-permissions-endpoints]] — общий контракт `/api/v3/permissions/check` определяется в 003 и используется здесь как dependency.
- [[feature-publish-lifecycle]] — guard endpoints используют те же двух-веточные permission checks плюс `409 PublishedResourceLocked`.
- [[feature-shop-vs-studio]] — studio endpoints читают current user через bearer token и применяют ownership ошибки `403`/`404`.

## Заметки для ревьюера

- Для resource list/library endpoints `permissions/check` обычно НЕ вызывается — доступ описан через "library relation"/"current user owns it" в `200` description. См. `changes/014_exercises_resources/02_01_resources_exercises_shop_library.yaml:124`.
- Shop list endpoints публичные и часто работают без bearer token; см. `feature-shop-vs-studio` для опционального tokenа.
- Если повторяющаяся пара "author / not-author" встречается часто, в YAML стандартно описывается inline в `403.description`. Не выноси `403.description` в shared response — это снижает читаемость, потому что код permission меняется per endpoint.
