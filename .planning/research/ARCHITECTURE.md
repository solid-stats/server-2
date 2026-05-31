# Architecture Research

**Domain:** Public read API surface completion on an existing Fastify/TypeBox/PostgreSQL backend (server-2, milestone v3.0 "Public API v1")
**Researched:** 2026-05-31
**Confidence:** HIGH (grounded in the real source tree, not training data)

> Scope: how the NEW v3.0 capabilities integrate with the EXISTING module structure. Every recommendation below names a real file. "New" vs "Modified" is called out explicitly. No new aggregation is proposed — the data already exists.

---

## Standard Architecture

### System Overview (existing, with v3.0 additions marked `+`)

```text
HTTP LAYER  (Fastify + @fastify/type-provider-typebox)
  src/app.ts  ->  registerXxxRoutes(app, options)  per module
    public-stats   ingest        requests      operations
     /stats/*      (mod/admin)   (auth/mod)    health/metrics
    + /replays                   + winner-fix (already exists)
    + slug res.
  TypeBox schemas + tags["public-stats"] -> OpenAPI auto-gen

READ MODEL / SERVICE LAYER  (interfaces; in-memory + Pg impls)
  PublicStatsReadModel (interface in routes/models.ts)
  + ReplayReadModel (NEW interface)
  LegacyPublicStatsExportService (export/legacy-public-export.ts)
  + shared masking / cursor-pagination / provenance helpers (NEW)

REPOSITORY LAYER  (raw pg SQL, one class per concern)
  PgPublicStatsReadModel (public-stats/repository.ts)
  PgLegacyPublicStatsExportRepository
       (statistics/repository/legacy-export.ts)  <- owns parity SQL today
  + PgReplayReadModel (NEW)

PostgreSQL  (single source of truth — schema already complete)
  canonical_players, player_nicknames, player_steam_ids, squads,
  squad_memberships, rotations, replays, parse_jobs, parser_results,
  parser_events, player_stats, squad_stats, commander_side_stats,
  bounty_points   (NO new tables needed except optional slug columns)
```

### Component Responsibilities (existing conventions, verified)

| Component | Responsibility | How it's built here |
|-----------|----------------|---------------------|
| `routes/routes.ts` | Register HTTP routes, bind TypeBox schemas + `tags`, delegate to read model | `app.get<{...}>(path, { schema }, handler)`; handler only calls `options.readModel.*` |
| `routes/schemas.ts` | TypeBox request/response schemas + `Static<>` types | One file of `Type.Object(...)` consts; OpenAPI derives from these |
| `routes/models.ts` | Read-model **interface** + domain payload types | `PublicStatsReadModel` interface; Pg + empty impls both satisfy it |
| `routes/filters.ts` | Query -> filter/page object mappers | Pure functions (`page()`, `rotationFilters()`) |
| `repository.ts` | Pg implementation of the read-model interface | `class PgXxx implements XxxReadModel`; raw `pool.query` + row→payload mappers |
| `statistics/export/*` | Pure transform service (sort/derive) over repository data | `LegacyPublicStatsExportService` takes a repository interface |
| `statistics/repository/legacy-export.ts` | The rich parity SQL (weapons/vehicles/relationships/weekly/KD/score) | `PgLegacyPublicStatsExportRepository.loadExportData()` |

**Key existing convention:** every route module is wired in `src/app.ts` via `registerXxxRoutes(app, { readModel })`, with a `createEmpty…ReadModel()` no-op default for tests/OpenAPI export and an in-`server.ts` `Pg…` implementation for production. The empty/Pg split is load-bearing — follow it for every new surface.

---

## The Central Decision: Reuse vs Refactor the Legacy-Export SQL

**Question (1):** Should the new `/stats/players/:id` and `/stats/squads/:id` parity surfaces reuse the export repository, or be refactored so CLI export and routes share one source?

### Recommendation: Refactor the SQL into a shared, per-entity read model — do NOT call the bulk export from request handlers, and do NOT copy-paste the SQL.

