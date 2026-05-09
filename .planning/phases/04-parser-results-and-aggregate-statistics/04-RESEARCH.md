# Phase 04 Research: Parser Results and Aggregate Statistics

## Scope

Phase 4 turns parser v3 artifacts into server-owned normalized state and deterministic aggregate rows. Phase 3 already stores parser result placeholders and artifact references; Phase 4 should provide the artifact ingestion and recalculation path that future public APIs and moderation workflows consume.

## Key Contract Evidence

- Parser v3 artifacts are compact JSON tables: `players`, `weapons`, nested player `kills`, `destroyed_vehicles`, `diagnostics`, `side_facts`, `replay`, `source`, `parser`, and `status`.
- Parser worker result messages carry artifact references; Phase 4 should load artifact content through an injectable artifact source so tests do not depend on live S3.
- Parser identity remains observed; canonical identity belongs to `server-2`.
- Teamkill classification is present in kill rows and must never award bounty points.

## Recommended Architecture

Use three layers:

1. Artifact ingestion: validate/map parser artifact JSON into typed server-side structures.
2. Normalized persistence: replace current normalized rows for a parser result/replay with rows in `parser_events` and current raw snapshot evidence in `parser_results`.
3. Aggregate recalculation: assign replay to rotation, recalculate player/squad/commander/bounty rows for affected replay/rotation scope, and overwrite derived rows idempotently.

Keep public API response shaping out of Phase 4. Phase 5 should read persisted aggregate tables.

## Schema Direction

The existing schema is sufficient for MVP:

- `parser_results.raw_snapshot` can hold the compact artifact snapshot and artifact reference metadata.
- `parser_events.payload` can hold normalized kill/teamkill/destroyed vehicle/diagnostic payloads.
- `player_stats.stats`, `squad_stats.stats`, and `bounty_points.inputs` can hold versioned aggregate JSON.
- `commander_side_stats` already has distinct known/unknown counters.

Add schema only if implementation discovers a hard uniqueness or queryability gap.

## Bounty Formula Direction

Document a simple deterministic v1 formula before implementation:

```text
base = 1
player_factor = previous_rotation_victim_player_effectiveness
squad_factor = previous_rotation_victim_squad_effectiveness
points = base * (1 + player_factor) * (1 + squad_factor)
```

If previous rotation evidence is missing, use factor `0`. If the kill is a teamkill or non-enemy kill, award `0` and record exclusion reason.

## Verification Strategy

- Parser artifact fixture tests for raw snapshot and normalized rows.
- Recalculation tests for rotation assignment, player/squad counts, commander unknown outcomes, bounty enemy kill, bounty teamkill exclusion, and overwrite idempotency.
- Integration tests against PostgreSQL for derived row replacement.
- `pnpm run verify` remains the phase completion gate with 100% V8 coverage.
