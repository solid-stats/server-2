---
name: feature-music-labels
title: 'Music labels: baseline + licensing + display drafts'
category: music-labels
kind: feature
severity_when_violated: HIGH
applies_to:
  - постановки сервиса musicLabels
  - постановки songs, читающие label licensing
related:
  - feature-drafts-flow
  - feature-appeals-flow
  - feature-shop-vs-studio
source:
  - empirical (changes/005_music_labels_api, changes/013_label_public_songs, changes/018_music_label_appeal_drafts, changes/023_music_label_display_drafts)
---

# Music labels: baseline + licensing + display drafts

## Правило

Сервис musicLabels имеет накопительную форму контракта:

- **Baseline (005)** — `/api/v1/music-labels` CRUD: создание, список, получение, обновление, access check. Returns `MusicLabel` объект с `name`, `phoneNumber`, `email`, `inn`, `ownerId`, `id`, `lastAppeal`, `isApproved`. Запись label через update — это submit для модерации.
- **License rules (013)** — moderated лицензии (`CreateMusicLabelLicense`, `EditMusicLabelLicense`) с draft-based lifecycle, `LicenseActualResponse`/`LicenseDraftResponse` альтернативами, licence type enum (`lyricsAuthor`, `arrangementAuthor`, `lyricsReproduction`, `arrangementReproduction`).
- **Public songs (013)** — songs upload и license edit с typed license selection; song public visibility = accepted license coverage всех нужных типов.
- **Admin by-appeal (018)** — `/api/v1/admin/music-labels/by-appeal` и `/api/v1/admin/music-labels/licenses/by-appeal`: batch reads, keyed by appeal UUID, плюс `missingAppealIds`. Требуют `GET_ALL_APPEALS`.
- **Owner display drafts (023)** — owner-facing read: `MusicLabelActual`/`MusicLabelDraft` альтернативы; `GET /api/v1/music-labels/{labelId}/draft` для draft view; create drafts без accepted state читаются только через `/draft` route, используя локальный draft `id` как route id.

Деплоенные имена полей сохраняются (`phoneNumber`, `ownerId`, `isApproved`); top-level draft метаданные вместо inline `lastAppeal.data` для draft state.

## Когда применяется

Триггеры:
- Iteration трогает musicLabels endpoints (`/api/v1/music-labels/...` или `/api/v1/admin/music-labels/...`).
- Iteration описывает label license lifecycle.
- Iteration трогает song upload, который требует label licensing.

## Как проверить

- Baseline label CRUD соответствует 005 paths (`/api/v1/music-labels`, `/api/v1/music-labels/{labelId}`, `/api/v1/music-labels/{labelId}/access`).
- Label response uses field names `phoneNumber`, `email`, `inn`, `ownerId`, `id`, `lastAppeal`, `isApproved` (см. deployed swagger).
- License lifecycle uses Actual/Draft alternatives; license appeal статус — `pending`/`rejected` (с lowercase в legacy 013/018, см. там для конкретики). Accepted state открывает license actual.
- Public song visibility основано на accepted license coverage; songs service использует accepted actual license state.
- Admin by-appeal endpoints возвращают `data` объект keyed by appeal UUID, плюс `missingAppealIds`. См. `[[feature-drafts-flow]]`.
- Owner display use Actual/Draft альтернативы; create draft без accepted state читается через `/draft` route, локальный draft `id` используется как route id.
- Draft метаданные top-level: `id` (локальный draft row id), `appealId`, `type`, `status`. Не inline в `lastAppeal`.
- Soft-deleted accepted labels исключены из owner reads.
- Current drafts = pending или rejected create/update label appeals. Accepted и withdrawn appeals не считаются current drafts.
- Rejection comments живут в appeals service; musicLabels не возвращает их в owner reads — клиент берет comment по `appealId` из appeals.

## Severity и риск

HIGH: confusion между accepted и draft label data приводит к leaking непрошедшей модерацию информации в public song feeds. Использование integer license appeal id вместо UUID (или наоборот) ломает sync. Inline draft в `lastAppeal.data` нарушает Liskov между owner и public reads.

## Хороший пример

- `changes/005_music_labels_api/01_musicLabels_labels.yaml:1-200` — baseline label CRUD (3.0.3 OpenAPI; не переписывать ради версии).
- `changes/013_label_public_songs/INDEX.md:32-45` — описание license rules и song upload visibility.
- `changes/018_music_label_appeal_drafts/01_musicLabels_appeal_drafts.yaml:165-200` — `MusicLabel` response with deployed field names и `LabelAppealFull` shape.
- `changes/023_music_label_display_drafts/CONTEXT.md:30-48` — display rules с Actual/Draft альтернативами.
- `changes/023_music_label_display_drafts/INDEX.md:32-43` — `Supersedes` явно перечисляет old shape (inline `draft`/`lastAppeal`).

## Антипример

```yaml
# Owner label list возвращает union с inline draft metadata
MusicLabelListItem:
  type: object
  properties:
    id: { type: integer }
    name: { type: string }
    draft:
      type: object
      properties:
        name: { type: string }       # proposed value
        appealId: { type: string, format: uuid }
        status: { type: string, enum: [pending, rejected] }
```

Правка: разделить на `MusicLabelActualListItem` (без draft метаданных, только accepted values) и `MusicLabelDraftListItem` (только draft values + top-level `id` (локальный), `appealId`, `type`, `status`). Owner list returns `anyOf`/`oneOf`. Это устраняет implicit union одной schema и согласуется с 023.

## Связанные паттерны

- [[feature-drafts-flow]] — Actual/Draft альтернативы — общий pattern для moderated entities.
- [[feature-appeals-flow]] — license/label appeal IDs synced через outbox + caller-side UUID generation.
- [[feature-shop-vs-studio]] — admin by-appeal endpoints живут на отдельном `/admin/` поверхности.

## Заметки для ревьюера

- 005 использует OpenAPI 3.0.3 и `nullable: false` — это исторический baseline, не нарушение. Новые iterations используют 3.1.0 с `anyOf` nullability.
- В 018 решение менять missing handling с nullable-map на `missingAppealIds` зафиксировано в CHANGES. Если кто-то предлагает nullable values, ссылайся на запись.
- License appeals (013/018) используют lowercase status values (`pending`/`rejected`/`accepted`), а label appeals (005/018) используют UPPER_CASE (`PENDING`/`ACCEPTED`/`REJECTED`/`REVOKED_BY_AUTHOR`). Это интенсиональный legacy mismatch; не пытайся унифицировать в одной iteration без supersedes.
- 023 specifically не меняет admin by-appeal contract из 018 — owner reads и admin reads — разные iterations.
