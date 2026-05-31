---
name: iteration-depends-on-not-numeric
title: Depends On важнее, чем номер папки
category: iteration
kind: category
severity_when_violated: MEDIUM
applies_to:
  - '`Depends On` секция в `changes/XXX_*/INDEX.md`'
  - случаи, когда более ранняя по номеру папка зависит от более поздней
related:
  - iteration-folder-naming
  - iteration-index-md-content
source:
  - references/estesis-profile.md (folder and iteration workflow)
  - empirical (changes/008_karaoke_queue/INDEX.md, changes/013_label_public_songs/INDEX.md)
---

# Depends On важнее, чем номер папки

## Правило

Технические зависимости между итерациями определяются секцией `Depends On` в `INDEX.md`, а не номером папки. Исторически более ранняя папка (с меньшим `XXX`) может зависеть от более поздней (с большим `XXX`), если так сложился порядок принятия решений. `XXX` отражает исторический порядок появления/согласования, а не dependency order; не пытайся вывести зависимости из номеров.

## Когда применяется

- проверяешь корректность `Depends On` в `INDEX.md`;
- кто-то предлагает переименовать iteration folder ради "правильного" dependency order;
- разработчик пытается реализовать итерации строго по возрастанию `XXX`;
- ревьюер удивляется, что более ранняя папка зависит от более поздней.

## Как проверить

- Сверь `Depends On` со списком итераций в `CATALOG.md`.
- Сверь, что каждая упомянутая dependency iteration реально существует и `Accepted` (или сама помечена `Draft` и явно описана как in-progress зависимость).
- Если более ранняя по номеру итерация (`008`) зависит от более поздней (`011`), это допустимо; ищи объяснение в `CONTEXT.md` или `INDEX.md`. Не предлагай переименование.
- При имплементации иди по `Depends On`, а не по `XXX`: cначала реализуй все, на что ссылается `Depends On`, потом саму итерацию.

## Severity и риск

MEDIUM. Игнорирование `Depends On` приводит к неправильному порядку реализации: разработчик берет итерацию по возрастающему индексу и упирается в схему, которая еще не определена. С другой стороны, попытка перенумеровать итерации ради dependency order ломает иммутабельность `XXX` и контракт `CATALOG.md`.

## Хороший пример

- `changes/008_karaoke_queue/INDEX.md:21-26` — итерация `008` зависит от `011_playlists_api`, `009_playlist_song_ids`, `010_playlist_processed_songs`, `004_user_profile_v3`. Более ранний номер `008` зависит от более поздних `009`-`011`.
- `changes/013_label_public_songs/INDEX.md:21-25` — `013` зависит от `005`, `007`, `012`; смешение порядка зависимостей нормально.
- `changes/021_resource_voice_range/INDEX.md:23-27` — `021` зависит от `014`, `016`, `017`, что соответствует возрастанию номера, но не обязано всегда быть таким.

## Антипример

```
# 020_some_feature

## Depends On

- none   # хотя в CONTEXT.md написано "uses schema FullResource from 019"
```

Правка: добавить `Depends On: 019_resource_purchased_content` явно, чтобы порядок реализации был очевиден.

## Связанные паттерны

- [[iteration-folder-naming]] — `XXX` глобален и не отражает зависимости.
- [[iteration-index-md-content]] — `Depends On` — обязательная секция `INDEX.md`.

## Заметки для ревьюера

- Если `Depends On: none`, проверь, что итерация действительно самодостаточна (как `001_shared_status_errors`, `004_user_profile_v3`, `006_video_lessons`, `011_playlists_api`).
- Транзитивные зависимости не нужно перечислять явно: если `020` зависит от `019`, а `019` от `014`, в `020` достаточно написать `019_resource_purchased_content` без `014_exercises_resources`. Но если `020` непосредственно использует схемы из `014`, тогда `014` нужно явно перечислить (как в `changes/020_*/INDEX.md:30-34`).
- Не предлагай менять `XXX` ради "красивого" dependency order. Это нарушение неизменности глобального индекса.
