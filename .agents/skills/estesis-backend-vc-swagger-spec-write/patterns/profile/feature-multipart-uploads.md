---
name: feature-multipart-uploads
title: Multipart/form-data только с плоскими полями
category: multipart
kind: feature
severity_when_violated: HIGH
applies_to:
  - сервисы, отличные от `mainBackend`, которые принимают файлы
  - любые endpoints с `requestBody.content."multipart/form-data"`
related:
  - feature-exercises-lessons-programs
  - feature-resource-ownership
source:
  - references/estesis-profile.md (multipart/form-data только с плоскими полями)
  - empirical (changes/013_label_public_songs, changes/014_exercises_resources, changes/015_teacher_profile_drafts, changes/020_resource_owned_content_studio)
---

# Multipart/form-data только с плоскими полями

## Правило

Для всех сервисов, кроме `mainBackend`, multipart/form-data может содержать только плоские поля: `string`, `integer`, `number` (`float`/`double`), `boolean`, `null` или файл (`type: string`, `format: binary`). Не используй массивы, вложенные объекты или JSON-структуры через `$ref` в multipart payload. Если нужны сложные данные — выноси в JSON endpoint или представляй как отдельные плоские поля. Для cover/image полей используй `imageFile` со специальной семантикой omitted/null/binary; для альтернативных источников медиа описывай пары `...File` (новый binary) и `...Url` (reuse существующего S3 URL только в edit drafts).

## Когда применяется

Триггеры:
- Сервис — не `mainBackend`, и endpoint принимает upload файла.
- Endpoint описывает `requestBody.content."multipart/form-data"`.
- В iteration трогаются audio/image uploads, draft fragment media или document uploads.

## Как проверить

- Внутри multipart schema нет `type: array`, нет `$ref` на nested object, нет `type: object` с properties (кроме самого top-level schema).
- Все поля имеют примитивный type или `string + format: binary`.
- Объектные/массивные данные — например, baseNotes для exercise — представлены как несколько плоских полей с dot-нотацией в имени: `baseNotes.tenor`, `baseNotes.baritone`, `baseNotes.bass`, `baseNotes.mezzoSoprano`, `baseNotes.soprano`. Responses при этом возвращают объект `baseNotes` (см. `changes/014_exercises_resources/CONTEXT.md:81`).
- Для cover/image полей семантика тройная: omitted = keep, `null` = remove, binary = replace. Описывается в `description` поля.
- Для media с двумя источниками используется пара `...File` и `...Url`. Описывается в `description`, что URL разрешен только в edit drafts и только для media, уже привязанной к source ресурсу.
- Для document upload используется отдельный endpoint, который принимает только `documentFile` (плоский binary) и возвращает `ResourceDocument`. Не пакуй документы в массив multipart полей внутри основного `update` endpoint.
- Если структура multipart payload становится сложной (массивы fragments с media), выноси в draft-based flow: сначала `POST /draft`, потом `PUT /drafts/{id}/fragments/{order}` отдельным flat multipart по одному фрагменту за раз, потом commit. См. `[[feature-exercises-lessons-programs]]`.
- `mainBackend` исключение из правила — но не пользуйся им для других сервисов.

## Severity и риск

HIGH: nested структуры в multipart создают backend-парсинг боль, ломают совместимость с большинством HTTP-клиентов, особенно мобильных, и обычно требуют JSON-string полей внутри multipart, что усложняет валидацию. Также делает контракт неконсистентным между сервисами; новые разработчики начинают копировать сложный pattern в свои сервисы.

## Хороший пример

- `changes/014_exercises_resources/CONTEXT.md:79-86` — экспонирует базовые правила, включая dot-нотированные base notes как плоские поля.
- `changes/014_exercises_resources/01_resources_exercises_create_delete.yaml:96-115` — `setExerciseDraftFragment` использует multipart с парами `...File`/`...Url` для media, плоские поля, отдельный endpoint per fragment.
- `changes/015_teacher_profile_drafts/02_mainBackend_teacher_profile_drafts.yaml` — это `mainBackend`, где сложный multipart допустим как исключение; не наследуй паттерн в другие сервисы.
- `changes/020_resource_owned_content_studio/01_01_resources_studio_results.yaml:93-96` — `saveStudioResult` принимает multipart, но payload остается плоским: file fields + `type`, `resourceId`, `scheduleItemId`, `systemMark`.

## Антипример

```yaml
# Multipart с nested fragments array через $ref
CreateExerciseRequest:
  type: object
  properties:
    imageFile:
      type: string
      format: binary
    fragments:
      type: array
      items:
        $ref: '#/components/schemas/ExerciseFragmentInput'  # NESTED OBJECT
    baseNotes:
      $ref: '#/components/schemas/ExerciseBaseNotes'  # NESTED OBJECT
```

Правка:

1. Выкинуть `fragments` array из multipart; перейти на draft-based flow со separate set-fragment endpoint per fragment с плоским multipart payload.
2. Заменить `baseNotes` объект на отдельные плоские поля: `baseNotes.tenor`, `baseNotes.baritone`, `baseNotes.bass`, `baseNotes.mezzoSoprano`, `baseNotes.soprano`. Response продолжает возвращать объект `baseNotes`.

## Связанные паттерны

- [[feature-exercises-lessons-programs]] — draft-based flow для создания/edit ресурсов с media — это прямое следствие multipart ограничений.
- [[feature-resource-ownership]] — document upload endpoints используют тот же два-веточный `403`.

## Заметки для ревьюера

- Старые iterations могут иметь nested структуры; не переписывай ради стиля, если пользователь явно не попросил.
- Music label license документ загружается через document multipart (см. `changes/013_label_public_songs/01_musicLabels_license_rules.yaml`). Сложные правила лицензирования при этом остаются в JSON endpoint.
- Если кто-то предлагает `application/json` payload с base64 файлами вместо multipart — это анти-паттерн, требует дополнительного обоснования.
