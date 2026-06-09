# Phase 15: Profile Parity Stats - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning
**Mode:** Autonomous (grey areas auto-decided)

<domain>
## Phase Boundary

Public player and squad profiles expose the already-computed parity surfaces — per-player/per-squad
weapon stats, vehicle stats, pvp-relationship stats (killed/killers/teamkilled/teamkillers), weekly
stat buckets, and KD ratio / score / total games — with values **byte-identical to the legacy CLI
export**. Requirements: PARITY-01..06.

The architecture is already locked (STATE.md): parity reads run as **per-entity-scoped queries over a
single shared extracted `parity-sql` source** — never the bulk full-corpus `parser_events` seq-scan
SQL in hot paths. The CLI legacy-export output must stay byte-identical after the SQL is extracted
into the shared source.

Not in scope: production traffic cutover (parity is review evidence, not auto-cutover); slug
resolution / history (Phase 16); replay surfaces (Phase 17).

</domain>

<decisions>
## Implementation Decisions

### Surface Endpoint Layout
- Expose each parity surface as a **sub-resource endpoint** of the existing profile routes:
  `GET /players/:id/weapons`, `/players/:id/vehicles`, `/players/:id/relationships`,
  `/players/:id/weekly`, plus the squad equivalents `GET /squads/:id/...`.
- Rationale: clean REST, per-surface cacheability, smaller payloads, and each surface maps to a
  single per-entity-scoped `parity-sql` query. Keeps the existing `PlayerProfileResponse` /
  `SquadProfileResponse` shapes stable while adding KD/score/total-games to the profile stats object.

### Field Contract & Computation
- **KD ratio, score, total games** are computed **server-side** using the legacy-export formulas and
  exposed as numbers on the profile stats object (extend `PlayerStatsResponse` / `SquadStatsResponse`).
  Guarantees byte-identical parity and a frozen contract for `web`. Web never recomputes.
- Weapon surface: array of `{ weaponGroup: "firearms"|"vehicles", weaponName, kills }`.
- Vehicle surface: vehicle-kill counters per the legacy `vehicle_kills` / `kills_from_vehicle` split.
- Relationship surface: four typed lists (killed / killers / teamkilled / teamkillers), each an array
  of `{ player: { id, displayName }, count }`.
- Weekly surface: array of `{ week, startDate, endDate, kills, deaths, teamkills, ... }` buckets
  matching the legacy `WeekRow` shape.

### Identity & Masking
- Relationship targets identified by the existing `PlayerReferenceResponse` shape (`{ id, displayName }`)
  — **no SteamID, masked or otherwise**, consistent with the Phase 14 masking choke-point and SEC-01/02.
- All masking continues to be enforced at the row→payload mapper boundary; no parity surface may emit a
  full or masked Steam64 beyond the established profile masked-last-4 field.

### Pagination
- Per-entity parity lists (weapons, vehicles, weekly buckets, relationships) are returned as **bounded
  embedded arrays**, NOT cursor-paginated. These sets are naturally small/finite per entity, so the
  Phase 14 cursor contract is unnecessary overhead. List *collection* endpoints (players/squads) keep
  their cursor contract from Phase 14 unchanged.

### parity-sql Extraction (architecture, already locked)
- Extract the per-surface SQL currently embedded in `src/modules/statistics/repository/legacy-export.ts`
  (PLAYER_STATS_SQL, SQUAD_STATS_SQL, RELATIONSHIPS_SQL, WEAPONS_SQL, WEEKS_SQL, plus the shared
  `PLAYER_ENTITY_CTE`) into a single shared `parity-sql` source consumed by BOTH the legacy CLI export
  and the new per-entity-scoped API reads.
- API reads add a per-entity `WHERE` predicate (scoped to one player/squad id) so they never seq-scan
  the full `parser_events` corpus. The CLI export keeps consuming the unscoped form.
- **Invariant:** after extraction, the CLI legacy export output stays byte-identical (guarded by the
  existing `legacy-export` / `legacy-public-export` tests).

### Resolved Research Questions (autonomous decisions, locked)
- **Q1 — parity-sql module shape:** Extract into a module beside `legacy-export.ts` (e.g.
  `src/modules/statistics/repository/parity-sql.ts`) that exports the shared `PLAYER_ENTITY_CTE` plus a
  per-surface **builder** returning `{ sql, values }`. The **unscoped** form (no scope arg) MUST produce
  a string byte-identical to today's constant — `legacy-export.ts` consumes the unscoped builder. The
  **scoped** form appends a parameterized predicate (`$1::uuid` / `$1::text`) on the entity id. Add an
  optional assert-test that the unscoped builder equals the legacy constant.
