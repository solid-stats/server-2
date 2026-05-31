---
name: security-permission-driven-endpoints
title: Permission-driven endpoints — указание `/api/v3/permissions/check` payload в `403`
category: security
kind: category
severity_when_violated: HIGH
applies_to:
  - сервисы `resources`, `musicLabels`, любые сервисы, делегирующие проверки прав в mainBackend
  - mutation endpoints с разграничением "автор" vs "все ресурсы"
  - admin endpoints с правами на чтение всех записей
related:
  - security-bearer-required-declaration
  - auth-ownership-based-access
  - security-no-direct-role-checks
source:
  - references/estesis-profile.md (authorization model)
  - empirical (changes/003_permissions_api, changes/014_*, changes/016_*, changes/017_*, changes/018_*)
---

# Permission-driven endpoints — указание `/api/v3/permissions/check` payload в `403`

## Правило

Если эндпоинт защищен permission-моделью mainBackend, в описании ответа `403` явно указывай точный payload для `/api/v3/permissions/check`: список `permissions` и значение `requireAll`. Если правило различается для автора и не-автора, опиши обе ветки буллетами. Permission codes пиши в SCREAMING_SNAKE_CASE как в `003_permissions_api`.

Не вынося это описание в общий описанию метода или файла, а описывай его в конкретном статусе `403`.

## Когда применяется

- Сервис не `mainBackend`, но защита идет через mainBackend permissions (`resources`, `musicLabels`).
- В CONTEXT.md итерации есть `## Roles` и фраза вроде "must not implement direct role checks" / "Protected endpoints define required permission checks in their own method descriptions".
- В operation описан 403, и за ним стоит ролевой запрет, а не отсутствие связи (например, не "user is not the author" сам по себе).

## Как проверить

- Открыть описание `403` ответа.
- Проверить, что описание содержит подстроку `/api/v3/permissions/check` и явный inline JSON payload: `{ "permissions": [...], "requireAll": true|false }`.
- Если разграничение зависит от роли (автор vs не-автор), убедиться, что обе ветки описаны буллетами:
  - "If the current user is the {resource} author, call `/api/v3/permissions/check` with `{...}`."
  - "If the current user is not the {resource} author, call `/api/v3/permissions/check` with `{...}`."
- Permission codes (`CREATE_RESOURCE`, `UPDATE_MY_RESOURCES`, `UPDATE_ALL_RESOURCES`, `DELETE_MY_RESOURCES`, `DELETE_ALL_RESOURCES`, `READ_ALL_RESOURCES`, `GET_ALL_APPEALS`, `RESOLVE_APPEAL` и др.) идут SCREAMING_SNAKE_CASE.
- Если description `403` говорит "current user is not the author" без ссылки на permissions/check — это, скорее всего, не permission-driven, а ownership-based; смотри [[auth-ownership-based-access]].

## Severity и риск

HIGH: контракт между сервисом ресурсов и mainBackend описан только в OpenAPI постановке. Без явного payload разработчику непонятно, какие permissions вызывать и с каким `requireAll`. Любая неточность приводит к over-permissive или over-restrictive поведению в продакшене.

## Хороший пример

- `changes/016_lessons_resources/01_resources_lessons_create_delete.yaml:53-60` — единственная permission ветка `CREATE_RESOURCE`.
- `changes/016_lessons_resources/01_resources_lessons_create_delete.yaml:106-111` — две ветки: автор использует `requireAll: false` с `UPDATE_MY_RESOURCES`/`UPDATE_ALL_RESOURCES`, не-автор — `requireAll: true` с `UPDATE_ALL_RESOURCES`.
- `changes/014_exercises_resources/03_resources_exercises_admin.yaml:82-86` — admin endpoint с одиночным `READ_ALL_RESOURCES`.
- `changes/018_music_label_appeal_drafts/01_musicLabels_appeal_drafts.yaml:49-53` — `GET_ALL_APPEALS` для admin batch reads.

## Антипример

```yaml
/api/v1/lessons/{id}:
  patch:
    summary: Update lesson
    security:
      - bearerAuth: []
    responses:
      '403':
        description: Forbidden.   # <- нет permission payload
```

Правка:

```yaml
'403':
  description: |
    Returned when the selected permission check below returns false.

    - If the current user is the lesson author, call `/api/v3/permissions/check` with `{ "permissions": ["UPDATE_MY_RESOURCES", "UPDATE_ALL_RESOURCES"], "requireAll": false }`.
    - If the current user is not the lesson author, call `/api/v3/permissions/check` with `{ "permissions": ["UPDATE_ALL_RESOURCES"], "requireAll": true }`.
```

## Связанные паттерны

- [[security-bearer-required-declaration]] — permission-driven endpoint всегда сначала аутентифицируется (bearer required).
- [[auth-ownership-based-access]] — некоторые `403` не permission-driven, а основаны исключительно на ownership/purchase данных.
- [[security-no-direct-role-checks]] — почему именно permissions/check, а не direct role checks.
- [[errors-401-vs-403]] — корректный выбор статуса при отсутствии токена vs отсутствии прав.

## Заметки для ревьюера

- Если CONTEXT.md итерации говорит "Role information is context only. The {service} must not implement direct role checks", это сильный сигнал, что все 403 должны быть permission-driven.
- Permission enum значения берутся из `registry/services/mainBackend/SWAGGER.md` или из `003_permissions_api`. В новых итерациях `003_permissions_api` обычно не указывается как Depends On — permissions считаются deployed контрактом.
- Embedded resource access checks (например, "embedded exercise is in current user's library") — это не permissions/check, а отдельный access check; см. [[auth-ownership-based-access]].
