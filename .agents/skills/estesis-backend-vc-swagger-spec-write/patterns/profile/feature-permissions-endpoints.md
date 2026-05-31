---
name: feature-permissions-endpoints
title: Permission check через mainBackend `/api/v3/permissions/check`
category: permissions
kind: feature
severity_when_violated: HIGH
applies_to:
  - protected endpoints во всех сервисах, кроме самого mainBackend permissions service
  - admin-only endpoints, требующие cross-service permission
related:
  - feature-resource-ownership
  - feature-drafts-flow
source:
  - empirical (changes/003_permissions_api, changes/014_exercises_resources, changes/018_music_label_appeal_drafts)
---

# Permission check через mainBackend `/api/v3/permissions/check`

## Правило

Все сервисы, нуждающиеся в RBAC, вызывают `POST /api/v3/permissions/check` сервиса mainBackend с payload `{ permissions: ["CODE_1", ...], requireAll: true|false }`. Endpoint возвращает `true`/`false`. Сами сервисы не должны хардкодить role checks. Permission codes используют UPPER_SNAKE_CASE и описываются в `Permission` enum mainBackend. В постановках другого сервиса упоминай конкретный payload, который backend должен отправить — это часть контракта для разработчика, не throwaway деталь.

## Когда применяется

Триггеры:
- Iteration описывает endpoint, который требует cross-service permission check.
- Endpoint выполняет mutation от имени пользователя, и right ownership/role check важен.
- Admin-only endpoint (например, `GET_ALL_APPEALS`, `RESOLVE_APPEAL`).

## Как проверить

- Permission code в payload в UPPER_SNAKE_CASE: `CREATE_RESOURCE`, `UPDATE_MY_RESOURCES`, `UPDATE_ALL_RESOURCES`, `DELETE_MY_RESOURCES`, `DELETE_ALL_RESOURCES`, `GET_ALL_APPEALS`, `RESOLVE_APPEAL`.
- Payload должен включать `requireAll`. Для ownership двух-веточного check (см. `[[feature-resource-ownership]]`): для автора `requireAll: false` (любая permission достаточна), для не-автора `requireAll: true`.
- `403` description явно цитирует payload, не "проверь permissions". Бэкенд-разработчик копирует payload из постановки в код.
- Сервис mainBackend сам публикует контракт permissions check (см. 003).
- Не возвращай `200 boolean` где-то еще; этот формат уникален для permissions/check и обусловлен исторически (см. `changes/003_permissions_api/01_mainBackend_permissions.yaml:36-46`).
- Permissions cannot be enforced through optional bearer token — `permissions/check` всегда требует `security: bearerAuth` (см. 003).

## Severity и риск

HIGH: нарушение приводит либо к hardcoded role checks (если кто-то решил, что проще проверять `user.role == teacher`), либо к утечке прав, когда admin теряет доступ к чужим ресурсам через слишком жесткий check, либо к unauthorized доступу для not-author с `UPDATE_ALL_RESOURCES`. Permission codes — public API между сервисами; путаница в кодах ломает все vending.

## Хороший пример

- `changes/003_permissions_api/01_mainBackend_permissions.yaml` — baseline contract `/api/v3/permissions/check` с `Permission` enum, `requireAll` параметром и `200 boolean` response.
- `changes/014_exercises_resources/01_resources_exercises_create_delete.yaml:34-38` — `403` явно описывает payload `{ "permissions": ["CREATE_RESOURCE"], "requireAll": true }`.
- `changes/014_exercises_resources/01_resources_exercises_create_delete.yaml:67-74` — двух-веточный `403` для author vs not-author с конкретными payloads.
- `changes/018_music_label_appeal_drafts/01_musicLabels_appeal_drafts.yaml:48-54` — admin only check `{ "permissions": ["GET_ALL_APPEALS"], "requireAll": true }`.

## Антипример

```yaml
delete:
  operationId: deleteExercise
  responses:
    '403':
      description: User does not have permission to delete this resource. The service checks user role and ownership directly.
```

Правка: заменить общее "checks user role directly" на конкретный двух-веточный permission payload через `/api/v3/permissions/check` (см. `[[feature-resource-ownership]]` для образца). Backend-разработчик должен видеть в постановке точные codes и `requireAll` значение.

## Связанные паттерны

- [[feature-resource-ownership]] — два-веточный check для author/not-author встречается во всех ресурсных mutations.
- [[feature-drafts-flow]] — admin draft reads требуют `GET_ALL_APPEALS`; appeals review требует `RESOLVE_APPEAL`.

## Заметки для ревьюера

- Permission codes — это enum в mainBackend; новые codes требуют расширения 003 contract. Не выдумывай новые коды на лету в feature iteration; запрашивай добавление в 003.
- `requireAll: true` (default) означает all permissions; `false` — любая из listed. Это особенно важно для двух-веточного check, где `requireAll: false` дает "any of MY/ALL".
- Если endpoint опционально учитывает bearer token (см. shop reads), permission check не делается — поведение описывается только через `description` и default values для current-user полей.
- 003 stage YAML использует OpenAPI 3.0.3 и `nullable: false` — это исторический baseline и не нарушение. Новые iterations используют 3.1.0.
