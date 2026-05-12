# Legacy Public Export

Phase 12 adds a read-only backend export for old-vs-new parity work.

## Command

```bash
pnpm run ops:stats:legacy-export -- --corpus-scope current
```

The command reads PostgreSQL through standard app configuration and prints JSON to stdout. It does not mutate database rows, object storage, queues, deployment state, or legacy systems.

Deterministic metadata options:

```bash
pnpm run ops:stats:legacy-export -- \
  --corpus-scope sample \
  --generated-at 2026-05-12T00:00:00.000Z
```

`--corpus-scope` is an operator label for the input set, such as `sample`, `partial-staging`, or `full-corpus`.

`--generated-at` pins the exported timestamp for fixture generation and repeatable diff tests.

Use the repository-supported Node 25 runtime for machine-readable stdout. Older local Node versions can cause package-manager engine warnings before JSON output when running through `pnpm`.

## Contract

The export contract is `legacy-public-export.v1`.

Top-level fields:

- `metadata`
- `players`
- `squads`
- `rotations`
- `other_players`
- `weapons`
- `weeks`

`metadata` includes:

- `contractVersion`
- `commandVersion`
- `corpusScope`
- `generatedAt`
- `sourceDatabase`
- `totals`

All arrays are sorted deterministically by public ranking fields, display names, and identifiers.

## Player Fields

Player rows include:

- `id`
- `name`
- `lastSquadPrefix`
- `lastPlayedGameDate`
- `isShow`
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

`kdRatio` is `kills / deaths.total`, rounded to two decimals. If `deaths.total` is zero, it is exported as `kills`.

`killsFromVehicleCoef` is `killsFromVehicle / kills`, rounded to two decimals. If `kills` is zero, it is exported as `0`.

`totalScore` is `kills - teamkills`, rounded to two decimals. This backend formula is intentionally explicit so Phase 13 can compare it to legacy score behavior without hiding differences.

## Squad and Rotation Fields

Squad rows include visible squad identity, aggregate counters, score fields, and nested player rows when available from the export read model.

Rotation rows include:

- `id`
- `name`
- `startDate`
- `endDate`
- `totalGames`
- `players`
- `squads`

Rotation players and squads use the same public field vocabulary as global exports.

## Detail Surfaces

`other_players` contains per-player relationship surfaces:

- `killed`
- `killers`
- `teamkilled`
- `teamkillers`

Each relationship item includes `id`, `name`, and `count`.

`weapons` contains per-player weapon surfaces:

- `firearms`
- `vehicles`

Server-side parser artifacts preserve weapon names for kill and destroyed-vehicle evidence. Reliable distance evidence is not currently exported because it is not available in the persisted backend event payload.

`weeks` contains per-player weekly buckets:

- `week`
- `startDate`
- `endDate`
- `totalPlayedGames`
- `kills`
- `killsFromVehicle`
- `vehicleKills`
- `teamkills`
- `deaths.total`
- `deaths.byTeamkills`
- `kdRatio`
- `killsFromVehicleCoef`
- `score`

Weekly `score` is `(kills - teamkills) / totalPlayedGames`, rounded to two decimals. If `totalPlayedGames` is zero, it is exported as `0`.

## Normalization

The export reads persisted aggregate tables and current parser-result event evidence. It does not parse OCAP files or raw replay JSON.

Parser-level details that are not public-stat differences should be normalized here or in Phase 13 diff policy, not by broadening backend aggregate semantics. The default known-difference policy remains narrow: only documented `deaths.byTeamkills` duplicate-slot/respawn cases may be treated as expected during diff review.

## API Compatibility

This is an operator export command, not a public Fastify route. Phase 12 intentionally does not change `GET /openapi.json` or the committed `openapi/server-2.openapi.json` artifact.