- **Q2 — vehicle surface (PARITY-02):** Expose **both** — the player-stats vehicle counters
  (`vehicleKills`, `killsFromVehicle`, and `killsFromVehicleCoef`) on the profile stats object (sourced
  from `counter_totals`, the true legacy player-stats fields), AND the `vehicles` weapon-group list from
  the weapon surface (`weapon_group='vehicles'`). These are distinct semantics (counters vs
  destroyed-vehicle kills by weapon) and both belong to PARITY-02.
- **Q3 — squad parity scope (PARITY-06):** Squad profiles MUST expose KD / score / total games (extend
  `SquadStatsResponse`, byte-identical to `SQUAD_STATS_SQL`) plus the existing member player list. Squad
  `/weapons`, `/weekly`, `/relationships` sub-resources ARE provided as **documented member-level
  aggregations** (sum/union over the squad's members using the same scoped parity-sql), since no legacy
  squad-level formula exists. Byte-identical is guaranteed only for surfaces present in the legacy export
  (all player surfaces + squad KD/score/games + member list); squad aggregate surfaces are documented as
  deterministic member sums, not legacy-parity numbers. This satisfies "equivalent parity surfaces"
  without fabricating non-parity values or scope creep.
- **Q4 — formula layering:** Extract the shared pure formulas (`kdRatio`, `totalScore`, `weeklyScore`,
  `killsFromVehicleCoef`) into a pure module (e.g. `src/modules/statistics/parity-formulas.ts`) imported
  by both the legacy export and the new API mappers. Pure-function cross-module import is an accepted
  domain utility (does not require a service contract).

### Claude's Discretion
- Exact module/file names and the builder API surface details (within the Q1/Q4 shapes above).
- Field naming details within the new response schemas (keep consistent with existing camelCase TypeBox
  conventions and the masking field naming chosen in Phase 14).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/modules/statistics/repository/legacy-export.ts` — holds all parity SQL today: `PLAYER_ENTITY_CTE`
  (lines 159-205), `PLAYER_STATS_SQL`, `SQUAD_STATS_SQL`, `ROTATION_STATS_SQL`, `RELATIONSHIPS_SQL`,
  `WEAPONS_SQL`, `WEEKS_SQL`. This is the extraction source for shared `parity-sql`.
- `src/modules/statistics/export/legacy-public-export.ts` — the export contract / input types
  (`LegacyWeaponsInput`, `LegacyWeekInput`, `LegacyOtherPlayersInput`, etc.) the SQL feeds.
- `src/modules/public-stats/routes/schemas.ts` — `PlayerStatsResponse` (58-66), `SquadStatsResponse`
  (81-90), `PlayerProfileResponse` (73-79), `SquadProfileResponse` (97-107), `PlayerReferenceResponse`
  (109-112), `paginated()` helper (159-165). New surface schemas added here.
- `src/modules/public-stats/repository.ts` — profile mappers + masking choke point.

### Established Patterns
- Raw `pg` Pool, parameterized SQL (`$1`...), no ORM. Per-entity scoping = add a parameterized
  `WHERE entity_id = $1` predicate to the extracted CTE/query.
- Route schemas via TypeBox `@fastify/type-provider-typebox`; OpenAPI auto-generated by
  `@fastify/swagger` on boot from registered schemas.
- Masking enforced at row→payload mapper boundary (Phase 14).

### Integration Points
- Byte-identical guard: `src/modules/statistics/repository/tests/legacy-export.test.ts` and
  `src/modules/statistics/export/tests/legacy-public-export.test.ts` + `src/operations/export-legacy-public-stats.test.ts`
  must keep passing unchanged after extraction.
- New endpoints register under the existing public-stats route module; profile stats object extension
  must regenerate the OpenAPI contract on boot.

</code_context>

<specifics>
## Specific Ideas

- Single shared `parity-sql` source consumed by both CLI export and API — this is the explicit
  STATE.md decision; do not duplicate SQL.
- Per-entity-scoped queries only on hot API paths; no full-corpus `parser_events` seq scan.
- Byte-identical legacy export output is a hard acceptance gate.

</specifics>

<deferred>
## Deferred Ideas

- Cursor pagination of parity sub-surfaces — rejected (bounded per-entity data).
- Masked SteamID inside relationship targets — rejected (id+displayName only).
- Production traffic cutover — out of milestone scope.

</deferred>
