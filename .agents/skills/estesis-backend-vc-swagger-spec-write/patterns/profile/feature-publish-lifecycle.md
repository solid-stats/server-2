---
name: feature-publish-lifecycle
title: Published source immutability и unpublish-как-recreate
category: lifecycle
kind: feature
severity_when_violated: HIGH
applies_to:
  - resource types `exercise`, `lesson`, `program`, `videoLesson`
  - любая постановка, которая трогает edit/delete/media/cover/document mutations публикуемого ресурса
related:
  - feature-resource-ownership
  - feature-shop-vs-studio
  - feature-purchased-content
source:
  - empirical (changes/022_resource_publish_lifecycle, changes/019_resource_purchased_content)
---

# Published source immutability и unpublish-как-recreate

## Правило

Published source resource является immutable: все edit, media, cover, document, draft-edit и normal delete mutations возвращают `409 Conflict`. Единственная разрешенная state-changing operation для published source — publication endpoint c `isPublished=false`. `publication=false` для published source hard-deletes старый published source и создает новую unpublished draft/source copy с новым id. Response остается `204` и id новой copy не возвращается; клиент перезагружает author/library list. Existing purchased copies сохраняют historical `sourceId`, который может указывать на удаленного предшественника, и должны оставаться hydrateable из copied data.

## Когда применяется

Триггеры:
- Iteration трогает CRUD по resource types `exercise`, `lesson`, `program`, `videoLesson`.
- Endpoint содержит `publication` сегмент или `isPublished` field.
- Frontend сценарий "снять с продажи и редактировать дальше".
- В response есть `sourceId` для resource copy и historical link.

## Как проверить

- Найди все endpoint paths формата `/api/v1/{resource}/{id}/publication` и убедись, что для published source unpublish описан как hard-delete + recreate с явным `204`, без возврата id новой copy.
- На существующих mutation endpoints (`PATCH /{resource}/{id}`, `DELETE /{resource}/{id}`, `POST /{resource}/{id}/documents`, `PATCH /{resource}/{id}/cover`, `POST /{resource}/{id}/draft`, `PUT /{resource}/drafts/{draftId}/fragments/{order}`, `DELETE /documents/{documentId}`) должны быть описаны `409`-ответы с общей формой `PublishedResourceLocked` для целевого published source.
- Normal `DELETE /{resource}/{id}` не должен вести себя как unpublish — отдельная семантика, всегда `409` для published source.
- Применяется ко всем четырем resource types (exercise/lesson/program/videoLesson); постановка должна явно покрывать все четыре или явно объяснить ограничение scope.
- Purchased copy hydration не должен требовать активной source row: copied data — источник правды.
- Если `publication=false` вызван для уже unpublished source, новая copy не создается — это idempotent branch.

## Severity и риск

HIGH: нарушение приводит к тому, что продавец может задним числом изменить уже купленный published ресурс, что меняет содержимое контента для всех покупателей и подрывает контракт магазина. Также если purchased copy hydration требует active source, hard-delete published source ломает library для существующих покупателей.

## Хороший пример

- `changes/022_resource_publish_lifecycle/CONTEXT.md:18-26` — фиксирует общие decisions: единственный разрешенный mutation для published source — publication=false, который hard-deletes старый source и создает draft copy.
- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml:14-156` — publication endpoints всех четырех resource types описывают одно и то же behavior с явным wording про hard-delete + recreate.
- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml:157-429` — guard fragments для update/delete/media/cover/document/draft methods единообразно используют `$ref: PublishedResourceLocked` для `409` branch.
- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml:469-478` — общий `PublishedResourceLocked` response объясняет, какие mutations попадают под guard и куда вызывать `publication=false`.

## Антипример

```yaml
# UNPUBLISH через тот же DELETE endpoint, source стал draft в той же row
delete:
  operationId: deleteExercise
  responses:
    '204':
      description: Exercise unpublished or deleted.
```

Правка: разделить семантику. `DELETE /exercises/{id}` для published source возвращает `409 PublishedResourceLocked`. Снять с продажи можно только через `POST /exercises/{id}/publication` c `isPublished=false`, который hard-deletes published source и создает новую unpublished draft copy. Описать явно, что id новой copy не возвращается и клиент перечитывает author list.

## Связанные паттерны

- [[feature-resource-ownership]] — published guard работает поверх существующих permission checks автора/admin.
- [[feature-purchased-content]] — purchased copy остается hydrateable независимо от source lifecycle.
- [[feature-baseline-changes]] — published guard оформляется как новая iteration с явным `Supersedes` старого edit behavior, а не переписыванием старых iterations.

## Заметки для ревьюера

- Если в новой iteration появляется новый resource type, проверь, добавлены ли соответствующие publication+guard endpoints. Часто забывают `videoLesson` или `program`.
- Для `program` publication дополнительно сохраняется `400` валидация (schedule, first-week content, empty-week limits и т.д.) — это не противоречит lifecycle, см. `01_resources_publish_lifecycle.yaml:146-155`.
- Старые iterations (014, 016, 017) описывают edit как разрешенный для любого статуса; 022 является активным baseline для published source. Не блокируй старые iterations за то, что они не знают про 022.
