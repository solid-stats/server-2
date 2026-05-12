# Phase 12 Research: Legacy Public Export Contract

**Status:** complete
**Completed:** 2026-05-12

## Existing Code

- `PgPublicStatsReadModel` already reads `player_stats`, `squad_stats`, `commander_side_stats`, `bounty_points`, `rotations`, `canonical_players`, `player_nicknames`, `player_steam_ids`, `squads`, and `squad_memberships`.
- `player_stats.stats` currently contains `kills`, `teamkills`, `deaths.total`, `deaths.by_teamkills`, `replay_count`, and `version`.
- `squad_stats.stats` currently contains `kills`, `teamkills`, `deaths.total`, `deaths.by_teamkills`, `player_count`, `replay_count`, and `version`.
- Phase 09 stores `player_counter` events with `kills_from_vehicle` and `vehicle_kills` evidence, plus kill/teamkill/unknown kill rows with weapon context.
- Current parser results keep the raw parser artifact snapshot, including player rows and optional weapon lookup tables.
- The existing operator command pattern is `src/operations/*.ts` plus a package script that prints formatted JSON to stdout.

## Legacy Reference Shape

Local `~/sg_stats` reference files show these relevant surfaces:

- `results/*/global_statistics.json`
- `results/*/squad_statistics.json`
- `results/*/other_players_statistics/{player}.json`
- `results/*/weapons_statistics/{player}.json`
- `results/*/weeks_statistics/{player}.json`
- `results/sg/rotations_info.json`
- `results/sg/rotation_*/global_statistics.json`
- `results/sg/rotation_*/squad_statistics.json`

Observed player fields include:

- `id`
- `name`
- `lastSquadPrefix`
- `lastPlayedGameDate`
- `totalPlayedGames`
- `kills`
- `killsFromVehicle`
- `vehicleKills`
- `teamkills`
- `deaths.total`
- `deaths.byTeamkills`
- `kdRatio`
- `killsFromVehicleCoef`
- `totalScore`
- `killed`
- `killers`
- `teamkilled`
- `teamkillers`

Observed detail surfaces:

- `other_players`: `killed`, `killers`, `teamkilled`, `teamkillers`.
- `weapons`: `firearms` and `vehicles`, each with `name`, `kills`, and optional range evidence in legacy data. Server-side parser artifacts currently preserve weapon names but not reliable distance evidence.
- `weeks`: `week`, `startDate`, `endDate`, `totalPlayedGames`, kill/death counters, `kdRatio`, `killsFromVehicleCoef`, and `score`.

## Implementation Direction

1. Add a legacy export domain module:
   - TypeScript interfaces for `legacy-public-export.v1`.
   - Deterministic math helpers for KD, vehicle-kill coefficient, and score fields.
   - A service that assembles metadata and stable-sorts all arrays.
2. Add a PostgreSQL export read model:
   - Global player totals from `player_stats` plus player identity/squad display data.
   - Rotation-scoped player totals from `player_stats` by rotation.
   - Squad totals from `squad_stats` plus squad membership/player summaries.
   - Relationship counts from persisted kill/teamkill event evidence and resolved player identities.
   - Weapon counts from kill/teamkill and destroyed-vehicle event payloads.
   - Weekly buckets from replay timestamps, parser events, and counter evidence.
3. Add `pnpm run ops:stats:legacy-export`.
   - Default `corpusScope` should be `current`.
   - Optional `--corpus-scope <name>` should override metadata only.
   - Optional `--generated-at <iso>` should support deterministic fixture generation and tests.
4. Document the export contract, field formulas, known normalization, and lack of public API/OpenAPI shape change.

## Test Direction

- Unit-test export math and stable sorting with explicit fixtures.
- Unit-test repository SQL mapping with a scripted pool for player/squad/relationship/weapon/week surfaces.
- Unit-test the CLI with mocked repository/service construction and deterministic arguments.
- Run `pnpm run openapi:check` to verify no public API drift.
- Preserve 100% V8 coverage.

## Boundaries

- Do not parse OCAP contents in `server-2`.
- Do not crawl/fetch legacy replay sources.
- Do not capture legacy snapshots over SSH.
- Do not add Kubernetes, Secret mutation, or rollout orchestration.
- Do not change public Fastify API/OpenAPI shape unless a blocker is discovered.
