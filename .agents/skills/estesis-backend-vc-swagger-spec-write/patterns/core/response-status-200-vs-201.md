---
name: response-status-200-vs-201
title: Use 200 for a non-empty response, not 201
category: response
kind: core
severity_when_violated: MEDIUM
applies_to:
  - any operation that returns a response body (including POST create endpoints)
related:
  - response-status-204-empty
  - errors-no-extra-status
source:
  - core-conventions.md
  - empirical
---

# Use 200 for a non-empty response, not 201

## Rule

For a successful response with a body, always use status `200`. Do not use `201 Created`, even for POST create operations.

## When it applies

Trigger: any operation (POST/PATCH/PUT/GET) that returns a JSON body in its response. Especially relevant for:
- POST create endpoints, where an author may reflexively write `201`;
- "buy" endpoints, start operations, save operations.

## How to detect a violation

- Find all `responses:` blocks and check that a non-empty response uses `'200'`.
- Red flag: a `'201':` key — a violation regardless of the description text.
- Empty responses use `'204'` (see [[response-status-204-empty]]).

## Severity and risk

MEDIUM: a violation hurts contract consistency (all operations use 200) but does not break integration: clients generally accept any 2xx as success. Still, the status is part of the public API; different codes for the same semantics cause inconsistency in client handlers.

## Good example

```yaml
post:
  operationId: createScheduleItem
  responses:
    '200':
      description: The created schedule item.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ScheduleItem'
```

## Anti-example

```yaml
post:
  operationId: createScheduleItem
  responses:
    '201':
      description: Schedule item created.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ScheduleItem'
```

Fix: replace `'201'` with `'200'`.

## Related patterns

- [[response-status-204-empty]] — what to use when there is no response body.
- [[errors-no-extra-status]] — overall discipline in choosing statuses.

## Reviewer notes

The rule is formal and has no exceptions. If an author insists on 201 for a create endpoint citing REST conventions, reject it: the convention is fixed at 200.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/016_lessons_resources/01_resources_lessons_create_delete.yaml` — `POST /api/v1/lessons` (create lesson) and `PATCH /api/v1/lessons/{id}/cover` both return `'200'` with a body, not `201`
- `changes/011_playlists_api/01_songs_playlists.yaml` — `createKaraokeQueue` (`POST /api/v1/karaoke-queue`) returns `'200'` with the created `KaraokeQueue` object
- `changes/006_video_lessons/01_resources_create_delete.yaml` — `createVideoLesson` and `updateVideoLesson` both return `'200'` with a body regardless of whether the operation creates or updates the resource