**Reasoning (grounded in the real code):**

1. **The export repository is corpus-wide and unfilterable.** `PgLegacyPublicStatsExportRepository.loadExportData()` (`statistics/repository/legacy-export.ts:91`) runs **seven `Promise.all` full-table scans** (`PLAYER_STATS_SQL`, `RELATIONSHIPS_SQL`, `WEAPONS_SQL`, `WEEKS_SQL`, etc.) and returns *every* player. A request for one player must not trigger a full-corpus aggregation — calling `LegacyPublicStatsExportService.export()` per-request is O(corpus) cost for an O(1) lookup.

2. **But the SQL itself is the asset and must not be duplicated.** The valuable, hard-won logic is the `PLAYER_ENTITY_CTE` identity-resolution CTE (`legacy-export.ts:159`) plus the weapons/relationships/weekly aggregations. Re-deriving these in `public-stats/repository.ts` creates two diverging copies of parity-critical SQL — exactly the drift the v2.0 diff-contract work exists to prevent.

3. **The pure transforms are already reusable and per-entity-safe.** `playerExport`, `kdRatio`, `killsFromVehicleCoef`, `totalScore`, `weeklyScore`, `weekExport`, `squadExport` in `legacy-public-export.ts` are pure functions on a single player/squad input. Routes can and should call these directly for KD/score/coef derivation so numbers stay identical to the export.

**Concrete refactor (the "share one source" path):**

- **Extract the SQL fragments into a shared module.** Move `PLAYER_ENTITY_CTE`, `RELATIONSHIPS_SQL`, `WEAPONS_SQL`, `WEEKS_SQL` out of `statistics/repository/legacy-export.ts` into a NEW `statistics/repository/parity-sql.ts` that exposes them as builders, parameterized to accept an optional `where player_id = $1` / `where squad_id = $1` predicate.
- **Add a per-entity read path.** A NEW `getPlayerWeapons/Relationships/Weekly(id, …)` (on `PgPublicStatsReadModel` or a NEW `PgPlayerParityReadModel`) runs the *same* CTE + aggregations scoped to one entity, then feeds rows through the existing pure transforms.
- **`PgLegacyPublicStatsExportRepository` keeps consuming the same shared SQL fragments unchanged** — CLI export and routes now read from one SQL source of truth.

This satisfies the locked decision in `V2-CUTOVER-REVIEW.md:25` ("Wire `repository/legacy-export.ts` SQL into the public read model") and the "primarily API-surface completion, not new aggregation" framing in `PROJECT.md:31`, while avoiding both duplication and corpus-wide per-request cost.

| Option | Verdict | Why |
|--------|---------|-----|
| Routes call `LegacyPublicStatsExportService.export()` | Reject | Full-corpus scan per request; no rotation/id filter |
| Copy SQL into `public-stats/repository.ts` | Reject | Two diverging copies of parity-critical SQL |
| **Extract SQL to `parity-sql.ts`, add per-entity scoped queries, reuse pure transforms** | **Recommend** | One SQL source; per-entity cost; identical derived numbers |

**Sub-resource vs fat object:** Expose parity as sub-resources — `/stats/players/:id/weapons`, `/stats/players/:id/relationships`, `/stats/players/:id/weekly` — rather than inflating `PlayerProfileResponse`. `PlayerProfileResponse` (`schemas.ts:60`) is already an `Intersect` of summary + aliases/steamIds; keep it lean and let heavy lists be separately cacheable/paginated. KD/score/totalGames are cheap scalars and can fold into the profile object.

---

## Capability-to-File Mapping (each new surface → closest existing pattern)

### (2) Replay surface — list / detail / events / sitemap

