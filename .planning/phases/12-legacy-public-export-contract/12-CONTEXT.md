# Phase 12 Context: Legacy Public Export Contract

**Status:** ready
**Mode:** autonomous smart discussion

## Phase Goal

`server-2` must export deterministic legacy-comparable public statistics for the old-vs-new diff gate and downstream `web` planning.

## Relevant Requirements

- PUB-07: Operator can export deterministic player global statistics from `server-2` for legacy comparison.
- PUB-08: Operator can export deterministic squad statistics from `server-2` for legacy comparison.
- PUB-09: Operator can export deterministic rotation-scoped statistics from `server-2` for legacy comparison.
- PUB-10: Operator can export legacy detail surfaces needed by downstream planning, including `other_players`, `weapons`, and `weeks`.
- PUB-11: Exported fields include kills, kills from vehicle, vehicle kills, teamkills, deaths, KD, score, total played games, relationships, weapons, weekly buckets, and visible player/squad identity.
- PUB-12: Export output includes deterministic metadata that identifies source database, command version, input corpus scope, generated time, and relevant contract version.
- PUB-13: Export normalizes parser-level non-public differences when needed to preserve public legacy parity.
- API-05: Any public API or OpenAPI shape change needed for parity reporting or future `web` consumption updates the committed OpenAPI artifact and compatibility documentation in the same change.

## Decisions

- Add a read-only operator CLI export, not a new public Fastify route. This export is parity evidence for operators and the Phase 13 diff harness; it is not yet a `web` runtime API contract.
- Keep the JSON schema backend-owned and versioned as `legacy-public-export.v1`.
- Reuse PostgreSQL aggregate tables for public player and squad totals, and use current parser-result event evidence for detail surfaces.
- Preserve legacy-facing field names where they are already known from local `~/sg_stats` reference data: `totalPlayedGames`, `killsFromVehicle`, `vehicleKills`, `teamkills`, `deaths.byTeamkills`, `kdRatio`, `totalScore`, `other_players`, `weapons`, and `weeks`.
- Do not include SSH hosts, key paths, or legacy snapshot capture steps in code or docs. The export reads only this app database.
- Treat OpenAPI as unchanged for this phase unless implementation proves a public API is necessary. API-05 will be satisfied by documenting no public API shape change and running `pnpm run openapi:check`.

## Assumptions

- Phase 09 has preserved compact counter evidence needed for `killsFromVehicle` and `vehicleKills`.
- Phase 10 provides full-run recalculation so aggregate rows are current before export.
- Phase 11 provides readiness reporting so missing rotations or unresolved no-SteamID identities can be handled before parity conclusions.
- The export may include additional normalized metadata around legacy-like fields as long as legacy comparison inputs remain deterministic and documented.

## Risks

- Legacy `score` and weekly scoring semantics are not fully owned by existing v1 aggregate tables. This phase should document the backend export formula clearly so Phase 13 can compare or flag differences instead of hiding them.
- Relationships, weapons, and weeks require replay-level event evidence, so the export must avoid ad hoc raw OCAP parsing and use persisted parser snapshots/events.
- The export must not silently broaden allowlists. Parser-level public-normalization rules belong in the export contract and later diff policy.

## Output Shape

Phase 12 should produce:

- `pnpm run ops:stats:legacy-export` that prints deterministic JSON to stdout.
- A legacy public export service with deterministic metadata and stable sorting.
- A PostgreSQL read model for player totals, squad totals, rotation totals, relationship surfaces, weapon surfaces, and weekly buckets.
- Operator documentation for the export command, metadata, field formulas, and OpenAPI non-change.
- Verification artifacts and requirement traceability updates.
