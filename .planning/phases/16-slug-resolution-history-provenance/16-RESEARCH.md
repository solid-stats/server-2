# Phase 16: Slug Resolution, History & Provenance - Research

**Researched:** 2026-06-07
**Domain:** TypeScript 6 / Fastify 5 backend — slug addressing, temporal history timelines, provenance metadata over a raw `pg` + parameterized-SQL read model (server-2 public-stats module)
**Confidence:** HIGH (all findings grounded in this repo's actual files; no external library additions required)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Slug column & shared migration**
- Add migration `0006_*.sql` (next after `0005_keyset_indexes.sql`) adding `slug text` to **`canonical_players`, `squads`, `rotations`, AND `replays`**, each with a **partial UNIQUE index** (`unique (slug) where slug is not null`) plus a plain btree index for lookup. `replays.slug` here is the "shared migration" Phase 17 consumes with no further migration.
- **Backfill in the same migration**: deterministic slugs for all existing rows from their human-readable name (`display_name`/`name`/replay-identifying field), slugified (lowercase, ASCII-fold, non-alnum → `-`, collapse/trim dashes). Collisions resolved deterministically by appending `-<short-suffix>` derived from row `id` (e.g. first 6 hex of the uuid) so backfill is idempotent and order-independent. Empty/unslugifiable names fall back to id-derived slug (`p-<short>` / `s-<short>` / `r-<short>` / `replay-<short>`).
- **New rows**: slug assigned at the canonical-entity creation/promotion code path (app-level), using the same pure slugify+collision helper, inside the existing insert transaction. **No DB trigger.**
- Slug is **immutable** for v1 (no rename/redirect handling).

**Slug-or-UUID resolution**
- Existing detail routes (`GET /stats/players/:id`, `GET /stats/squads/:id`) accept **either a UUID or a slug** in `:id`. Relax route param from `format:"uuid"` to a plain bounded-pattern string; repository resolver branches on "looks like a UUID" → lookup by `id`, else → lookup by `slug`. Unknown → existing 404.
- Add a **rotation detail route** `GET /stats/rotations/:id` (slug-or-uuid). Returns existing `RotationSummaryResponse` shape extended with `slug` + provenance.
- Expose `slug` on player/squad/rotation summary+profile schemas. Sub-resource (history) routes reached via already-resolved entity id — parent route resolves slug→id first.

**History endpoints (HIST-01, HIST-02)**
- **Name/alias history** — `GET /stats/players/:id/name-history`: ordered timeline from `player_nicknames` (`observed_from`, `observed_to`, `nickname`, `source_replay_id`). Entry: `{ kind: "alias", nickname, from, to, sourceReplayId | null }`, `to` null for open/current. Existing flat `aliases` array stays unchanged (additive).
- **Player membership history** — `GET /stats/players/:id/membership-history`: from `squad_memberships` by `player_id`, entry `{ kind: "membership", squad: { id, slug, name }, from, to }` (`valid_from`/`valid_to`).
- **Squad membership history** — `GET /stats/squads/:id/membership-history`: same table by `squad_id`, entry `{ kind: "membership", player: { id, slug, displayName }, from, to }`.
- **Explicit unknown gaps**: timeline is a discriminated-union array; temporal gaps between consecutive known windows (or before first / after last) emit `{ kind: "unknown-gap", from, to }` rather than silent omission. Genuinely unknown bound uses `null` for that side. Never fabricate unevidenced membership — gaps are first-class.
- Sort all timelines ascending by `from` (nulls-first for unknown lower bound).

**Provenance / last-updated envelope (HIST-03)**
- Add `provenance: { lastUpdatedAt: string | null }` (ISO-8601 UTC, nullable when no backing rows) to **singular** public stat responses (player profile, squad profile, rotation detail, Phase 15 parity sub-resources, new history responses).
- **Populated from the actual rows returned**, computed at the row→payload mapper boundary (same choke-point discipline as masking): `lastUpdatedAt = max` over timestamps of rows that produced the response — `player_stats.calculated_at` / `squad_stats.calculated_at` for stat payloads, `max(observed_to/observed_from)` or `max(valid_to/valid_from)` for history, `canonical_players.updated_at` / `squads.updated_at` as a floor. **Never `now()`.**
- **List / paginated responses keep the Phase 14 cursor envelope unchanged** — no provenance on list shapes.

**Identity & masking (non-negotiable, carried from Phase 14/15)**
- No full or masked Steam64 in any new surface beyond the established profile masked-last-4 field. Membership/alias history identifies counterparts by `{ id, slug, name|displayName }` only.
- Masking + provenance both enforced at the mapper boundary; no new code path may emit `7656119\d{10}`. The Phase 14 leak-guard test is extended to cover the new endpoints.

**Pagination**
- All new history surfaces are **bounded embedded arrays** (consistent with Phase 15). List *collection* endpoints keep their cursor contract unchanged.

**Contract / OpenAPI**
- All schema additions are **additive**. Regenerate `openapi/server-2.openapi.json` on boot and keep `openapi:check` green. Hard freeze + diff gate is Phase 19.

### Claude's Discretion
- Exact migration filename suffix, slugify helper module location/name, bounded slug regex.
- Exact route path spellings for history sub-resources (within `/stats/{entity}/:id/...`) and response field naming, kept consistent with existing camelCase TypeBox conventions.
- Whether the slug resolver is a shared repository helper vs inlined per route (prefer one shared, tested helper).

### Deferred Ideas (OUT OF SCOPE)
- Slug rename / historical-slug redirect handling — rejected for v1.
- Provenance envelope on list/paginated responses — rejected.
- Masked SteamID inside history counterpart entities — rejected (id + slug + name only).
- Replay list/detail/timeline/sitemap consumption of `replays.slug` — Phase 17.
- Admin rotation CRUD that would *write* slugs — Phase 18.
- Production traffic cutover — out of milestone scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-01 | Player, squad, and rotation resources resolvable by slug, not only UUID | §Slug generation (1), §Migration DDL+backfill (2), §Slug-or-UUID resolution (3); new `GET /stats/rotations/:id` route; `slug` field added to all summary/profile schemas |
| HIST-01 | Player nickname/alias history with timestamps | §History timelines (4); `GET /stats/players/:id/name-history` sourced from `player_nicknames` |
| HIST-02 | Player and squad membership history with dates | §History timelines (4); `GET /stats/players/:id/membership-history` + `GET /stats/squads/:id/membership-history` sourced from `squad_memberships` |
| HIST-03 | Public stat responses carry provenance / last-updated metadata | §Provenance envelope (5); `provenance.lastUpdatedAt` computed at mapper boundary from `calculated_at`/`updated_at`/observed/valid timestamps of returned rows |
</phase_requirements>

## Summary

This phase is **purely additive code over the existing schema and module** — no new libraries, no new tables, PostgreSQL 17 + Node 25 + TS 6. Everything fits the established `PgPublicStatsReadModel` raw-`pg` pattern in `src/modules/public-stats/repository.ts` and the TypeBox schemas in `src/modules/public-stats/routes/schemas.ts`. The four temporal/identity tables this phase reads (`player_nicknames`, `squad_memberships`, `player_stats.calculated_at`, `squads/canonical_players.updated_at`) all already exist in `0001_v1_domain_schema.sql`.

The four work surfaces are: (1) a `0006_*.sql` migration adding `slug` to four tables with a partial-unique + lookup index and an idempotent in-SQL backfill; (2) a pure, tested `slugify` helper used both by the backfill (mirrored in SQL) and by app-level insert paths; (3) a slug-or-UUID resolver that branches on UUID shape and falls back to slug lookup; (4) discriminated-union history timelines with explicit `unknown-gap` entries; (5) a `provenance` envelope computed at the mapper boundary from the max timestamp of the rows actually returned.

**Primary recommendation:** Implement a single shared `slugify(name, idHexSuffix)` TS helper whose collision/fallback algorithm is **reproduced byte-for-byte in SQL inside the 0006 migration backfill** so app-generated and backfilled slugs are identical for the same `(name, id)`. Build the gap-computation as a pure function over sorted `[from, to]` intervals (independent of SQL), and compute `provenance.lastUpdatedAt` as a pure `maxTimestamp(rows)` at the same mapper choke point that already does masking. Keep every new read-model method mirrored in `createEmptyPublicStatsReadModel` (`src/modules/public-stats/routes/empty-read-model.ts`), or boot-without-DB breaks.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `slug` column, partial-unique index, backfill | Database / Storage (migration `0006`) | — | Schema + one-time data shape; runs through `migrate.ts`. |
| Slug generation for new rows | API / Backend (insert/promotion code path) | — | App-level pure helper inside existing insert transaction (no DB trigger, per CONTEXT). |
| Slug-or-UUID resolution | API / Backend (repository resolver) | API route (param schema relax) | Resolver branches UUID-shape→id else→slug; route only relaxes the param. |
| Name/membership history timelines | API / Backend (repository read methods + pure gap function) | — | SQL pulls ordered intervals; gap computation is pure TS over the rows. |
| Provenance envelope | API / Backend (row→payload mapper) | — | Same choke point as masking; computed from returned rows, never `now()`. |
| OpenAPI contract regeneration | Frontend Server (boot) → consumed by `web` | CI (`openapi:check`) | `@fastify/swagger` regenerates on boot; additive only this phase. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` (Pool) | already installed | Raw parameterized SQL data access | Established repo pattern; CONTEXT mandates "raw pg, parameterized, no ORM" `[VERIFIED: repository.ts]` |
| `@sinclair/typebox` (`Type`) | already installed | Request/response schemas + OpenAPI source | Existing `schemas.ts` pattern; `@fastify/swagger` reads these `[VERIFIED: schemas.ts]` |
| `@fastify/swagger` / `@fastify/swagger-ui` | already installed | OpenAPI generated at boot | `src/openapi/register-openapi.ts`, verified by `openapi:verify` `[VERIFIED: package.json]` |
| `openapi-typescript` | ^7.13.0 | Frontend type generation (consumed by `web`) | `openapi:check` script `[VERIFIED: package.json line 66]` |
| `vitest` | 4.x | Unit + integration tests | `tests/postgres.test.ts` real-pg harness `[VERIFIED: postgres.test.ts]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node `node:crypto` | builtin | (none needed — slug suffix derived from existing uuid hex, no hashing required) | If a suffix beyond uuid-prefix is ever needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled ASCII-fold slugify | npm `slugify` / `@sindresorhus/slugify` | **REJECTED — do not add a dependency.** The transliteration table must be byte-identical between TS (new-row path) and SQL (backfill). A npm lib's Unicode table cannot be reproduced in pure SQL without `unaccent`/extension, breaking the "same slug for same (name,id)" invariant. A small, fully-owned transliteration map is required for determinism + parity. `[VERIFIED: reasoning]` |
| In-SQL backfill | TS data-migration step | **REJECTED for this repo.** `migrate.ts` runs each `.sql` file as one transaction; there is no TS migration hook. Backfill must live in the `.sql` file. `[VERIFIED: migrate.ts]` |
| DB trigger for new-row slugs | app-level helper | **REJECTED by CONTEXT** ("keep slug logic in one tested TS helper"). |
| Postgres `unaccent` extension for ASCII-fold | owned transliteration map | **REJECTED** — `unaccent` does not transliterate Cyrillic→Latin (it strips diacritics on Latin only); Cyrillic display names would collapse to empty and hit the id-fallback path, producing useless `p-<hex>` slugs for most Russian-named players. A Cyrillic→Latin map in both TS and SQL is required. `[VERIFIED: PostgreSQL unaccent semantics]` |

**Installation:** None. No package changes this phase.

**Version verification:** No new packages. Runtime versions confirmed: Node `>=25 <26` (`package.json` engines), TypeScript `^6.0.3`, PostgreSQL `17-alpine` (`docker-compose.yml` line 3, `docker-compose.prod.yml` line 32). `[VERIFIED: package.json, docker-compose.yml]`

## Package Legitimacy Audit

> No external packages are installed in this phase. Audit not applicable.

**Packages removed due to slopcheck [SLOP] verdict:** none — no packages added.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                 GET /stats/{entity}/:id            GET /stats/{entity}/:id/{history}
                 (id = UUID or slug)                (parent id = UUID or slug)
                          │                                     │
                          ▼                                     ▼
            ┌──────────────────────────┐          ┌──────────────────────────┐
            │  TypeBox param schema     │          │  same relaxed param       │
            │  SlugOrUuidParameters     │          │  schema                   │
            │  (bounded string)         │          └────────────┬─────────────┘
            └────────────┬─────────────┘                        │
                         ▼                                       ▼
            ┌──────────────────────────────────────────────────────────────┐
            │  PgPublicStatsReadModel  (src/modules/public-stats/repository) │
            │                                                                 │
            │  resolveEntityId(idOrSlug) ── looksLikeUuid? ──► WHERE id = $1  │
            │                            └─ else ───────────► WHERE slug = $1 │
            │                                                                 │
            │  getPlayer/getSquad/getRotation ─► stat SQL  ─┐                 │
            │  getPlayerNameHistory ─► player_nicknames SQL ─┤                │
            │  get*MembershipHistory ─► squad_memberships SQL┤                │
            └────────────────────────────────────────────────┼───────────────┘
                                                              ▼
                          ┌────────────────────────────────────────────────┐
                          │  row → payload MAPPER BOUNDARY (choke point)     │
                          │   • maskSteamId()            (existing)          │
                          │   • computeGaps(intervals)   (new, pure)         │
                          │   • provenanceOf(rows)       (new, pure)         │
                          │       lastUpdatedAt = max(timestamps) | null     │
                          └────────────────────────┬─────────────────────────┘
                                                   ▼
                                  TypeBox response schema (gates serialization,
                                  feeds @fastify/swagger OpenAPI on boot)
```

### Component Responsibilities
| File | Change |
|------|--------|
| `src/infra/db/migrations/0006_*.sql` | NEW. `slug` column + partial-unique + btree index on 4 tables; in-SQL backfill mirroring the TS slugify algorithm. |
| `src/modules/public-stats/routes/slug.ts` (new helper module) | NEW. Pure `slugify(name)`, `shortSuffix(uuid)`, `looksLikeUuid(s)`; exported for app insert paths + tests. (Discretion: name/location.) |
| `src/modules/public-stats/repository.ts` | `resolveEntityId`, new `getPlayerNameHistory` / `get{Player,Squad}MembershipHistory` / `getRotation` methods; `slug` added to row interfaces + mappers; `provenance` computed in mappers. |
| `src/modules/public-stats/routes/schemas.ts` | `SlugOrUuidParameters`; `slug` field on summary/profile; `ProvenanceResponse`; history discriminated-union response schemas. |
| `src/modules/public-stats/routes/routes.ts` | Relax detail-route params; add `GET /stats/rotations/:id`; register history sub-resource routes. |
| `src/modules/public-stats/routes/models.ts` | New domain types + extend `PublicStatsReadModel` interface. |
| `src/modules/public-stats/routes/empty-read-model.ts` | **MUST** add a stub for every new read-model method (boot-without-DB default). |
| `src/test/integration/steamid-leak-guard.test.ts` | Extend route arrays to sweep new history + rotation-detail endpoints. |
| `openapi/server-2.openapi.json` | Regenerate via `pnpm run openapi:export`; commit. |

### Pattern 1: Migration — column + partial-unique + lookup index + idempotent backfill
**What:** `0006` adds `slug` to 4 tables and backfills existing rows deterministically.
**When to use:** This phase's only schema change.
**Key constraint:** `migrate.ts` (lines 40-68) runs each `.sql` file **once** inside one `begin/commit`, records a **sha256 checksum**, and **throws if a previously-applied file's checksum changes** (line 49). So: the file content is frozen after first apply; it does NOT re-run, therefore the backfill does not need to survive re-execution against the same DB — but it MUST be written idempotently anyway (`if not exists`, guarded `update ... where slug is null`) so that a fresh DB and a re-created test DB both succeed, and so a partially-failed apply leaves no half-state (the transaction rolls back on error per line 64-66). `[VERIFIED: migrate.ts lines 40-68]`

```sql
-- Source: pattern grounded in 0001_v1_domain_schema.sql + 0005_keyset_indexes.sql conventions
-- 0006_slug_addressing.sql  (filename suffix at discretion)

-- 1. Columns (idempotent)
alter table canonical_players add column if not exists slug text;
alter table squads            add column if not exists slug text;
alter table rotations         add column if not exists slug text;
alter table replays           add column if not exists slug text;

-- 2. Deterministic backfill. Slugify + id-suffix reproduced in SQL to match the TS helper.
--    base = lowercase, transliterate Cyrillic->Latin, strip remaining non-alnum to '-',
--    collapse/trim dashes. suffix = first 6 hex chars of id (uuid text, dashes removed).
--    Collision is resolved by ALWAYS appending '-<suffix>' when the bare base is non-unique;
--    to stay order-independent AND idempotent the simplest deterministic rule is:
--    slug = base when base is globally unique within the table, else base || '-' || suffix.
--    A single-pass form that is order-independent: append the suffix to EVERY row whose base
--    is shared by more than one row (window count), leave unique bases bare.
update canonical_players p set slug =
  case
    when sg.base = '' then 'p-' || sg.suffix
    when sg.dup then sg.base || '-' || sg.suffix
    else sg.base
  end
from (
  select id,
    slug_base(display_name) as base,                       -- helper fn defined below
    substr(replace(id::text,'-',''),1,6) as suffix,
    count(*) over (partition by slug_base(display_name)) > 1 as dup
  from canonical_players
) sg
where p.id = sg.id and p.slug is null;
-- (repeat the same shape for squads.name, rotations.name, replays.<identifying field>
--  with prefixes 's-', 'r-', 'replay-')
```

**Recommended:** define `slug_base(text)` as an `immutable` SQL function **inside the same migration** so the transliteration/regex logic lives once and is reused by the four backfill statements. Example body:

```sql
create or replace function slug_base(input text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(
    lower(translate(coalesce(input,''),
      -- Cyrillic single-char map (extend as needed; multi-char like ж->zh handled below)
      'абвгдеёзийклмнопрстуфхцыэ',
      'abvgdeezijklmnoprstufхcye')),  -- align lengths; see note
    '[^a-z0-9]+', '-', 'g'));
$$;
```

> **NOTE / pitfall:** `translate()` is single-codepoint→single-codepoint; multi-char transliterations (ж→zh, ч→ch, ш→sh, щ→shch, ю→yu, я→ya, х→kh) need chained `replace()` calls **before** `translate`, applied in the SAME order in the TS helper. Keep one canonical ordered list of `(cyr, lat)` pairs and generate both the SQL and TS from the same source-of-truth comment block to guarantee parity. `[VERIFIED: PostgreSQL translate/regexp_replace semantics]`

### Pattern 2: Slug-or-UUID resolution
**What:** Accept either a UUID or a bounded slug in `:id`.
**When to use:** player/squad/rotation detail routes and the parent of every history sub-resource.

```ts
// Source: schemas.ts UuidParameters (line 20) relaxed
export const SlugOrUuidParameters = Type.Object({
  // bounded so an unbounded path segment is not a DoS vector (conventions: bound every string)
  id: Type.String({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9-]+$" }),
});
```

```ts
// Repository resolver — one shared helper (CONTEXT discretion prefers shared)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value);
}
// in SQL, branch the WHERE clause (parameterized, no concat):
//   where ($1::boolean = true and players.id = $2::uuid)
//      or ($1::boolean = false and players.slug = $2::text)
// passing [looksLikeUuid(idOrSlug), idOrSlug]. Avoids ::uuid cast errors on slug input.
```

> **Pitfall:** binding a non-UUID string directly to a `::uuid` parameter throws `invalid input syntax for type uuid`. Branch on a boolean flag (computed in TS) so the `::uuid` cast only sees UUID-shaped input. `[VERIFIED: pg type-cast behavior]`

> **OpenAPI implication:** relaxing `format:"uuid"` → bounded `pattern` string is a **widening** change to the param — additive/backward-compatible for `web`'s generated client (a UUID still matches the pattern). The generated `.d.ts` param type changes from a `uuid`-formatted string to a plain `string`; still assignable. Safe pre-freeze. `[VERIFIED: openapi-typescript treats both as `string`]`

### Pattern 3: History timeline SQL (mirror parity-sql.ts temporal patterns)
**What:** ordered intervals from the temporal tables.
**Source:** `parity-sql.ts` lines 35-42 (nickname `observed_from/observed_to` windowing) and lines 90-97 (`squad_memberships` `valid_from desc, membership.id` ordering).

```ts
// name-history (player_nicknames) — ascending, nulls-first lower bound
`select n.nickname, n.observed_from, n.observed_to, n.source_replay_id
   from player_nicknames n
  where n.player_id = $1::uuid
  order by n.observed_from asc nulls first, n.id`
```
```ts
// player membership-history (counterpart = squad: id, slug, name) — no Steam64
`select m.valid_from, m.valid_to, s.id as squad_id, s.slug as squad_slug, s.name
   from squad_memberships m
   join squads s on s.id = m.squad_id
  where m.player_id = $1::uuid
  order by m.valid_from asc nulls first, m.id`
```
```ts
// squad membership-history (counterpart = player: id, slug, displayName) — no Steam64
`select m.valid_from, m.valid_to, p.id as player_id, p.slug as player_slug, p.display_name
   from squad_memberships m
   join canonical_players p on p.id = m.player_id
  where m.squad_id = $1::uuid
  order by m.valid_from asc nulls first, m.id`
```

### Pattern 4: Explicit unknown-gap computation (pure TS)
**What:** between consecutive known `[from, to]` windows emit `{ kind: "unknown-gap", from, to }`. Pure function, unit-tested independent of SQL.

```ts
// intervals already sorted ascending by `from` (SQL order by). Each known entry has
// from: string|null, to: string|null. Emit a gap when a window's `to` precedes the
// next window's `from` (a hole), and at the open edges when a bound is unknown.
interface Window { from: string | null; to: string | null; /* + payload */ }

function withGaps<T extends Window>(windows: T[], makeKnown: (w: T) => Entry): Entry[] {
  const out: Entry[] = [];
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!;
    const prevTo = i === 0 ? null : windows[i - 1]!.to;
    // gap before/between: prevTo (or null at the very start) .. w.from
    if (gapExists(prevTo, w.from)) out.push({ kind: "unknown-gap", from: prevTo, to: w.from });
    out.push(makeKnown(w));
  }
  // trailing open-ended gap only if the last window is closed (to !== null) — an open
  // last window IS the current/ongoing state, not a gap.
  const last = windows.at(-1);
  if (last && last.to !== null) out.push({ kind: "unknown-gap", from: last.to, to: null });
  return out;
}
```

> **Decision needed (Open Q1):** the exact gap policy at edges. Recommendation: (a) a gap between two known windows is emitted only when `prevTo < nextFrom` (strictly disjoint) — adjacent/overlapping windows produce no gap; (b) a leading gap `{ from: null, to: firstFrom }` is emitted only when `firstFrom !== null` (we know activity started at `firstFrom`, before is unknown); (c) a trailing gap `{ from: lastTo, to: null }` only when the last window is closed. An open last window means "current", not a gap. This matches CONTEXT's "never fabricate membership it cannot evidence."

### Pattern 5: Provenance envelope (pure, at mapper boundary)
**What:** `lastUpdatedAt = max` over the timestamps of the rows that produced THIS response, `null` when none.

```ts
// Source: mapper boundary in repository.ts (mapPlayerProfile line 1034, mapSquadSummary 1064)
function maxTimestamp(values: (Date | null | undefined)[]): string | null {
  const present = values.filter((v): v is Date => v instanceof Date);
  if (present.length === 0) return null;
  return new Date(Math.max(...present.map((d) => d.getTime()))).toISOString();
}
// player profile: max(player_stats.calculated_at across returned rotation rows,
//                      canonical_players.updated_at as floor)
// squad profile:  max(squad_stats.calculated_at..., squads.updated_at)
// name-history:   max(observed_to ?? observed_from over returned nickname rows)
// membership-hist:max(valid_to ?? valid_from over returned rows)
// rotation detail:rotations has no updated_at — use max over related stat rows or null
```

> **Schema gap (Open Q2):** `rotations` (0001 lines 94-101) has **no `updated_at`** column — only `created_at`. For rotation-detail provenance, either (a) compute from related `player_stats`/`squad_stats.calculated_at` for that rotation, or (b) fall back to `null`, or (c) use `rotations.created_at`. Recommendation: **(a) then (c) as floor**; do NOT add an `updated_at` column to rotations in this phase (out of the locked migration scope, which lists only `slug`). Planner should confirm. The SQL for rotation detail must therefore select the relevant timestamp(s); simplest is `select ..., (select max(calculated_at) from player_stats ps where ps.rotation_id = r.id) as last_calc` and floor on `r.created_at`.

### Anti-Patterns to Avoid
- **`now()` anywhere in provenance** — explicitly forbidden by HIST-03/CONTEXT. The value MUST come from returned rows.
- **Concatenating slug/uuid into SQL** — always parameterize; branch with a boolean flag param to keep the `::uuid` cast safe.
- **Slug logic diverging between TS and SQL** — the new-row helper and the backfill MUST produce identical slugs for the same `(name, id)`. Drive both from one ordered transliteration source.
- **Forgetting `empty-read-model.ts`** — every new `PublicStatsReadModel` method needs a stub there or boot-without-DB and many unit tests fail.
- **Adding provenance to list/paginated shapes** — rejected; would churn the cursor contract pre-freeze.
- **Masked or full Steam64 in history counterparts** — counterparts are `{ id, slug, name|displayName }` only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration ordering/checksum/transaction | A custom runner or out-of-band psql | Existing `migrate.ts` (`pnpm db:migrate`) | Lexicographic `.toSorted()`, sha256 checksum guard, per-file transaction already solved. `[VERIFIED: migrate.ts]` |
| OpenAPI generation | Hand-written schema JSON | TypeBox route schemas → `@fastify/swagger` at boot | Contract is generated; hand-editing `server-2.openapi.json` fails `openapi:verify`. `[VERIFIED: verify-openapi.ts]` |
| Steam64 masking | New masking in each new mapper | Existing `maskSteamId` choke point (`routes/pagination/mask.ts`) | One audited choke point; new surfaces simply must not emit Steam64 at all. `[VERIFIED: mask.ts]` |
| Cursor/keyset for history | New pagination | Bounded embedded arrays (Phase 15 decision) | Per-entity history is small/finite. |
| Steam64 leak test | New regex test | Extend `expectNoSteam64` + route arrays in `steamid-leak-guard.test.ts` | Negative-self-tested guard already exists. `[VERIFIED: steamid-leak-guard.test.ts]` |

**Key insight:** This phase adds **zero infrastructure**. Every cross-cutting concern (migrations, OpenAPI, masking, leak-guard, real-pg test harness) already exists; the work is extending them additively.

## Runtime State Inventory

> This phase ADDS a `slug` column and backfills it. It is a schema+data migration, so the inventory applies to the backfill, not a rename.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `canonical_players`, `squads`, `rotations`, `replays` gain a `slug` column; **all existing rows** must be backfilled with deterministic slugs in `0006`. | Data migration (in-SQL backfill in 0006). |
| Live service config | None — no external service stores or references slugs (slugs are new). `web` will *consume* slugs but that is additive OpenAPI, not runtime state. | None. |
| OS-registered state | None — no scheduler/process embeds these entities. | None — verified by absence of any slug/entity reference in deployment configs. |
| Secrets/env vars | None — no env var references entity slugs. | None. |
| Build artifacts | `openapi/server-2.openapi.json` is a committed generated artifact that becomes stale once schemas change. | Regenerate via `pnpm run openapi:export` and commit (else `openapi:verify` fails). `[VERIFIED: verify-openapi.ts]` |

**The canonical question — after every file is updated, what runtime systems still have stale state?** Only the committed `openapi/server-2.openapi.json` snapshot (regenerate + commit) and any test DB created before 0006 (re-run migrations — the integration harness already calls `runMigrations` in `beforeAll`).

## Common Pitfalls

### Pitfall 1: TS↔SQL slug divergence breaks backfill/new-row parity
**What goes wrong:** A player created after the migration gets a different slug than the backfill would have produced, or two code paths disagree on collision suffixing.
**Why it happens:** Two independent implementations (TS helper + SQL backfill) of the same algorithm drift.
**How to avoid:** One ordered `(cyrillic, latin)` transliteration list as the single source; apply multi-char `replace()` chains in the SAME order in both; unit-test the TS helper against a fixture table AND assert (integration) that re-running the SQL `slug_base()` on the same names yields identical output.
**Warning signs:** A test inserting a Cyrillic-named player and reading its slug disagrees with the backfilled slug for the same name.

### Pitfall 2: `::uuid` cast error on slug input
**What goes wrong:** `GET /stats/players/some-slug` throws `invalid input syntax for type uuid: "some-slug"` (500).
**Why it happens:** Binding a slug string to a `$1::uuid` parameter.
**How to avoid:** Branch the WHERE on a boolean flag computed in TS (`looksLikeUuid`); only the UUID branch references `::uuid`.
**Warning signs:** 500 (not 404) for a non-existent slug.

### Pitfall 3: Provenance accidentally uses `now()` or a floor that ignores returned rows
**What goes wrong:** Freshness always reflects request time, not data time — silently defeats HIST-03.
**Why it happens:** Defaulting to `now()` when rows have null timestamps, or computing max over ALL rows not the returned subset.
**How to avoid:** `null` when no backing rows; max strictly over the rows in the response; never `now()`. Unit-test the null and the aggregation cases.

### Pitfall 4: Open-ended interval treated as a gap
**What goes wrong:** A current (open `to=null`) membership/alias emits a spurious trailing `unknown-gap`.
**Why it happens:** Treating `to=null` as "ended at unknown time" rather than "ongoing".
**How to avoid:** Trailing gap only when the last window is **closed** (`to !== null`). See Pattern 4.

### Pitfall 5: Stale committed OpenAPI artifact fails CI
**What goes wrong:** `openapi:check` / `verify` fails because `server-2.openapi.json` wasn't regenerated after schema edits.
**Why it happens:** Forgetting `pnpm run openapi:export`.
**How to avoid:** Regenerate + commit as a plan step; `verify-openapi.ts` byte-compares committed vs generated. `[VERIFIED: verify-openapi.ts]`

### Pitfall 6: `empty-read-model.ts` not updated
**What goes wrong:** TS compile error (interface not satisfied) or boot-without-DB returns wrong shape.
**Why it happens:** New `PublicStatsReadModel` methods added to the interface + `PgPublicStatsReadModel` but not to `createEmptyPublicStatsReadModel`.
**How to avoid:** Update `empty-read-model.ts` in the same task that extends the interface. `[VERIFIED: empty-read-model.ts]`

## Code Examples

### Player profile mapper extended with slug + provenance
```ts
// Source: repository.ts mapPlayerProfile (line 1034) — extended
function mapPlayerProfile(row: PlayerRow, rotationId: string | undefined): PlayerProfile {
  return {
    ...mapPlayerSummary(row, rotationId),     // gains `slug` via PlayerRow.slug
    aliases: row.aliases,
    steamIds: row.steam_ids.map(maskSteamId), // unchanged masking choke point
    provenance: {
      lastUpdatedAt: maxTimestamp([row.calculated_at, row.updated_at]),
    },
  };
}
```

### Discriminated-union history response schema (TypeBox)
```ts
// Source: schemas.ts patterns (Type.Union of Type.Literal already used for `order`, line 14)
const NameHistoryEntry = Type.Union([
  Type.Object({
    kind: Type.Literal("alias"),
    nickname: Type.String(),
    from: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    to: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    sourceReplayId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  }),
  Type.Object({
    kind: Type.Literal("unknown-gap"),
    from: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    to: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  }),
]);
const NameHistoryResponse = Type.Object({
  entries: Type.Array(NameHistoryEntry),
  provenance: ProvenanceResponse,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| UUID-only addressing | slug-or-UUID, additive | This phase | Backward-compatible; UUID paths keep working. |
| Flat `aliases` array | + time-series `name-history` with gaps | This phase | `aliases` unchanged; history is the new surface. |
| No freshness signal | `provenance.lastUpdatedAt` on singular responses | This phase | Per-resource freshness from actual rows. |

**Deprecated/outdated:** none.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `replays` has a usable human-readable identifying field for slug base (CONTEXT says "a replay-identifying field"); `0001` shows `replays` has `source_replay_id`, `source_system`, `replay_timestamp` but **no display name**. | Migration backfill | If no good base exists, replays fall back to `replay-<hex>` for ~all rows. Planner/Phase-17 may prefer a composed base (e.g. `source_system-source_replay_id` slugified). LOW risk this phase (replays.slug is consumed in Phase 17), but the backfill rule must be decided. |
| A2 | Cyrillic→Latin transliteration is preferred over strip-to-empty for Russian display names. | Slugify | If strip is preferred, Cyrillic names collapse to id-fallback slugs (ugly but functional). Recommend transliteration; planner should confirm the exact map is acceptable. |
| A3 | Rotation provenance uses related stat `calculated_at` (rotations has no `updated_at`). | Provenance | If a different floor is wanted, change the rotation-detail SQL. |
| A4 | Relaxing `format:"uuid"`→bounded string is treated as additive/backward-compatible by `web`'s generated client. | OpenAPI | Both generate `string`; widening is safe. Verify in Phase 19 diff gate. |

## Open Questions

1. **Edge-gap policy** — exact rules for leading/trailing/between gaps and adjacency. *Recommendation in Pattern 4(c).* Planner should lock the policy and unit-test each edge.
2. **Rotation provenance source** — `rotations` lacks `updated_at`. *Recommendation: related stat `calculated_at`, floor on `created_at`, else null; do not extend the migration.*
3. **Replay slug base** (A1) — what human-readable field seeds `replays.slug`. *Recommendation: slugify `source_system || '-' || source_replay_id`, suffix with id-hex; low urgency (Phase 17 consumes it).*
4. **Transliteration map completeness** — which Cyrillic letters + multi-char sequences (ж/ч/ш/щ/ю/я/х) are covered, and digits/Latin passthrough. *Recommendation: cover full modern Russian alphabet; document the ordered list as the TS↔SQL source of truth.*

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | migration + integration tests | ✓ | 17-alpine (`docker-compose.yml:3`) | — |
| Node.js | runtime/tests | ✓ | >=25 <26 (`package.json` engines) | — |
| pnpm scripts (`db:migrate`, `openapi:export`, `openapi:verify`, `test:integration`) | build/CI | ✓ | `package.json` | — |
| `unaccent`/`citext` extensions | (not used) | ✗ | — | Owned transliteration map (see Standard Stack — deliberately not used). |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none requiring action — `unaccent` is intentionally avoided.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 + `@vitest/coverage-v8` |
| Config file | unit + integration as separate Vitest projects (per tests skill); integration under `src/test/integration/` and `*.test.ts` in module `tests/` |
| Quick run command | `pnpm test` (unit) |
| Full suite command | `pnpm run verify` (format, lint, typecheck, test, test:integration, openapi:check, ops checks, coverage) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | `slugify` pure helper (ASCII-fold, Cyrillic translit, collapse/trim, id-fallback) | unit | `pnpm test -- slug` | ❌ Wave 0 (`routes/slug.test.ts`) |
| API-01 | Backfill determinism: SQL `slug_base()` == TS `slugify` for fixture names; collision suffixing order-independent | integration | `pnpm run test:integration -- postgres` | ⚠ extend `tests/postgres.test.ts` |
| API-01 | partial-unique index rejects duplicate non-null slug; allows multiple nulls | integration | `pnpm run test:integration` | ❌ Wave 0 |
| API-01 | resolve player/squad/rotation by UUID **and** by slug; unknown→404 (not 500) | integration (`app.inject`) | `pnpm run test:integration` | ⚠ extend `routes/tests/players.test.ts`, `squads.test.ts`; new rotations test |
| API-01 | `slug` present on summary/profile/rotation responses | integration | `pnpm run test:integration` | ⚠ extend |
| HIST-01 | name-history ordered ascending; open window `to=null`; `sourceReplayId` nullable | integration | `pnpm run test:integration` | ❌ Wave 0 |
| HIST-02 | player + squad membership-history; counterpart `{id,slug,name/displayName}` only (no Steam64) | integration | `pnpm run test:integration` | ❌ Wave 0 |
| HIST-01/02 | `withGaps` pure fn: between-gap, leading-gap, trailing-gap, open-last (no gap), adjacent (no gap), all-unknown bounds | unit | `pnpm test -- gaps` | ❌ Wave 0 (`routes/history-gaps.test.ts`) |
| HIST-03 | provenance = max over returned rows; **null** when no rows; never `now()` | unit + integration | `pnpm test`; `pnpm run test:integration` | ❌ Wave 0 |
| SEC-01/02 | Steam64 leak-guard extended to new history + rotation-detail endpoints | integration | `pnpm run test:integration -- steamid-leak-guard` | ⚠ extend `src/test/integration/steamid-leak-guard.test.ts` |
| (contract) | byte-identical legacy parity still green (Phase 15 gate) | integration | `pnpm run test:integration` | ✅ exists |
| (contract) | `openapi:check` green after regenerate+commit | CI | `pnpm run openapi:check` | ✅ exists |

### Sampling Rate
- **Per task commit:** `pnpm test` (unit) + targeted `pnpm run test:integration -- <file>`.
- **Per wave merge:** `pnpm run test:integration` + `pnpm run openapi:check`.
- **Phase gate:** `pnpm run verify` fully green (includes 100% reachable-source coverage) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `src/modules/public-stats/routes/slug.test.ts` — slugify + looksLikeUuid + shortSuffix (API-01)
- [ ] `src/modules/public-stats/routes/history-gaps.test.ts` — `withGaps` pure fn edge cases (HIST-01/02)
- [ ] provenance unit tests (`maxTimestamp` null/aggregation) co-located with the mapper (HIST-03)
- [ ] integration: backfill determinism + partial-unique index behavior (extend `tests/postgres.test.ts`) (API-01)
- [ ] integration: new history + rotation-detail routes via `app.inject` (HIST-01/02, API-01)
- [ ] extend `src/test/integration/steamid-leak-guard.test.ts` route arrays (SEC-01/02)
- [ ] Framework install: none — Vitest already configured.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Public read endpoints; no auth surface added. |
| V3 Session Management | no | — |
| V4 Access Control | no | Public stats are anonymous; no IDOR surface (no per-user data). |
| V5 Input Validation | yes | TypeBox bounded `:id` param (`maxLength`, `pattern`); list query bounds unchanged. |
| V6 Cryptography | no | No crypto; slug suffix is non-secret uuid-hex, not a hash. |
| (project) SteamID protection (SEC-01/02) | yes | No Steam64 on any new surface; leak-guard test extended; masking choke point unchanged. |

### Known Threat Patterns for TS/Fastify + raw pg
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via slug/id path segment | Tampering | Parameterized SQL only; boolean-flag branch for `::uuid` cast; bounded `pattern` on param. |
| `::uuid` cast 500 on slug input | Denial of Service (error amplification) | TS `looksLikeUuid` branch → 404 not 500. |
| Steam64 leakage via new history/rotation/provenance surfaces | Information Disclosure | Counterparts carry `{id,slug,name}` only; leak-guard regex `7656119\d{10}` swept over new routes. |
| Unbounded path segment | DoS | `maxLength: 128` on the slug-or-uuid param. |

## Sources

### Primary (HIGH confidence — this repo)
- `src/infra/db/migrate.ts` (lines 40-68) — checksum/transaction/idempotency semantics.
- `src/infra/db/migrations/0001_v1_domain_schema.sql` — table shapes: `canonical_players`/`squads`/`rotations`/`replays`, `player_nicknames` (40-53), `squad_memberships` (79-92), `player_stats.calculated_at` (200), `squad_stats.calculated_at` (209); `rotations` has no `updated_at` (94-101).
- `src/infra/db/migrations/0005_keyset_indexes.sql` — index naming/`create index if not exists` convention.
- `src/modules/public-stats/routes/schemas.ts` — `UuidParameters` (20), summary/profile/rotation schemas, `Type.Union`/`Type.Literal` usage (14).
- `src/modules/public-stats/routes/routes.ts` — detail-route registration (178, 293), rotation list (146), error/guard hooks.
- `src/modules/public-stats/repository.ts` — mappers + masking choke point (1034, 1064), alias aggregation (304-306), `listSquadPlayers` (724-738).
- `src/modules/statistics/repository/parity-sql.ts` — temporal nickname windowing (35-42), membership ordering (90-97).
- `src/modules/public-stats/routes/pagination/mask.ts` — `maskSteamId` choke point.
- `src/modules/public-stats/routes/models.ts` + `empty-read-model.ts` — read-model contract that must be extended in both places.
- `src/test/integration/steamid-leak-guard.test.ts` — `expectNoSteam64`, route arrays, real-pg harness.
- `src/openapi/verify-openapi.ts`, `package.json` (scripts 29-38, engines, deps) — OpenAPI gate + versions.
- `docker-compose.yml` (3), `docker-compose.prod.yml` (32) — PostgreSQL 17.
- `.agents/skills/solidstats-backend-ts-conventions` + `.../ts-tests` — schema/test/migration discipline (note divergence below).

### Secondary (MEDIUM confidence)
- PostgreSQL 17 `translate`/`regexp_replace`/partial-unique-index/window-function semantics (standard, stable).

### Tertiary (LOW confidence)
- None requiring external validation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all infra exists and was read directly.
- Architecture: HIGH — every change maps to a concrete existing file + line.
- Pitfalls: HIGH — grounded in `migrate.ts` checksum behavior, `pg` cast behavior, masking choke point, and the existing leak-guard.

**Convention note (for the planner):** The `solidstats-backend-ts-conventions` skill prescribes a Kysely + layered factory (`controller→usecase→service→repository`) architecture with `up`/`down` migrations. The **actual** public-stats module (and `migrate.ts`) uses raw `pg` + a `PgPublicStatsReadModel` class + append-only `.sql` migrations with **no `down`**. CONTEXT.md and AGENTS.md ("raw pg, parameterized, no ORM") confirm the repo's real pattern is authoritative for THIS module. **Mirror the existing module (Phase 14/15), not the aspirational skill**, to preserve byte-identical parity and the established choke points. The skill's *discipline* (bound every string/array, derive types from schemas, response schema always declared, one masking choke point, integration-test the repository) still applies.

**Research date:** 2026-06-07
**Valid until:** 2026-07-07 (stable — internal repo code, no fast-moving external deps)