**Data sources (no new tables):**
- List/detail read `replays` (`0001_v1_domain_schema.sql:122`) joined to `rotations`. Filters rotation/date/map map onto `replays.rotation_id`, `replays.replay_timestamp`, and a map field inside `parser_results.raw_snapshot` (or `promotion_evidence`).
- Detail "sides/participants/provenance" read `parser_results` (status `'current'`) + `parser_events` (`event_type = 'player_counter'`), reusing the `PLAYER_ENTITY_CTE` identity resolution from `legacy-export.ts:159` so participant names match the rest of the API.
- Events timeline reads `parser_events` (`0001:182`) filtered by the result's `replay_id`, ordered by `occurred_at`, cursor-paginated.
- Sitemap = `select id from replays where status = 'parsed'` (enumerate-only).

**Where the new files go (mirror `public-stats` and `ingest` layout exactly):**

| New file | Purpose | Modeled on |
|----------|---------|-----------|
| `src/modules/public-stats/routes/replays/routes.ts` (NEW) | `GET /stats/replays`, `/:id`, `/:id/events`, `/sitemap` | `public-stats/routes/routes.ts` |
| `src/modules/public-stats/routes/replays/schemas.ts` (NEW) | TypeBox replay list/detail/event/sitemap schemas | `routes/schemas.ts` |
| `src/modules/public-stats/routes/replays/models.ts` (NEW) | `ReplayReadModel` interface + payload types | `routes/models.ts` |
| `src/modules/public-stats/replays-repository.ts` (NEW) | `PgReplayReadModel implements ReplayReadModel` | `public-stats/repository.ts` |

**Wiring (MODIFIED):** `registerPublicStatsRoutes` (`routes.ts:52`) gains a `registerReplayRoutes(app, options)` call; `PublicStatsRouteOptions` (`models.ts:25`) gains a `replayReadModel`; `app.ts:100` and `server.ts:76` pass an empty / `PgReplayReadModel` instance respectively. This is the largest single piece (per `V2-CUTOVER-REVIEW.md:28`) and the only one needing genuinely new SQL.

### (3) Server-side SteamID masking layer

**Locked:** full SteamIDs must never reach `web` (`PROJECT.md:29`, `V2-CUTOVER-REVIEW.md:15`).

**The leak today:** `PgPublicStatsReadModel.getPlayer` (`repository.ts:200`) selects raw `steam_ids` and `mapPlayerProfile` (`repository.ts:517`) passes them straight into `PlayerProfileResponse.steamIds: Type.Array(Type.String())` (`schemas.ts:65`). The `PLAYER_ENTITY_CTE` also joins on `payload#>>'{player,steam_id}'` but that stays server-side.

**Home:** a NEW pure module `src/modules/public-stats/steam-id-mask.ts` exporting `maskSteamId(full) -> "…last4"` (or hashed handle). Apply it at the **mapping boundary**, not in SQL — i.e. inside `mapPlayerProfile` and any replay participant mapper, so masking is enforced in one place all read models route through. Because masking is pure it gets a trivial unit test and the in-memory empty model needs no change.

**Why mapping-layer, not route-layer:** masking in the mapper guarantees every read model (public-stats + replays + future) inherits it; a per-route filter would be forgettable on the next endpoint. Pair it with an integration test asserting no response body matches a full-SteamID regex (a freeze-gate guard).

### (4) slug→id resolution

**State:** there are **no slug columns today** (`grep slug` -> zero hits) and all params are `UuidParameters = Type.Object({ id: Type.String({ format: "uuid" }) })` (`schemas.ts:10`). Web uses slug-only URLs (`V2-CUTOVER-REVIEW.md:16`).

**Recommendation:** add a **resolution endpoint** rather than slug-addressable routes, keeping UUID as the canonical key.
- New route `GET /stats/players/by-slug/:slug` and `/stats/squads/by-slug/:slug` returning `{ id }` (or the full profile), in `public-stats/routes/routes.ts` (MODIFIED) + a `slugFilters`-style helper in `filters.ts` (MODIFIED).
- Resolution method on `PublicStatsReadModel` (MODIFIED `models.ts`) + `PgPublicStatsReadModel` (MODIFIED `repository.ts`).
- **Slug source:** prefer a generated, indexed `slug` column on `canonical_players` / `squads` via a NEW migration `0005_public_slugs.sql` (`infra/db/migrations/`), backfilled from `display_name`/`name`. A `lower(name)`-normalization without a stored column is the fallback if collisions are acceptable, but a stored unique slug is more stable for SEO. This is the one place a small schema addition is justified.

