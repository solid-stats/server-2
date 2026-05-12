# Rotation and Identity Readiness

This document defines the Phase 11 readiness contract for rotation coverage and historical no-SteamID identity preparation.

## Command

```bash
pnpm run ops:stats:readiness
```

The command reads PostgreSQL through standard app configuration and prints JSON to stdout. It is read-only.

## Rotation Readiness

Every timestamped replay should map to exactly one rotation:

```text
rotation.starts_at <= replay.replay_timestamp
and (rotation.ends_at is null or rotation.ends_at > replay.replay_timestamp)
```

The readiness report lists:

- `missingReplayTimestampReplays`: replays with no timestamp;
- `missingRotationReplays`: timestamped replays that match no rotation;
- `overlappingRotationReplays`: timestamped replays that match more than one rotation;
- `ranges`: rotation windows with replay counts.

Missing or overlapping mappings must be fixed before final full-corpus parity review unless a future explicit exclusion mechanism documents the skipped range and reason.

## No-SteamID Identity Rules

Historical parser players may lack SteamID evidence. The readiness report classifies no-SteamID parser players as:

| Status                      | Meaning                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `nickname_history`          | Observed name matches exactly one active nickname validity window.       |
| `provisional_observed_name` | No active nickname conflict exists; recalculation may use name fallback. |
| `ambiguous`                 | Observed name matches multiple active canonical players.                 |
| `unresolved`                | Observed name is blank or otherwise unusable.                            |

`ambiguous` and `unresolved` items require operator review before parity conclusions.

## Nickname History

Nickname history rows use:

- `playerId`
- `nickname`
- `observedFrom`
- `observedTo`
- `sourceReplayId`
- `evidence`

Validity windows are inclusive at both ends for readiness matching. Open-ended `observedFrom` or `observedTo` values mean the nickname is unbounded on that side.

The readiness report detects nickname conflicts when the same normalized nickname is active for multiple canonical players over overlapping validity windows.

## Import and Export Shape

The safe operator exchange shape for nickname history is JSON:

```json
{
  "version": 1,
  "nicknames": [
    {
      "playerId": "00000000-0000-4000-8000-000000000001",
      "nickname": "ObservedName",
      "observedFrom": "2026-01-01T00:00:00.000Z",
      "observedTo": null,
      "sourceReplayId": "00000000-0000-4000-8000-000000000101",
      "evidence": {
        "source": "operator_import",
        "note": "full-run parity preparation"
      }
    }
  ]
}
```

Phase 11 does not silently import this shape. Live identity mutations should continue through moderated workflow actions or an explicitly reviewed import task so audit ownership is clear.

## Future SteamID Migration

When a future parser result includes SteamID for a player previously resolved by nickname history or provisional observed-name identity:

1. Prefer an existing `player_steam_ids` match if the SteamID is already known.
2. If the SteamID belongs to the same canonical player resolved by name evidence, append SteamID history with evidence.
3. If SteamID evidence points to a different canonical player than active nickname history, report a conflict and require moderation before merging or splitting.
4. Preserve historical nickname evidence after SteamID linking; do not delete it just because stronger future evidence appears.
5. Recalculate affected rotations after approved identity changes.

This keeps historical public stats auditable while allowing future parser evidence to strengthen canonical identity.

## Boundaries

The readiness command does not:

- parse OCAP contents;
- crawl replay sources;
- mutate identity rows;
- apply nickname imports automatically;
- capture legacy snapshots;
- use SSH, Kubernetes, or deployment tooling.

Infrastructure or operator workflows should archive the JSON output for sample, partial staging, and final full-corpus review.
