---
name: response-status-204-empty
title: Use 204 for an empty response
category: response
kind: core
severity_when_violated: MEDIUM
applies_to:
  - DELETE endpoints
  - operations that complete without returning a body
  - status changes / boolean operations (publish/unpublish, withdraw, set fragment)
related:
  - response-status-200-vs-201
  - errors-no-extra-status
source:
  - core-conventions.md
  - empirical
---

# Use 204 for an empty response

## Rule

If an operation completes successfully and returns no body, use status `204 No Content`. Do not return `200` with an empty body, and do not use `204` for responses with a body — `204` must have no body.

## When it applies

- DELETE endpoints that remove an entity or relation.
- Operations that change state without needing to return the updated representation (publish/unpublish, withdraw, set fragment).
- Any "ack" endpoints (`/cancel`, `/markAsRead`, `/clear`).

## How to detect a violation

- Find `'204':` blocks — they must have no `content:`.
- Find successful operations without `content` under `'200':` — usually a mistake, it should be `'204'`.
- Match the action in `summary`/`operationId` against the response type: verbs like delete/clear/cancel/withdraw/set/publish/unpublish/revoke with no updated state returned are candidates for `204`.

## Severity and risk

MEDIUM: 200 with no body works but violates the convention and confuses a client that expects a body for 200. 204 with a body is worse, because some HTTP stacks discard the body.

## Good example

```yaml
delete:
  operationId: deletePlaylist
  responses:
    '204':
      description: Playlist deleted successfully.
```

## Anti-example

```yaml
delete:
  operationId: deletePlaylist
  responses:
    '200':
      description: Playlist deleted.
      content:
        application/json:
          schema:
            type: object
```

Fix: replace with `'204': { description: 'Playlist deleted successfully.' }` and no `content` block.

Reverse anti-example:

```yaml
'204':
  description: Created event
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/CalendarEvent'
```

Fix: if the response returns data, use `'200'` (see [[response-status-200-vs-201]]).

## Related patterns

- [[response-status-200-vs-201]] — what to use when there is a response body.
- [[errors-no-extra-status]] — do not declare extra statuses.

## Reviewer notes

In some endpoints an ack operation must immediately return the updated state (e.g. a start operation returns the started schedule items) — there it is correct to use `200`. Do not turn that into a `204`.

## Estesis examples

_These reference real spec files from the Estesis swagger repository. Other teams: substitute your own examples._

- `changes/011_playlists_api/01_songs_playlists.yaml` — `deletePlaylist` (`DELETE /api/v1/playlists/{id}`), `addUserToKaraokeQueue` (`POST`), and `removeUserFromKaraokeQueue` (`DELETE`) all return `'204'` with no `content` block
- `changes/022_resource_publish_lifecycle/01_resources_publish_lifecycle.yaml` — all four publish-lifecycle endpoints (`setVideoLessonPublication`, `setExercisePublication`, `setLessonPublication`, `setProgramPublication`) return `'204'` for a state-change operation that does not need to return a body
- `changes/016_lessons_resources/01_resources_lessons_create_delete.yaml` — `deleteLessonCover` (`DELETE /api/v1/lessons/{id}/cover`) and `deleteResourceDocument` return `'204'` with no `content`, contrasting with `setLessonCover` which returns `'200'` with the updated lesson