### (5) Cursor pagination + sort as a shared helper

**Current state:** offset pagination is duplicated. `PaginationQuery` (`schemas.ts:4`) has `page`/`pageSize`; `paginated()` (`schemas.ts:146`) returns `{items,page,pageSize,total}`; `paginationValues()` (`repository.ts:479`) builds `limit/offset`; an **identical** `PaginationQuery` is copy-pasted in `ingest/routes/routes.ts:51`. The locked decision replaces all of this with cursor + server-side sort (`PROJECT.md:27`, `V2-CUTOVER-REVIEW.md:14`).

**Recommendation:** build it ONCE as a shared module and retrofit every list endpoint.
- NEW `src/modules/public-stats/pagination/cursor.ts` (or `src/infra/http/cursor-pagination.ts` if shared with ingest): exports a `CursorQuery` TypeBox schema (`cursor?`, `limit`, `sort`, `order`), a `cursorPaginated(itemSchema)` response wrapper (`{ items, nextCursor, ... }`), an `encodeCursor`/`decodeCursor` pair (opaque base64 of the sort-key tuple), and a `cursorWhere(sortColumn, cursor)` SQL fragment builder modeled on the existing `WhereClause`/`rotationWhere` helpers (`repository.ts:381`).
- MODIFY `schemas.ts`, `filters.ts`, `repository.ts` in `public-stats` (players/squads/bounty) and the replay list to consume it. Sort whitelist (e.g. `kills|name|date`) lives in the schema so OpenAPI documents allowed values.

**Anti-pattern to avoid:** keyset cursor over a non-unique sort column (`order by kills desc`, `repository.ts:183`) without a tiebreaker is unstable. Existing queries already tiebreak on `display_name`/`name`/`id` — the cursor MUST encode the full `(sortValue, id)` tuple to remain deterministic.

### (6) Provenance / last-updated metadata

**Available source columns:** `player_stats.calculated_at`, `squad_stats.calculated_at`, `bounty_points.calculated_at`, `commander_side_stats.calculated_at`, `replays.updated_at`, plus the export's existing `metadata.generatedAt`/`sourceDatabase`/`contractVersion` pattern (`legacy-public-export.ts:235`).

**Recommendation:** add an optional `provenance` block to stat responses, modeled on the export `metadata` object but per-response:
- NEW shared TypeBox `ProvenanceResponse = Type.Object({ lastUpdatedAt, source, contractVersion })` in `schemas.ts` (MODIFIED), intersected into profile/list responses.
- Populate `lastUpdatedAt` from `max(calculated_at)` of the rows actually returned (cheap, computed in the same query). Reuse the contract-version constant pattern (`LEGACY_PUBLIC_EXPORT_CONTRACT_VERSION`) so freshness semantics match the export the parity review trusts.

### Profile history timelines & winner-fix (in-scope, but already mostly wired)

- **Nickname/squad history:** `player_nicknames` (with `observed_from`/`observed_to`, `0001:40`) and `squad_memberships` (with `valid_from`/`valid_to`, `0001:79`) already carry timestamps. New read methods + sub-resource routes (`/stats/players/:id/nicknames`, `/stats/players/:id/squads`) mirror the parity sub-resource pattern; no schema change.
- **Manual commander-winner fix:** **already implemented** as the `legacy_winner_fix` workflow action (`requests/routes/workflows/workflows.ts:24`), applied by `PgRequestWorkflowApplier` which runs `update commander_side_stats` (per `workflow-applier.test.ts:78`). v3.0 only needs to confirm the moderator endpoint is contract-frozen; treat as **verify-and-document**, not build.

---

## Recommended Project Structure (additions only)

