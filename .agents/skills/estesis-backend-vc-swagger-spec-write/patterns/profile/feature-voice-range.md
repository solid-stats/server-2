---
name: feature-voice-range
title: Atomic voiceRange объект с notesRange и voiceTimbreTypes
category: resources
kind: feature
severity_when_violated: MEDIUM
applies_to:
  - exercise/lesson/program response cards
  - schemas, которые экспонируют voice range и timbre coverage metadata
related:
  - feature-exercises-lessons-programs
source:
  - empirical (changes/021_resource_voice_range, changes/014_exercises_resources, changes/016_lessons_resources, changes/017_programs_resources)
---

# Atomic voiceRange объект с notesRange и voiceTimbreTypes

## Правило

Voice range экспонируется одним atomic объектом `voiceRange` с обязательными `notesRange` (note-name `min`/`max`) и `voiceTimbreTypes` (массив timbre типов, чья полная частотная зона покрыта `notesRange`). Не разделяй на top-level `voiceTimbreTypes` и отдельный `notesRange` — это приводит к рассинхрону. Для exercise `voiceRange` non-null после успешного commit. Для lesson/program `voiceRange` required nullable: `null` означает, что нет exercise-derived range или нет общего непустого пересечения. Если `voiceRange != null`, оба поля обязательны.

## Когда применяется

Триггеры:
- Response card для resource type `exercise`, `lesson` или `program`.
- Schema, ссылающаяся на голосовой диапазон или timbre type.
- Iteration трогает exercise fragments, lesson embedded exercises или program scheduled lessons.

## Как проверить

- `voiceRange` returned together with `notesRange` and `voiceTimbreTypes`; nestable, never top-level `voiceTimbreTypes` отдельно от `notesRange`.
- Exercise response `voiceRange` required non-null; рассчитывается из draft fragments при create/update commit: `notesRange.min` = fragment с наименьшим `minVoiceNote` (по note-to-Hz), `notesRange.max` = fragment с наибольшим `maxVoiceNote`.
- Lesson `voiceRange` required nullable; рассчитывается как пересечение embedded exercise ranges: `min` = highest embedded `min`, `max` = lowest embedded `max`. Video lessons и comments не contribute.
- Program `voiceRange` required nullable; рассчитывается как пересечение scheduled lesson ranges аналогично.
- `voiceRange = null` для lesson/program означает no exercise-derived range или пустое пересечение. Это явное состояние, не отсутствие поля.
- `Note` enum охватывает `C0` через `B8` с диезами (`C#4` и т.п.). Boundaries возвращаются как note names; note-to-Hz используется внутренне.
- `VoiceTimbreType` enum включает `tenor`, `baritone`, `bass`, `mezzoSoprano`, `soprano` плюс legacy `undefined`. Computed `voiceTimbreTypes` массив не должен включать `undefined`.
- Timbre coverage: timbre type включается только если его полная Hz зона покрыта `notesRange`. Hz интервалы фиксированы (см. 021 CONTEXT).
- Для composite (lesson/program) timbre coverage — пересечение coverage contributing children.
- В create/update commit (exercise) base notes отправляются плоскими multipart полями `baseNotes.tenor`...; response возвращает объект `baseNotes`.

## Severity и риск

MEDIUM: разделение `notesRange` и `voiceTimbreTypes` в разные поля приводит к response, где одно поле есть, а другое отсутствует, что нарушает derivability. Атомарный объект обеспечивает, что они всегда возвращаются вместе и derive из одной computed range. Для null cases (lesson/program без exercise) нужен явный `voiceRange: null`, иначе клиент не знает, что range просто не существует.

## Хороший пример

- `changes/021_resource_voice_range/01_resources_voice_range.yaml:14-49` — `ResourceVoiceRange` schema с required `notesRange` и `voiceTimbreTypes`, явные правила derivation.
- `changes/021_resource_voice_range/CONTEXT.md:7-9` — фиксирует, что `voiceRange` группирует оба поля, чтобы избежать divergence.
- `changes/014_exercises_resources/CONTEXT.md:54` — exercise non-null `voiceRange` после commit; calculation from committed fragments.
- `changes/021_resource_voice_range/CONTEXT.md:24-35` — explicit calculation rules для exercise/lesson/program с min/max через note-to-Hz frequency.
- `changes/021_resource_voice_range/CONTEXT.md:39-50` — Hz интервалы timbre типов и правило inclusion (полное покрытие).

## Антипример

```yaml
# top-level voiceTimbreTypes отдельно от notesRange
ShortLesson:
  type: object
  properties:
    notesRange:
      anyOf:
        - $ref: '#/components/schemas/NotesRange'
        - type: 'null'
    voiceTimbreTypes:
      type: array
      items:
        $ref: '#/components/schemas/VoiceTimbreType'
```

Правка: объединить в один nullable `voiceRange` объект:

```yaml
voiceRange:
  anyOf:
    - $ref: '#/components/schemas/ResourceVoiceRange'
    - type: 'null'
```

`ResourceVoiceRange` содержит required `notesRange` и `voiceTimbreTypes`. Это гарантирует, что они либо оба отсутствуют (`null`), либо оба присутствуют и derived из одной computed range.

## Связанные паттерны

- [[feature-exercises-lessons-programs]] — `voiceRange` — стандартное поле в `Short<Resource>` / `Full<Resource>` cards.

## Заметки для ревьюера

- 021 — schema-only iteration без method endpoints. Это валидный pattern для cross-cutting schema upgrade.
- Старые iterations (014 stage 01 без voiceRange) остаются как baseline; 021 явно supersedes только stages, в которых exercise response не имел voiceRange. Не блокируй 014 stage 01.
- `voiceTimbreTypes` для author user profile может включать `undefined` — это legacy enum value. Computed resource `voiceTimbreTypes` не должен включать `undefined`.
- Hz интервалы timbre типов задокументированы в 021 CONTEXT таблицей. Не выдумывай новые — расширение enum требует обновления 021.
