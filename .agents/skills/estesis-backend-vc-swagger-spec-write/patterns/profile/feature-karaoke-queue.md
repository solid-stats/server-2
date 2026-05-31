---
name: feature-karaoke-queue
title: 'Karaoke queue: один active queue per user, ordered songs, SSE events'
category: songs
kind: feature
severity_when_violated: MEDIUM
applies_to:
  - karaoke queue endpoints в сервисе songs
  - song list management в active queue context
related:
  - feature-shop-vs-studio
source:
  - empirical (changes/008_karaoke_queue)
---

# Karaoke queue: один active queue per user, ordered songs, SSE events

## Правило

Karaoke queue — single active queue per user в один момент времени; создание или join автоматически leave-ит предыдущий active queue, а если пользователь был host прошлого queue — тот queue удаляется для всех участников. Queue backed своим playlist (даже без `sourcePlaylistId`). Invites work by `playlistId` в path. Любой participant может добавить/удалить/move песни через shared action endpoint `POST /api/v1/karaoke-queue/songs/action` (anyOf для `add`/`remove`/`move`). Add inserts at exact zero-based `atIndex` в request order; duplicate songs запрещены. Стартуя со stage 03, current song нельзя remove или move в `playing`/`paused` state. SSE endpoint `/api/v1/karaoke-queue/events` едино для всех stages; new event types добавляются incrementally.

## Когда применяется

Триггеры:
- Iteration трогает karaoke queue endpoints в songs service.
- Endpoint содержит `karaoke-queue` segment в path.
- Iteration описывает SSE events для realtime sync.

## Как проверить

- Только один active queue per user; create/join должны явно описывать "leave previous" поведение.
- Queue backed playlist; queue без `sourcePlaylistId` создает свой playlist под капотом.
- Invites use `playlistId` (не `queueId`). Это сохраняет dual-purpose playlist relation.
- `CurrentKaraokeQueueSnapshot` содержит `playlistId` и `hostUser`; participants выдаются отдельным endpoint (`/api/v1/karaoke-queue/participants`), не embedded в snapshot.
- Song actions — anyOf на `AddCurrentKaraokeQueueSongAction`, `RemoveCurrentKaraokeQueueSongAction`, `MoveCurrentKaraokeQueueSongAction`. Используется единый endpoint, не три раздельных метода.
- Add inserts at `atIndex` (zero-based) в order передаваемого массива `songIds`.
- Duplicate songs возвращают `409`; non-existent songs возвращают `404`.
- Move уважает текущий audio player state в stage 03+: `playing`/`paused` блокирует move/remove current song.
- User data для `hostUser` и participants резолвится через `/api/StudentTeacherRichProfile/{id}` из mainBackend; sigma profile resolution живет вне sounds service.
- SSE events carry only changed data slice — не full snapshot.
- Stages добавляются incrementally: 01 (membership), 02 (song list), 03 (audio player). Каждый stage расширяет SSE event union, не переписывает.

## Severity и риск

MEDIUM: нарушение pattern приводит к multiple active queues per user, что ломает product invariant ("один active queue at a time"). Также pull-based queue reads (без SSE) делает participant UX дрожащим. Embedding participants в snapshot блокирует pagination и приводит к bloated SSE events.

## Хороший пример

- `changes/008_karaoke_queue/CONTEXT.md:14-32` — фиксирует все домен-правила.
- `changes/008_karaoke_queue/02_songs_song_list.yaml:88-114` — unified song action endpoint с anyOf для add/remove/move; явные 400/404/409 для каждого случая.
- `changes/008_karaoke_queue/02_songs_song_list.yaml:20-41` — SSE stream использует `text/event-stream` content-type; единый endpoint, расширяется в новых stages.
- `changes/008_karaoke_queue/CONTEXT.md:36-55` — shared schemas table с явным указанием, в каких stages schema используется.

## Антипример

```yaml
# Три отдельных endpoint вместо unified action
/api/v1/karaoke-queue/songs/add:
  post: ...
/api/v1/karaoke-queue/songs/{songId}/remove:
  delete: ...
/api/v1/karaoke-queue/songs/{songId}/move:
  patch: ...
```

Правка: использовать unified `POST /api/v1/karaoke-queue/songs/action` с `anyOf` request body, как в 02 stage. Это упрощает SSE event handling и держит контракт компактным.

## Связанные паттерны

- Karaoke queue backed своим playlist; playlist contract — historical baseline (changes/011_playlists_api).

## Заметки для ревьюера

- 008 — multi-stage iteration с 3 файлами; каждый stage предполагает предыдущий реализован.
- SSE schema (KaraokeQueueEvent) — union, расширяющийся в новых stages. Не дублируй сам endpoint в новых stages; описывай только новые event types.
- Сейчас participant resolution идет через `/api/StudentTeacherRichProfile/{id}` mainBackend — это исторический dependency. Новые user-data flows могут использовать другие endpoints, но 008 baseline остается.
