---
name: feature-exercises-lessons-programs
title: Три ресурсных типа в сервисе Ресурсов — общая форма iteration
category: resources
kind: feature
severity_when_violated: HIGH
applies_to:
  - новые iterations для resource types `exercise`, `lesson`, `program`, `videoLesson`
  - изменения CRUD/shop/library/reviews/admin контракта одного из этих типов
related:
  - feature-resource-ownership
  - feature-shop-vs-studio
  - feature-multipart-uploads
  - feature-publish-lifecycle
  - feature-voice-range
source:
  - empirical (changes/006_video_lessons, changes/014_exercises_resources, changes/016_lessons_resources, changes/017_programs_resources)
---

# Три ресурсных типа в сервисе Ресурсов — общая форма iteration

## Правило

Каждый resource type (`exercise`, `lesson`, `program`, `videoLesson`) описывается в собственной iteration, но все iterations следуют единой stage-карте:

- `01_<resource>_create_delete` — create draft flow, update draft flow, delete (soft), document management.
- `02_01_<resource>_shop_library` — shop reads, library reads, publication endpoint, list + detail.
- `02_02_<resource>_reviews` — public review reads, authenticated review create.
- `03_<resource>_admin` — admin list/read across authors.

Shared schemas (`ResourceAuthor`, `ResourceDifficulty`, `ResourceDocument`, `SortDir`, `ResourceSortBy`, `ReviewRating`, `ResourceReview`) переиспользуются между типами и реплицируются в каждом stage YAML self-contained. Каждый type использует свой `<Resource>Category` enum (`ExerciseCategory`, `LessonCategory`, `ProgramCategory`, `VideoLessonCategory`).

## Когда применяется

Триггеры:
- Iteration трогает CRUD одного из четырех resource types.
- Iteration вводит publication, shop list/details, library list/details, reviews или admin lists.
- Iteration вводит nested content items (lessons embedding exercises/video lessons; programs scheduling lessons).

## Как проверить

- Stage-карта в `INDEX.md` совпадает с шаблоном `01 → 02_01 → 02_02 → 03`. Если iteration пропускает какой-то stage, проверь, что reasoning явно зафиксирован.
- Каждый stage YAML self-contained: schemas, enum values, errors определены локально, не через external `$ref` к другим iterations.
- Каждый ресурс возвращает `id`, `name`, `author` (через `ResourceAuthor` oneOf student/teacher), `imageUrl`, `difficulty`, `rating`, `reviewsCount`, `views`, `price`, `documents[]`, плюс type-specific fields.
- `Short<Resource>` schemas используются в shop/library list responses; `Full<Resource>` — в detail responses.
- `sourceId` (или `resourceSourceId` в 020 studio context) — required nullable: `null` для оригинальных source cards, не-null для purchased copy cards.
- `isDeleted` — required boolean в response schemas, начиная с этих iterations; shop hides deleted items, library/admin может показать.
- Embedded resources внутри lesson/program используют purchase grant: купивший lesson получает library access ко всем embedded exercises/video lessons из этой версии lesson. Purchased program открывает all scheduled lessons и их embedded ресурсы (см. 016/017).
- Permission codes одинаковы для всех типов: `CREATE_RESOURCE`, `UPDATE_MY_RESOURCES`, `UPDATE_ALL_RESOURCES`, `DELETE_MY_RESOURCES`, `DELETE_ALL_RESOURCES`. См. `[[feature-resource-ownership]]`.
- Embedded structure отличается per type:
  - `exercise` — fragments с note-name voice range, base notes, playback pattern.
  - `lesson` — `items[]` array с `exercise`/`videoLesson`/`comment` элементами; порядок задан массивом, не per-item `order`.
  - `program` — `schedule[]` массив `{dayNumber, lessonId}`, 1-based, 7-day week.
  - `videoLesson` — простой video ресурс без nested items.
- Create/update body для `exercise` использует draft-based multipart (см. `[[feature-multipart-uploads]]`); для `lesson`/`program` — JSON, потому что nested items не помещаются в multipart с плоскими полями; cover image и documents — отдельные методы.
- Voice range для всех типов через `voiceRange` объект (см. `[[feature-voice-range]]`).

## Severity и риск

HIGH: расхождение в форме (отсутствие 02_02 reviews, разные wording для `403`, разное расположение `documents[]`) делает контракт сервиса Ресурсов несогласованным. Backend пишет сложный код потому, что каждый type ведет себя по-разному. Frontend поддерживает несколько almost-identical clients.

## Хороший пример

- `changes/014_exercises_resources/INDEX.md:29-38` — stage-карта `01 → 02_01 → 02_02 → 03` с указанием сервиса `resources`.
- `changes/016_lessons_resources/INDEX.md:31-44` — same stage-карта с lesson-specific deltas (JSON body, nested items, voice range).
- `changes/017_programs_resources/INDEX.md:31-44` — same stage-карта с program-specific deltas (schedule с dayNumber, day detail endpoints).
- `changes/006_video_lessons/INDEX.md:27-35` — original template, который все остальные ресурсные iterations повторяют.
- `changes/014_exercises_resources/CONTEXT.md:88-113` — shared schemas table с явным указанием, в каком stage что используется.

## Антипример

```text
changes/0NN_new_resource/
├── INDEX.md
├── CONTEXT.md
├── 01_create_all_in_one.yaml   # combined CRUD + shop + library + reviews + admin
```

Правка: разбить на 4 stage YAML по шаблону `01 / 02_01 / 02_02 / 03`. `01` — create/update/delete с draft-based flow (если требуется multipart) или JSON (если требуется nested items). `02_01` — shop/library/publication. `02_02` — reviews. `03` — admin list. Это согласуется с iteration shape всех других ресурсных types и упрощает review.

## Связанные паттерны

- [[feature-resource-ownership]] — все mutations используют двух-веточный permission check.
- [[feature-multipart-uploads]] — exercise create/update использует draft-based flow с плоскими multipart полями per fragment.
- [[feature-publish-lifecycle]] — published source guards применяются ко всем четырем types через 022.
- [[feature-voice-range]] — `voiceRange` форма одинакова для exercise/lesson/program.

## Заметки для ревьюера

- 006 video lessons — самый старый baseline (без `voiceRange`, без `sourceId`); более поздние iterations его не переписывают, но добавляют поля через `voiceRange` и `sourceId` в 019/020/021 patches.
- Каждый CRUD endpoint имеет permission check (см. `[[feature-resource-ownership]]`). Не дублируй описание `403` в shared response — оставляй inline в каждом endpoint.
- 016 lesson и 017 program используют JSON create/update; не предлагай переход на multipart, потому что nested items недопустимы в multipart non-mainBackend сервисов.
- 017 program нестандартно ссылается на актуальный deployed `/api/v3/permissions/check` from registry, а не на 003 snapshot. Это допустимое отступление, зафиксированное в INDEX.
