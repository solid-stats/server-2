---
name: feature-drafts-flow
title: 'Moderated drafts: отдельная сущность с жизненным циклом'
category: drafts
kind: feature
severity_when_violated: HIGH
applies_to:
  - постановки, где сущность изменяется через модерацию (teacher profile, music label, music label license)
  - постановки, где владелец видит свой draft до accept, а публика — только accepted actual data
related:
  - feature-music-labels
  - feature-appeals-flow
  - feature-shop-vs-studio
source:
  - empirical (changes/015_teacher_profile_drafts, changes/018_music_label_appeal_drafts, changes/023_music_label_display_drafts, changes/013_label_public_songs)
---

# Moderated drafts: отдельная сущность с жизненным циклом

## Правило

Если сущность изменяется через appeals/модерацию, draft должен быть отдельной сущностью со своим хранилищем, своими read endpoints и явным жизненным циклом `pending → accepted/rejected`. В тех же ответах используй пары схем `Actual` (accepted state без метаданных draft) и `Draft` (proposed state с top-level draft-метаданными: `id` локальной draft row, `appealId`, `type`, `status`). Не вкладывай draft-метаданные глубоко в `lastAppeal`/`nested draft` поле — это превращает draft в side-channel и ломает Liskov, потому что owner read становится несовместим с public read.

## Когда применяется

Триггеры:
- В iteration упоминаются appeals (`BECOME_TEACHER`, `EDIT_TEACHER`, `CreateMusicLabel`, `UPDATE_MUSIC_LABEL`, `CreateMusicLabelLicense`, `EditMusicLabelLicense`).
- Контракт содержит `draft`-эндпоинты, `view=draft`/`view=actual` параметр или схему с `appealId` и `status: pending/rejected/accepted`.
- Owner видит данные до accept, public видит только accepted.
- В response используется `oneOf` `Actual`/`Draft`.

## Как проверить

- В owner read response должна быть `oneOf`/`anyOf` от `Actual`-варианта и `Draft`-варианта; не однообразная схема с nullable `draft` или nullable `appeal` полем.
- `Draft`-схема должна возвращать `id` локальной draft row, `appealId` (обычно UUID, иногда integer), `type` (тип appeal) и `status` (`pending`/`rejected`); accepted и withdrawn состояния не считаются current draft.
- Owner read должен возвращать accepted actual values, если accepted state существует, и draft values только если accepted state отсутствует (create draft).
- Public reads (search, popular, feed) должны опираться только на accepted actual data — никогда не отдают draft.
- Admin by-appeal read должен возвращать `data` объект, keyed by `appealId`, плюс `missingAppealIds` для unresolved/withdrawn/wrong-type appeal UUIDs (см. `changes/015_teacher_profile_drafts` как baseline и `changes/018_music_label_appeal_drafts` как extended pattern).
- Для pending/rejected `appealId` admin read возвращает только данные, привязанные к именно этому appeal; missing draft не fallback к accepted — UUID идет в `missingAppealIds`.
- Rejected drafts хранятся; owner может отредактировать rejected draft и resubmit, что создает новый appeal (новый UUID/id) и оставляет старый rejected appeal как историю.
- Revoke owner-side очищает draft data и current appeal pointer только после appeals confirms revoke.
- Когда appeal accepted, моделируемые поля коммитятся в accepted tables через shared ORM mapping; draft row удаляется и appeal pointer очищается.

## Severity и риск

HIGH: нарушение этой формы напрямую ломает разделение accepted/draft data и приводит к утечке непрошедшей модерацию информации в public APIs. Также высокий риск contract drift между owner и admin поверхностями: если draft вкладывается в nested поле, owner UI начинает читать `lastAppeal.data` и сервис теряет инвариант "public видит только accepted".

## Хороший пример

- `changes/015_teacher_profile_drafts/CONTEXT.md:20-49` — storage model описывает отдельный draft table с тем же ORM base class, что и accepted tables; draft row держит локальный id, owner user id, appeal UUID, тип и локальный статус.
- `changes/018_music_label_appeal_drafts/01_musicLabels_appeal_drafts.yaml:117-164` — admin by-appeal response: `data` объект keyed by appeal UUID, плюс `missingAppealIds` массив; pending/rejected returns proposed values, accepted returns accepted-for-this-appeal values.
- `changes/023_music_label_display_drafts/CONTEXT.md:30-48` — display rules: Actual schemas без draft метаданных, Draft schemas с top-level `id`, `appealId`, `type`, `status`; create draft без accepted state использует Draft `id` как route id для draft routes.
- `changes/013_label_public_songs/INDEX.md:42` — license iteration уже использовал Actual/Draft альтернативы как pattern, который reused 023.

## Антипример

```yaml
# Owner label read возвращает один schema с inline draft метаданными
MusicLabel:
  type: object
  properties:
    id: { type: integer }
    name: { type: string }
    lastAppeal:
      type: object
      description: Контейнер для current draft метаданных и proposed values.
      properties:
        status: { type: string, enum: [pending, rejected, accepted] }
        data:
          # ВНУТРЬ положены proposed name/phoneNumber/email,
          # что превращает draft в боковой канал, ломает Liskov для public reads
          # и заставляет клиента самостоятельно склеивать accepted+draft.
          type: object
```

Правка: разделить ответ на `MusicLabelActual` и `MusicLabelDraft`, объединить через `oneOf`/`anyOf`. `MusicLabelDraft` несет proposed values как top-level поля и top-level draft-метаданные: `id` локальной draft row, `appealId`, `type`, `status`. Public reads оставить на `MusicLabelActual`.

## Связанные паттерны

- [[feature-appeals-flow]] — appeals service является owner-ом appeal records; draft entity ссылается на `appealId` оттуда.
- [[feature-music-labels]] — music labels баланс accepted/draft исторически в одной схеме; 023 фиксирует переход на Actual/Draft.
- [[feature-baseline-changes]] — переход на Actual/Draft фиксируется через новую iteration с CHANGES.md, не переписыванием старой папки.

## Заметки для ревьюера

- Для приемки old iteration без CHANGES.md (например, 005) держится как baseline; новая поверхность накладывается через новую iteration с явным `Supersedes` в `INDEX.md`.
- В 018 решение менять missing-handling с nullable-map на `missingAppealIds` зафиксировано в `CHANGES.md`. Если кто-то возвращает к nullable values, ссылайся на запись и блокируй.
- В paths используется `draft` или `by-appeal` сегмент; не сваливай draft data в общий read endpoint без явного `view` или `/draft` поддерева.
