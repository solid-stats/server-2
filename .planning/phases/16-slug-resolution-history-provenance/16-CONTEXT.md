# Phase 16: Slug Resolution, History & Provenance - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning
**Mode:** Autonomous (grey areas auto-decided — user is asleep, full-auto until v3.0 milestone complete)

<domain>
## Phase Boundary

Public resources become **addressable by slug** (not only UUID) and carry **history timelines** and
**freshness/provenance metadata**. Requirements: API-01, HIST-01, HIST-02, HIST-03.

Concretely this phase delivers:
1. A new indexed `slug` column on the canonical public entities (`canonical_players`, `squads`,
   `rotations`) **and `replays`** — added in **one shared migration** that Phase 17 (Replay Surface)
   reuses without its own migration (the ROADMAP explicitly calls this "the new migration shared with
   the replay surface").
2. Slug-or-UUID resolution on the existing public detail routes, fully backward-compatible (UUID paths
   keep working).
3. Player nickname/alias history (timestamps + explicit unknown gaps) and player↔squad membership
   history (dates + explicit unknown gaps), exposed as bounded sub-resource endpoints.
4. A `provenance` / last-updated envelope on the singular public stat responses, populated from the
   actual rows returned (not a wall-clock now()).

Not in scope: replay list/detail/timeline/sitemap (Phase 17); admin rotation CRUD / winner-fix
(Phase 18); contract freeze + CI diff gate (Phase 19); production traffic cutover.

</domain>

<decisions>
## Implementation Decisions

### Slug Column & Shared Migration
- Add migration `0006_*.sql` (next lexicographic number after `0005_keyset_indexes.sql`) that adds a
  `slug text` column to **`canonical_players`, `squads`, `rotations`, and `replays`**, each with a
  **partial UNIQUE index** (`unique (slug) where slug is not null`) plus a plain btree index for lookup.
  Including `replays.slug` here is the "shared migration" the ROADMAP references — Phase 17 consumes it
  with no further migration.
- **Backfill in the same migration**: generate deterministic slugs for all existing rows from their
  human-readable name (`display_name` / `name` / a replay-identifying field), slugified
  (lowercase, ASCII-fold, non-alnum → `-`, collapse/trim dashes). Resolve collisions deterministically
  by appending `-<short-suffix>` derived from the row `id` (e.g. first 6 hex of the uuid) so backfill is
  idempotent and order-independent. Rows whose name is empty/unslugifiable fall back to an id-derived
  slug (`p-<short>` / `s-<short>` / `r-<short>` / `replay-<short>`).
- **New rows**: slug is assigned at the canonical-entity creation/promotion code path (app-level), using
  the same pure slugify+collision helper, inside the existing insert transaction. No DB trigger (keep
  slug logic in one tested TS helper, consistent with the repo's "explicit SQL, no magic" pattern).
- Slug is **immutable** for v1 (no rename/redirect handling) — renames/alias-redirects are out of scope
  and noted as deferred. Keeps the contract simple ahead of the Phase 19 freeze.

### Slug-or-UUID Resolution
- The existing detail routes (`GET /stats/players/:id`, `GET /stats/squads/:id`) accept **either a UUID
  or a slug** in the `:id` path segment. Relax the route param schema from `format:"uuid"` to a plain
  string with a bounded pattern; the repository resolver branches on "looks like a UUID" → lookup by
  `id`, else → lookup by `slug`. Unknown → existing 404 path. This is additive and backward-compatible.
- Add a **rotation detail route** `GET /stats/rotations/:id` (slug-or-uuid) so rotations are resolvable
  by slug per API-01 (today only a rotation *list* exists). Returns the existing
  `RotationSummaryResponse` shape extended with `slug` (and the provenance envelope).
- Expose `slug` as a field on the player / squad / rotation summary+profile response schemas so clients
  can build slug URLs. Sub-resource (history) routes are reached via the already-resolved entity id, so
  they do not each need independent slug resolution — but the parent route resolves slug→id first.

### History Endpoints (HIST-01, HIST-02)
- **Name/alias history** — `GET /stats/players/:id/name-history`: ordered timeline sourced directly from
  `player_nicknames` (`observed_from`, `observed_to`, `nickname`, `source_replay_id`). Each entry:
  `{ kind: "alias", nickname, from, to, sourceReplayId | null }` where `to` is null for an open/current
  window. The existing flat `aliases` array on the profile stays unchanged (additive: history is the new
  time-series surface).
- **Player membership history** — `GET /stats/players/:id/membership-history`: timeline from
  `squad_memberships` filtered by `player_id`, each entry
  `{ kind: "membership", squad: { id, slug, name }, from, to }` (`valid_from`/`valid_to`).
- **Squad membership history** — `GET /stats/squads/:id/membership-history`: same table filtered by
  `squad_id`, each entry `{ kind: "membership", player: { id, slug, displayName }, from, to }`.
- **Explicit unknown gaps** (required by success-criterion 2): the timeline is returned as a
  discriminated-union array; where there is a temporal gap between consecutive known windows (or before
  the first / after the last known window when bounded by the entity's first/last observed activity),
  emit an explicit `{ kind: "unknown-gap", from, to }` entry rather than silently omitting it. A gap
  whose bound is genuinely unknown uses `null` for that side. The endpoint never fabricates membership
  it cannot evidence — gaps are first-class.
- Sort all timelines ascending by `from` (nulls-first for unknown lower bound).

### Provenance / Last-Updated Envelope (HIST-03)
- Add a `provenance` object to the **singular** public stat responses (player profile, squad profile,
  rotation detail, and the Phase 15 parity sub-resources + the new history responses):
  `provenance: { lastUpdatedAt: string | null }` (ISO-8601 UTC, nullable when no backing rows).
- **Populated from the actual rows returned**, computed at the row→payload mapper boundary (same
  choke-point discipline as masking): `lastUpdatedAt = max` over the timestamps of the rows that
  actually produced this response — `player_stats.calculated_at` / `squad_stats.calculated_at` for stat
  payloads, `max(observed_to/observed_from)` or `max(valid_to/valid_from)` for history payloads,
  `canonical_players.updated_at` / `squads.updated_at` as a floor. Never `now()`.
- **List / paginated responses keep the Phase 14 cursor envelope unchanged** — provenance is a per-
  resource freshness signal, semantically awkward per-page, and adding it to list shapes would churn the
  pagination contract right before the Phase 19 freeze. HIST-03 ("public stat *responses*") is satisfied
  by the singular stat + profile + history responses.

### Identity & Masking (carried from Phase 14/15, non-negotiable)
- No full or masked Steam64 in any new surface beyond the established profile masked-last-4 field.
  Membership/alias history identifies the counterpart entity by `{ id, slug, name|displayName }` only.
- Masking + provenance both enforced at the mapper boundary; no new code path may emit
  `7656119\d{10}`. The Phase 14 leak-guard test pattern is extended to cover the new endpoints.

### Pagination
- All new history surfaces are **bounded embedded arrays** (consistent with the Phase 15 parity-surface
  decision) — per-entity name/membership history is naturally small/finite, so the Phase 14 cursor
  contract is unnecessary overhead. List *collection* endpoints keep their cursor contract unchanged.

### Contract / OpenAPI
- All schema additions are **additive** (new fields, new routes) — backward-compatible for `web`'s
  generated client. Regenerate `openapi/server-2.openapi.json` on boot and keep `openapi:check` green.
  The hard freeze + breaking-change diff gate is Phase 19, so additive evolution now is in-bounds.

### Claude's Discretion
- Exact migration filename suffix, slugify helper module location/name, and the bounded slug regex.
- Exact route path spellings for history sub-resources (within the `/stats/{entity}/:id/...` family) and
  response field naming, kept consistent with existing camelCase TypeBox conventions.
- Whether the slug resolver is a shared repository helper vs inlined per route (prefer one shared,
  tested helper).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/infra/db/migrations/0001_v1_domain_schema.sql` — entity tables: `canonical_players` (id,
  display_name, created_at, updated_at), `squads` (id, name UNIQUE, tag, updated_at), `rotations` (id,
  name UNIQUE, starts_at, ends_at). **No slug anywhere.**
- `player_nicknames` (0001) — `nickname`, `observed_from`, `observed_to`, `source_replay_id`, unique
  `(player_id, nickname, observed_from)`, indexed by player + lower(nickname). **Ready-made alias-history
  source.**
- `squad_memberships` (0001) — `squad_id`, `player_id`, `valid_from`, `valid_to`, `source_replay_id`,
  check `(valid_to is null or valid_to >= valid_from)`, indexed `(squad_id, valid_from)` /
  `(player_id, valid_from)`. **Ready-made membership-history source.**
- Provenance candidates: `canonical_players.updated_at`, `squads.updated_at`,
  `player_stats.calculated_at`, `squad_stats.calculated_at`, `parser_results.created_at`,
  `replays.replay_timestamp` (all defined, none surfaced today).
- `src/infra/db/migrations/migrate.ts` — declarative file runner: lexicographic `.toSorted()`,
  checksummed in `schema_migrations`, append-only, idempotent. Next file = `0006_*.sql`.
- `src/modules/public-stats/routes/routes.ts` — child Fastify scope; detail routes
  `/stats/players/:id` (~178), `/stats/squads/:id` (~293), `/stats/rotations` list (~146); mixed-param
  guard + `mapPublicStatsError`.
- `src/modules/public-stats/routes/schemas.ts` — `UuidParameters` (~20, `format:"uuid"`),
  `PlayerProfileResponse` (~129), `SquadProfileResponse` (~155), `RotationSummaryResponse` (~52),
  `PlayerReferenceResponse`, `paginated()` helper. New slug field + history schemas + provenance go here.
- `src/modules/public-stats/repository.ts` — profile mappers + masking choke point; current alias
  aggregation flattens nicknames (~304-306); current member query (~724-738) ignores temporal validity.
- `src/modules/statistics/repository/parity-sql.ts` — temporal nickname/membership window patterns
  (observed_from/to filtering, membership valid_from ordering) to mirror for history queries.

### Established Patterns
- Raw `pg` Pool, parameterized SQL, no ORM. Per-entity scoping via parameterized `WHERE`.
- Routes via TypeBox `@fastify/type-provider-typebox`; OpenAPI auto-generated by `@fastify/swagger` at
  boot (`register-openapi.ts`).
- Masking (and now provenance) enforced at the row→payload mapper boundary.

### Integration Points
- New migration must keep the existing migration tests / boot migration green; backfill must be
  idempotent (re-runnable checksum-stable file).
- New endpoints register under the existing public-stats route module; schema additions regenerate the
  OpenAPI contract on boot (`openapi:check` gate).
- Phase 14 Steam64 leak-guard test extended to cover slug, history, and provenance responses.
- `web` regenerates types from OpenAPI — additive only this phase; breaking freeze is Phase 19.

</code_context>

<specifics>
## Specific Ideas

- ONE shared migration adds slug to players/squads/rotations **and replays** so Phase 17 needs no
  migration (explicit ROADMAP instruction: "indexed `slug` column added in the new migration shared with
  the replay surface").
- History is built on the **already-existing** temporal tables (`player_nicknames`,
  `squad_memberships`) — no new history tables, just new read methods + response shapes.
- Provenance value is derived from the **actual rows returned**, never `now()` — this is the literal
  success-criterion wording.
- Unknown coverage gaps are **explicit timeline entries**, never silent omissions.

</specifics>

<deferred>
## Deferred Ideas

- Slug rename / historical-slug redirect handling — rejected for v1 (slugs immutable; keeps contract
  simple before the Phase 19 freeze).
- Provenance envelope on list/paginated responses — rejected (per-page freshness is semantically
  awkward and would churn the pagination contract pre-freeze).
- Masked SteamID inside history counterpart entities — rejected (id + slug + name only).
- Replay list/detail/timeline/sitemap consumption of `replays.slug` — Phase 17.
- Admin rotation CRUD that would *write* slugs — Phase 18.
- Production traffic cutover — out of milestone scope.

</deferred>