```text
src/
├── modules/public-stats/
│   ├── routes/
│   │   ├── routes.ts            # MODIFIED: + replay/slug/history registrations
│   │   ├── schemas.ts           # MODIFIED: + provenance, cursor, parity sub-resources
│   │   ├── filters.ts           # MODIFIED: + slug/cursor mappers
│   │   ├── models.ts            # MODIFIED: + new read-model methods
│   │   └── replays/             # NEW: replay surface (routes/schemas/models)
│   ├── repository.ts            # MODIFIED: + per-entity parity, slug, masking, provenance
│   ├── replays-repository.ts    # NEW: PgReplayReadModel
│   ├── steam-id-mask.ts         # NEW: pure masking fn
│   └── pagination/cursor.ts     # NEW (or src/infra/http/): shared cursor helper
├── modules/statistics/
│   ├── export/legacy-public-export.ts   # UNCHANGED: pure transforms reused by routes
│   └── repository/
│       ├── legacy-export.ts     # MODIFIED: consume shared parity-sql fragments
│       └── parity-sql.ts        # NEW: extracted CTE + weapons/relationship/weekly SQL
├── infra/db/migrations/
│   └── 0005_public_slugs.sql    # NEW: slug columns + backfill (only schema change)
└── openapi/register-openapi.ts  # MODIFIED (freeze): version 0.1.0 -> 1.0.0
```

### Structure Rationale

- **Replay sub-folder under `public-stats/routes/`** keeps the public read surface in one module instead of spawning a sibling module, matching how `ingest` keeps `actions` + `routes` together.
- **`parity-sql.ts` as a sibling of `legacy-export.ts`** makes "one SQL source" physically obvious and keeps the CLI export and routes importing the *same* strings.
- **Pure transforms stay in `export/`** — they have zero DB dependency and are already unit-tested, so both CLI and routes import them without a circular dependency.
- **Cursor helper at module or `infra/http` level** because `ingest` also duplicates pagination; promoting it to `infra` lets ingest converge later.

## Architectural Patterns

### Pattern 1: Empty-default + Pg-impl read model

**What:** Every route module declares an interface (`models.ts`), an in-memory empty default (`createEmpty…ReadModel`), and a `Pg…` class (`repository.ts`). `app.ts` wires the empty default; `server.ts` injects the Pg one.
**When to use:** every new surface (replay, parity, slug).
**Trade-offs:** a little boilerplate, but keeps route tests DB-free and makes the OpenAPI export (`openapi/schema.ts` builds the app with no DB) work unchanged.

```typescript
// NEW replays/models.ts
export interface ReplayReadModel {
  listReplays(filters: ReplayFilters, cursor: CursorQuery): Promise<CursorPage<ReplaySummary>>;
  getReplay(id: string): Promise<ReplayDetail | null>;
  listReplayEvents(id: string, cursor: CursorQuery): Promise<CursorPage<ReplayEvent>>;
  listReplayIds(): Promise<string[]>;
}
```

### Pattern 2: Shared SQL fragment, scoped predicate

**What:** Parity SQL lives once in `parity-sql.ts`; both the bulk export and the per-entity route pass a different `where` predicate into the same builder.
**When to use:** any read that must stay numerically identical to the parity export.
**Trade-offs:** builder functions are slightly more abstract than literal SQL, but eliminate CLI/API drift.

### Pattern 3: Mapping-layer enforcement (masking & provenance)

**What:** Cross-cutting output rules (SteamID masking, provenance attachment) live in the row→payload mappers, not in routes or SQL.
**When to use:** any rule that must hold for *every* endpoint returning the entity.
**Trade-offs:** mappers do slightly more, but the rule can't be forgotten on a new route.

## Data Flow

### Replay detail request flow (NEW surface)

```text
GET /stats/replays/:id
  -> Fastify (TypeBox params validate uuid)
  -> registerReplayRoutes handler -> options.replayReadModel.getReplay(id, filters)
  -> PgReplayReadModel: SELECT replays JOIN rotations
       + parser_results(status='current') + parser_events(player_counter)
       reusing PLAYER_ENTITY_CTE for participant identity
  -> row→payload mapper (applies maskSteamId, attaches provenance.lastUpdatedAt)
  -> ReplayDetailResponse (TypeBox) -> OpenAPI-validated JSON
```

