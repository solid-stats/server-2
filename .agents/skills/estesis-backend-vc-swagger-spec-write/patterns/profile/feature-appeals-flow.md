---
name: feature-appeals-flow
title: Контракт сервиса Appeals и outbox-driven sync
category: appeals
kind: feature
severity_when_violated: HIGH
applies_to:
  - постановки, описывающие appeals lifecycle (create, reopen, revoke, decision)
  - постановки, где другой сервис вызывает appeals синхронно перед сохранением draft data
related:
  - feature-drafts-flow
  - feature-permissions-endpoints
source:
  - empirical (changes/002_appeals_api, changes/015_teacher_profile_drafts, changes/018_music_label_appeal_drafts)
---

# Контракт сервиса Appeals и outbox-driven sync

## Правило

Сервис Appeals — owner appeal records и review статуса. Caller-сервис (mainBackend/musicLabels) генерирует appeal UUID на своей стороне и вызывает appeals синхронно: `POST /api/v1/appeal/create` для создания, `POST /api/v1/appeal/{id}/reopen` для resubmission rejected appeal, `POST /api/v1/appeal/{id}/revoke` для revoke. Создание appeal само по себе не требует outbox event — caller уже знает свой `appealId`. После accept/reject, appeals публикует outbox event, обрабатываемый vc-airflow, который вызывает `/api/v3/teacher-profile-appeals/sync` или соответствующий sync endpoint в caller сервисе. Reopen создает новый `PENDING` appeal с новым UUID и оставляет старый rejected appeal как историю. Caller сохраняет draft data и `appealId` pointer только после appeals confirms create/reopen. Revoke удаляет local draft только после appeals confirms revoke.

## Когда применяется

Триггеры:
- Iteration упоминает appeals (типы `BECOME_TEACHER`, `EDIT_TEACHER`, `CreateMusicLabel`, `UpdateMusicLabel`, `CreateMusicLabelLicense`, `EditMusicLabelLicense`).
- Endpoint пишет draft data, привязанный к appeal.
- Endpoint описывает resubmission rejected draft.
- В iteration есть outbox/sync контракт между appeals и caller-сервисом.

## Как проверить

- Appeal IDs — UUIDs (string, format: uuid), не integer. Caller генерирует UUID до вызова appeals. (См. `changes/015_teacher_profile_drafts/CONTEXT.md:35`.)
- Sync paths типа `/api/v1/appeal/create` и `/api/v1/appeal/{id}/reopen` имеют свои response shapes; в caller-постановке описывается, как caller вызывает эти методы и что делает с результатом.
- Reopen rejected appeal создает новый `PENDING` appeal с новым UUID; старый rejected appeal остается как история (не модифицируется).
- Decision outbox events публикуются после accept/reject. Создание appeal не требует outbox — caller уже знает `appealId`.
- vc-airflow обрабатывает appeals decision outbox tasks и вызывает caller sync endpoint. Этот sync endpoint должен быть закрыт от публичного swagger после реализации (см. 015 INDEX).
- Если sync appeals call падает, caller сохраняет предыдущее local state — не оставляет orphan draft без appeal pointer.
- Appeal status values: `PENDING`, `ACCEPTED`, `REJECTED`, `REVOKED_BY_AUTHOR` (или legacy lowercase `accepted/rejected/pending/withdraw` для старых iterations 002/005). В новых iterations используется UPPER_SNAKE_CASE.
- Для admin appeals UI: appeals service владеет appeal list, filtering, sorting, pagination; caller-сервисы добавляют batch reads "by-appeal" (см. `[[feature-drafts-flow]]`) и не дублируют appeal list.

## Severity и риск

HIGH: нарушение приводит к orphan drafts (draft без appeal или с pointer на withdrawn appeal), inconsistency между caller local state и appeals authority, либо к двойным creates, когда caller повторно вызывает appeals после network retry. Также критично, чтобы appeal UUID генерировался caller-ом и передавался идемпотентно; иначе retry создает дубли.

## Хороший пример

- `changes/002_appeals_api/01_appeals_api.yaml:1-95` — baseline appeals API: list method с filtering, response shape `data/limit/offset/total`.
- `changes/015_teacher_profile_drafts/CONTEXT.md:33-39` — фиксирует appeal UUIDs и source-side generation; reopen с новым UUID; revoke flow.
- `changes/015_teacher_profile_drafts/CONTEXT.md:52-60` — synchronous appeals integration: create/reopen/revoke от caller к appeals.
- `changes/015_teacher_profile_drafts/INDEX.md:38-45` — outbox events и sync contract; sync endpoint скрыт от публичного swagger.
- `changes/018_music_label_appeal_drafts/01_musicLabels_appeal_drafts.yaml:13-95` — admin batch reads "by-appeal" приходят отдельно: musicLabels отдает label/license data, не дублируя appeal list.

## Антипример

```yaml
# Caller сохраняет local draft до вызова appeals
post:
  operationId: createTeacherProfileDraft
  description: |
    1. Save draft data to local DB.
    2. Call appeals/create with appealId = uuid().
    3. Update draft.appealId pointer.
  responses:
    '200':
      description: Draft saved. Appeal will be created.
```

Правка:

1. Caller сначала генерирует UUID на своей стороне.
2. Caller синхронно вызывает `POST /api/v1/appeal/create` с этим UUID.
3. Только после confirms appeals create, caller сохраняет local draft data и appeal pointer.
4. Если appeals call падает, caller возвращает ошибку и не сохраняет draft.

Это убирает orphan draft риск и сохраняет appeals как authority над appeal records.

## Связанные паттерны

- [[feature-drafts-flow]] — drafts entity ссылается на `appealId` из appeals.
- [[feature-permissions-endpoints]] — admin appeals operations требуют `GET_ALL_APPEALS`/`RESOLVE_APPEAL`.

## Заметки для ревьюера

- 002 (baseline) и 015 (extension) описывают appeals lifecycle с разной степенью детализации. Активный baseline — 002 + 015 extensions; новые iterations поверх должны учитывать оба.
- Sync endpoint для caller-сервиса (`/api/v3/teacher-profile-appeals/sync`) описывается как internal contract и не должен экспонироваться в публичный swagger. Это важно для security review.
- Если в новой iteration появляется новый appeal type — он должен быть зарегистрирован в appeals `AppealType` enum (см. 002), и каждая outbox-обработка должна знать про этот тип.
- Withdrawn appeals (`REVOKED_BY_AUTHOR`) не считаются current drafts; admin by-appeal read возвращает их UUID в `missingAppealIds`, не в `data` (см. 018 CONTEXT).