### Player parity request flow (refactored shared SQL)

```text
GET /stats/players/:id/weapons
  -> PgPublicStatsReadModel.getPlayerWeapons(id)
  -> parity-sql WEAPONS fragment scoped to `where player_id = $1`  (shared with CLI export)
  -> rows -> mapWeapons (existing) -> sortWeapons (existing pure fn from export)
  -> WeaponsResponse (TypeBox)
```

### Masking enforcement point (single choke)

```text
any read model -> row→payload mapper -> maskSteamId(full) -> response
                                          ^ the ONLY place steam_id leaves the server
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k users | Current single-VPS Docker Compose + raw `pg` pool is fine. Per-entity parity queries are cheap. |
| 1k–100k users | Replay list & event timeline are the hot paths — ensure `idx_replays_rotation_timestamp` covers list filters; add an index on `parser_events(parser_result_id, occurred_at)` for the timeline cursor. Cursor (vs offset) keeps deep pages cheap. |
| 100k+ users | Cache sitemap and corpus-wide parity behind the existing export artifact rather than live SQL; consider read replicas. Out of v1 scope. |

### Scaling Priorities

1. **First bottleneck:** replay event timeline (`parser_events` is the largest table). Fix: keyset cursor on `(occurred_at, id)` + supporting index, never offset.
2. **Second bottleneck:** the `PLAYER_ENTITY_CTE` re-runs per parity sub-resource. Fix if needed: scope tightly to one entity (already the plan) before considering a materialized identity map.

## Anti-Patterns

### Anti-Pattern 1: Calling the bulk export service from a request handler

**What people do:** `options.export.export()` inside `GET /stats/players/:id`.
**Why it's wrong:** seven full-table `Promise.all` scans (`legacy-export.ts:91`) for one player.
**Do this instead:** per-entity scoped queries over shared `parity-sql.ts` fragments.

### Anti-Pattern 2: Masking SteamIDs in some routes only

**What people do:** add `.map(maskSteamId)` in the player route, forget the replay participant route.
**Why it's wrong:** full IDs leak via the path nobody remembered (`PROJECT.md:29` violation).
**Do this instead:** mask in the shared row→payload mapper; add a freeze-gate integration test scanning for full-ID regex.

### Anti-Pattern 3: Cursor over a non-unique sort key without a tiebreaker

**What people do:** `order by kills desc` cursor on `kills` alone.
**Why it's wrong:** ties cause skipped/duplicated rows across pages.
**Do this instead:** encode `(sortValue, id)` — the queries already tiebreak on `id` (`repository.ts:183`).

### Anti-Pattern 4: Duplicating the parity SQL into `public-stats/repository.ts`

**What people do:** copy `WEAPONS_SQL`/`RELATIONSHIPS_SQL` to avoid touching `statistics/`.
**Why it's wrong:** two copies drift; defeats the v2.0 diff-contract guarantee.
**Do this instead:** extract to `parity-sql.ts`, import from both.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `public-stats/replays` ↔ `statistics/repository/parity-sql.ts` | direct import of SQL fragments | participant identity uses the same `PLAYER_ENTITY_CTE` |
| `public-stats/repository.ts` ↔ `statistics/export/legacy-public-export.ts` | import pure transforms (`playerExport`, `weekExport`, `kdRatio`) | keeps derived numbers identical to CLI export |
| route modules ↔ `app.ts`/`server.ts` | `registerXxxRoutes(app, { readModel })` + empty/Pg injection | every new surface must add both an empty default and a Pg impl |
| winner-fix ↔ `commander_side_stats` | existing `legacy_winner_fix` workflow | already built; verify + freeze only |
| all responses ↔ OpenAPI | TypeBox `schema` + `tags` auto-generate; `openapi:verify` drift gate | freeze = bump `register-openapi.ts` version 0.1.0 -> 1.0.0, wire `test:integration` into CI gate |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PostgreSQL | raw `pg` Pool injected into every Pg read model | no ORM; follow existing `pool.query<RowType>(sql, values)` style |
| `web` (consumer) | generates types via `openapi-typescript` from `openapi/server-2.openapi.json` | the freeze gate (`openapi:check`) is the contract handshake |

## Dependency-Aware Build Order

The freeze (G) gates web type generation, so everything precedes it. Within the build, shared helpers precede the surfaces that consume them.

1. **Shared cursor pagination helper** (`pagination/cursor.ts`, NEW) — every list endpoint depends on it; build and unit-test first. *(blocks parity-lists, slug, replay-list)*
2. **SteamID masking module** (`steam-id-mask.ts`, NEW) — pure, no deps; wire into existing `mapPlayerProfile` immediately so the leak (`repository.ts:517`) closes early.
3. **Extract parity SQL** (`statistics/repository/parity-sql.ts`, NEW; `legacy-export.ts` MODIFIED to consume) — must precede parity routes so there is one SQL source. Verify CLI export output stays byte-identical after extraction (`legacy-public-export.test.ts` + diff-contract guard this).
4. **Parity sub-resource routes** (players/squads weapons/vehicles/relationships/weekly + KD/score on profile) — depends on (3) for SQL, (1) where lists paginate, reuses pure transforms.
5. **Slug resolution** (migration `0005`, NEW; `routes`/`models`/`repository` MODIFIED) — independent of parity; parallel to 4.
6. **Provenance metadata** (`ProvenanceResponse` schema + `max(calculated_at)` in queries) — small, layered onto 4's responses.
7. **Replay surface** (`replays/*` NEW + `replays-repository.ts` NEW) — largest piece; depends on (1) cursor and (2) masking; uses `PLAYER_ENTITY_CTE` from (3). Start after the smaller stat surfaces are proven.
8. **History timelines** (nickname/squad sub-resources) — pure additions on existing timestamped tables; parallel-safe with 7.
9. **Winner-fix endpoint** — verify/freeze only; the `legacy_winner_fix` workflow already exists.
10. **Contract freeze (G)** — bump `register-openapi.ts` `0.1.0 -> 1.0.0`, publish `openapi/server-2.openapi.json`, wire `test:integration` into the CI freeze gate (`package.json:26,31,38`). MUST be last.

**Parallelization:** 4, 5, 6, 8 can proceed concurrently once 1–3 land; 7 is the long pole and should start as soon as 1–2 are ready. The "fast-unblock" path from `V2-CUTOVER-REVIEW.md:64` (freeze the read-stats subset 1–6,8 first, then 7, then full freeze) is viable and recommended if `web` needs to start stats screens early.

## Sources

- `src/modules/public-stats/routes/{routes,schemas,filters,models}.ts` — existing public-stats route/schema/read-model conventions (HIGH, read directly)
- `src/modules/public-stats/repository.ts` — Pg read model, masking leak site, pagination helpers (HIGH)
- `src/modules/statistics/export/legacy-public-export.ts` + `statistics/repository/legacy-export.ts` — parity transforms and the rich SQL/CTE (HIGH)
- `src/infra/db/migrations/0001_v1_domain_schema.sql` — full schema; confirms no new tables needed except slug columns (HIGH)
- `src/app.ts`, `src/server.ts` — empty-default/Pg-impl wiring pattern (HIGH)
- `src/modules/requests/routes/workflows/workflows.ts` + `workflow-applier.test.ts` — existing `legacy_winner_fix` workflow (HIGH)
- `src/openapi/register-openapi.ts`, `package.json` — OpenAPI version / freeze gate (HIGH)
- `.planning/PROJECT.md`, `.planning/V2-CUTOVER-REVIEW.md` — locked v3.0 decisions (HIGH)

---
*Architecture research for: public read API surface completion on an existing Fastify/TypeBox/PostgreSQL backend*
*Researched: 2026-05-31*
