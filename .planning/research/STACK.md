# Stack Research

**Domain:** Public read API surface completion + OpenAPI contract freeze for a shipped Fastify + TypeBox + PostgreSQL backend (server-2 v3.0 "Public API v1")
**Researched:** 2026-05-31
**Confidence:** HIGH

> Supersedes the 2026-05-09 whole-stack research (v1.0/v2.0) for the v3.0 milestone. The core
> stack (Node + TS + Fastify + TypeBox + PostgreSQL + RabbitMQ + S3 + OpenAPI) is already
> shipped and validated; this document covers ONLY the additions/patterns the new public API
> work needs.

## TL;DR — what to add

**Add ZERO new runtime dependencies.** Every capability this milestone needs is already
covered by deps that shipped v2.0: raw `pg` parameterized SQL, TypeBox schemas,
`@fastify/swagger` for OpenAPI generation, and `openapi-typescript` (already a devDep) on the
`web` side. The work is **pattern additions**, not library additions:

1. **Cursor pagination** → SQL keyset (row-value comparison) over the existing `pg` Pool + a tiny base64-JSON cursor codec written in-repo. No library.
2. **Replay surface** → new TypeBox schemas + `pg` queries against the existing `replays` / `parser_results` / `parser_events` tables. No library.
3. **Sitemap at scale** → a streaming Fastify route that `SELECT id`s in keyset batches and writes XML incrementally. No `sitemap` npm package needed.
4. **slug→id resolution** → a `slug` column + unique index in Postgres, resolved with a single indexed `pg` query. No library.
5. **OpenAPI freeze** → bump `info.version` in the existing `@fastify/swagger` registration, keep the existing generate→diff drift gate, promote `test:integration` into CI. No library.

The only genuinely *new* thing worth adding is an optional **dev-time linter/bundler for the
OpenAPI artifact** (`@redocly/cli`) — only if you want a stricter freeze gate than the current
byte-for-byte drift check. See the OpenAPI Freeze section.

## Recommended Stack

### Core Technologies (already shipped — DO NOT re-add or replace)

| Technology | Version (installed / latest) | Purpose | Why it already suffices for this milestone |
|------------|------------------------------|---------|--------------------------------------------|
| `fastify` | `^5.8.5` (latest 5.8.5) | HTTP framework | Streaming replies (`reply.raw` / async iterables) cover the sitemap; route-level schemas drive OpenAPI. |
| `@sinclair/typebox` | `^0.34.49` (latest 0.34.49) | Request/response schema + static types | Cursor query params, replay/event schemas, and the `paginated()` helper are all expressible as TypeBox. |
| `@fastify/type-provider-typebox` | `^6.1.0` (latest 6.1.0) | Wires TypeBox `Static<>` types into handlers | Already the validation/typing seam for every public route. |
| `@fastify/swagger` | `^9.7.0` (latest 9.7.0) | Generates OpenAPI 3.0.3 from route schemas | `info.version` lives here — this is the single line you bump to freeze. |
| `@fastify/swagger-ui` | `^5.2.6` | Serves `/docs` | No change needed. |
| `pg` | `^8.20.0` (latest 8.21.0) | PostgreSQL driver (raw parameterized SQL) | Keyset pagination, slug lookup, and event timeline are plain SQL over the existing Pool. **This is the codebase idiom** — see "Codebase idiom" below. |
| `pino` | `^10.3.1` | Logging | No change. |

> **Optional patch bump:** `pg` `8.20.0 → 8.21.0` is routine; not required for this milestone.
> Leave it unless you are already touching the lockfile.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `openapi-typescript` | `^7.13.0` (installed; latest 7.13.0) | Generates `web`'s TS client types from the frozen JSON artifact | Already a **devDep** and already wired into `openapi:check`. The `web` repo points its own `openapi-typescript` at the published `openapi/server-2.openapi.json`. **No version change needed.** |
| `@redocly/cli` (OPTIONAL, dev-only) | `^2.x` (verify at adoption) | Lint + bundle the OpenAPI artifact as a stricter freeze gate | ONLY if you want spec-validity + breaking-change linting beyond the current byte-diff drift check. Skippable. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vitest` `^4.1.5` | Unit + Postgres integration tests | `test:integration` already exists and is Postgres-backed; the freeze plan moves it into CI as a gate. No new tooling. |
| `tsx` `^4.21.0` | Runs `openapi:export` / `verify-openapi` scripts | Already used for every `ops:*` and `openapi:*` script. |
| existing `openapi:export` / `verify-openapi.ts` | Generate artifact + byte-for-byte drift gate | Keep as-is; extend with a version-pin assertion (see below). |

## The five capabilities — concrete approach

### 1. Cursor pagination + multi-key server-side sort + stable tie-break

**Approach: SQL keyset (seek) pagination using row-value comparison. No library.**

Current code is **offset-based** (`limit $N offset $N` + a second `count(*)` query, in
`src/modules/public-stats/repository.ts`). Offset degrades on 10k–100k rows (Postgres still
scans+discards `offset` rows) and is unstable under concurrent writes. Replace with keyset.

**Pattern (Postgres row-value comparison gives a stable, index-friendly seek):**

```sql
-- sort: kills desc, then display_name asc, tie-broken by id (id = the unique anchor)
select ...
from canonical_players players
left join player_stats stats on ...
where (kills, players.display_name, players.id) < ($1, $2, $3)   -- the decoded cursor
order by kills desc, players.display_name asc, players.id asc
limit $4 + 1;   -- fetch pageSize+1 to compute hasMore without a count(*)
```

Correctness-critical rules to bake into one shared helper:

- **Always append a unique tie-breaker column** (`id`) to every sort-key set so ordering is a
  *total* order — this is what makes pages stable and the cursor unambiguous. The existing
  queries already do `order by kills desc, players.display_name` but lack the final unique key;
  add `players.id`.
- **The cursor encodes the full sort tuple** of the last row on the page
  (e.g. `{k:42, n:"Foo", id:"uuid"}`), base64-encoded JSON. Write a ~20-line in-repo codec
  (`encodeCursor` / `decodeCursor`) — the only new code, not a dependency.
- **Mixed sort directions** (`kills desc, name asc`) can't use a single SQL row-value `<`
  comparison directly; either (a) expand the `WHERE` per-direction
  (`kills < $1 OR (kills = $1 AND name > $2) OR (kills = $1 AND name = $2 AND id > $3)`), or
  (b) keep all keys same-direction where the domain allows. Encapsulate in the helper so route
  code stays clean.
- **Validate the cursor against the requested sort/filter** — reject a cursor minted for a
  different combination (400). Opaque to clients, self-describing to the server.
- **Drop `total`/`count(*)`** from the hot list path — counting 100k rows per request is the
  expensive part you're removing. If `web` needs a count, expose it as a separate, cacheable
  endpoint, or omit it (cursor UIs show "load more", not page numbers).

**Response shape** — evolve the existing `paginated()` helper in
`src/modules/public-stats/routes/schemas.ts` from `{items, page, pageSize, total}` to a cursor
envelope:

```ts
// new shared TypeBox helper, same file
export function cursorPaginated<T>(item: T) {
  return Type.Object({
    items: Type.Array(item),
    nextCursor: Type.Union([Type.String(), Type.Null()]),
    hasMore: Type.Boolean(),
  });
}
export const CursorQuery = Type.Object({
  cursor: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ default: 25, minimum: 1, maximum: 100 })),
  sort: Type.Optional(Type.String()), // e.g. "kills:desc" — validate against an allow-list
});
```

**Indexing:** add composite indexes matching each `(sortkey..., id)` tuple actually exposed, or
Postgres can't seek efficiently. This indexing is the work that makes 100k-row keyset fast.

**Library check (rejected):** `kysely-cursor` and `kysely-paginate` exist and are good — but
they require Kysely as the query layer. **Kysely (`0.29.0`) is in `package.json` but is dead
code: it appears in zero source files** (`grep -rn kysely src` → nothing; all queries are raw
`pg`). Introducing a cursor library means either adopting Kysely across the stats repository
(large, off-scope refactor) or running a second query paradigm. Neither is warranted; the
keyset pattern is ~40 lines of helper in the existing raw-SQL idiom. **Consider removing the
unused `kysely` dependency** as cleanup (separate decision).

### 2. Replay surface — list / detail / paginated event timeline

**Approach: new TypeBox schemas + `pg` queries over existing tables. No library.**

The data already exists in the shipped schema
(`src/infra/db/migrations/0001_v1_domain_schema.sql`):

- **`replays`** — `id, source_system, source_replay_id, object_key, checksum, size_bytes,
  replay_timestamp, rotation_id, status, promotion_evidence, promoted_from_staging_id,
  created_at, updated_at`. Indexes: `idx_replays_rotation_timestamp (rotation_id,
  replay_timestamp)`, `idx_replays_status (status, created_at)`.
- **`parser_results`** — current normalized snapshot per replay (`status='current'`).
- **`parser_events`** — `id, parser_result_id, event_type, occurred_at, observed_player_ref,
  payload jsonb, source_ref, created_at`. Index: `idx_parser_events_result_type
  (parser_result_id, event_type)`.

Concrete mapping:

- **`GET /stats/replays` (list)** — query `replays` joined to `rotations`, filter by
  rotation/date/map, **cursor-paginate on `(replay_timestamp desc, id desc)`** (the existing
  `idx_replays_rotation_timestamp` covers the rotation-filtered case; add a
  `(replay_timestamp, id)` index for the unfiltered case). Mask any SteamIDs at the mapper
  layer (PROJECT decision: full SteamIDs must never reach `web`).
- **`GET /stats/replays/:id` (detail)** — join `replays` → current `parser_results` for
  map/sides/participants/provenance. Provenance = `promotion_evidence` + `updated_at` +
  `parser_contract_version`.
- **`GET /stats/replays/:id/events` (timeline)** — query `parser_events` via the replay's
  current `parser_result_id`, **cursor-paginate on `(occurred_at asc, id asc)`** with an
  optional `event_type` filter (`idx_parser_events_result_type` covers the type filter; add
  `(parser_result_id, occurred_at, id)` for the time-ordered seek). This is exactly the keyset
  helper from (1) — the event timeline is the highest-row-count consumer and the main reason
  cursor pagination matters.

No new tables, no new deps — schemas + read queries + tests + OpenAPI regeneration.

### 3. SEO sitemap of all replay IDs at scale

**Approach: a streaming Fastify route that keyset-batches `SELECT id` and writes XML
incrementally. No `sitemap` npm package.**

The `sitemap` package (`9.0.1`) is capable but overkill: a replay-ID sitemap is
`<url><loc>…/replays/{slug-or-id}</loc></url>` repeated. Building the whole array in memory
defeats the point at 100k+ rows. Instead:

- Stream the response: set `Content-Type: application/xml`, write the XML header, then **page
  through replay IDs with the same keyset cursor (batches of e.g. 5k)** and write each `<url>`
  chunk to `reply.raw` (or return an async generator / `Readable`). Constant memory, scales to
  any corpus size.
- If the corpus exceeds the **50,000-URL / 50 MB per-sitemap limit** (sitemaps.org spec), emit
  a **sitemap index** pointing at paginated child sitemaps (`/sitemap-1.xml`, …) — also trivial
  from keyset batches. Design the route to take a page param now so this is config later, not a
  rewrite.
- Emit the **slug-based public URLs** `web` uses (capability 4), not raw UUIDs.

The `sitemap` npm package only earns its place if you later need image/news/video sitemap
extensions or hreflang — none apply to a replay-ID index. **Do not add it.**

### 4. slug→id resolution for player / squad / rotation URLs

**Approach: a `slug` column + unique index in Postgres, resolved with one indexed query. No
library.**

`web` uses slug-only URLs; endpoints are UUID-only today (no `slug` anywhere in the codebase —
`grep -rn slug src` → nothing). Options, best first:

- **Persisted `slug` column** on `canonical_players`, `squads`, `rotations` with a `unique`
  index, populated on write (and backfilled by migration). Resolution is a single
  `select id from canonical_players where slug = $1` — index-only, and stable even when display
  names change. **Recommended.**
- **Slug generation:** do it in TypeScript at write time (lowercase, transliterate, collapse to
  `[a-z0-9-]`, append a short disambiguator on collision). This domain has **Cyrillic** display
  names, so a transliteration step is the one place a small helper is useful — a ~30-line
  in-repo map, not a heavy i18n dependency. If a dep is ever wanted, evaluate a tiny slugify
  utility at adoption time; it is **not required** to ship.
- **Resolution endpoint vs slug-addressable routes:** either add
  `GET /stats/players/by-slug/:slug` (returns id or 302), or make the existing detail routes
  accept slug-or-uuid. Slug-addressable detail routes are fewer round-trips for `web`; pick
  based on the frontend router shape. Both are pure `pg` + TypeBox.

Avoid: computing slugs on every read (non-deterministic under renames, breaks bookmarked URLs)
and storing slugs only client-side (the server must resolve them for sitemap + canonical links).

### 5. Freezing / versioning the OpenAPI 3.x contract

**Approach: bump `info.version`, keep the existing generate→byte-diff drift gate, add a
version-pin assertion, move `test:integration` into CI. No library required.**

The freeze machinery is **already built** and just needs tightening:

- **Generation:** `src/openapi/schema.ts` calls `app.swagger()` (from `@fastify/swagger`) and
  serializes to `openapi/server-2.openapi.json`. The version string lives in
  `src/openapi/register-openapi.ts` (`info.version: "0.1.0"`, `openapi: "3.0.3"`).
- **Freeze step 1 — bump the version:** change `info.version` `0.1.0 → 1.0.0` in
  `register-openapi.ts`, run `pnpm run openapi:export`, commit the regenerated JSON. That is the
  literal "freeze."
- **Drift gate (already exists):** `src/openapi/verify-openapi.ts` regenerates and does a
  **byte-for-byte string compare** against the committed artifact, failing CI if stale. Strong,
  dependency-free, and matches the project decision "keep API schema updates in the same change
  as API behavior." Keep it.
- **Freeze step 2 — pin assertion:** add a one-line check (in `verify-openapi.ts` or a sibling)
  asserting `info.version === "1.0.0"` so an accidental bump is caught. Optionally fail on a
  detected *breaking* change (see Redocly below).
- **Freeze step 3 — CI gate:** `test:integration` (Postgres-backed read paths) is currently
  **excluded** from the default `test` script and run separately. Wire it into CI so the frozen
  read contract is exercised end-to-end before publish. The `verify` script already chains
  `openapi:check`, which runs `openapi:verify` *and* feeds the artifact through
  `openapi-typescript` to prove it's consumable — i.e. it already proves `web` can generate
  types. Keep that, and add `test:integration` to the CI job.
- **Consumer side (`web`):** `web` runs its own `openapi-typescript ^7.13.0` against the
  published `openapi/server-2.openapi.json`. No coordination needed beyond a stable artifact
  location and version tag. openapi-typescript 7.x consumes OpenAPI 3.0 and 3.1; the 3.0.3 spec
  server-2 emits is fully supported.

**OPTIONAL stricter gate — `@redocly/cli` (dev-only):** if byte-diff isn't enough and you want
(a) spec **validity** linting and (b) **breaking-change** detection between the frozen `1.0.0`
and future revisions, add `@redocly/cli` as a devDependency and run `redocly lint` +
`redocly bundle` in CI. openapi-typescript integrates with Redocly config for multi-schema
setups. This is the **only place a new (dev) dependency is even arguably warranted**, and it's
optional — the existing byte-diff drift gate already prevents silent contract changes.

## Codebase idiom (read before recommending anything)

- **Queries are raw `pg` parameterized SQL** with hand-threaded `$N` placeholders and small
  `WhereClause` builder helpers (`rotationWhere`, `playerSearchWhere`) — see
  `src/modules/public-stats/repository.ts`. New replay/cursor/slug queries MUST follow this
  pattern, not introduce a query builder.
- **`kysely@0.29.0` is installed but unused** (dead dependency). Do not build on it; consider
  removing it. Do not adopt Kysely-based cursor libraries.
- **Schemas are TypeBox** with a `paginated()` combinator and `Static<>` exports; extend with a
  `cursorPaginated()` combinator and `CursorQuery`.
- **OpenAPI is generated from route schemas** by `@fastify/swagger`, exported to a committed
  JSON artifact, and drift-checked by byte comparison. Every new route automatically lands in
  the contract — there is no separate hand-maintained spec to sync.
- **`pnpm`, not `npm`** (`packageManager: pnpm@11`, Node `>=25 <26`). All install commands use
  `pnpm`.

## Installation

```bash
# Core: NOTHING. All runtime capabilities use already-installed deps.

# Optional (dev only) — stricter OpenAPI freeze gate, skippable:
pnpm add -D @redocly/cli

# Optional cleanup — remove the unused query builder (verify zero usage first):
#   grep -rn "kysely" src
pnpm remove kysely
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| In-repo keyset helper over raw `pg` | `kysely-cursor` / `kysely-paginate` | Only if the codebase migrates its read layer to Kysely wholesale — off-scope here. |
| In-repo base64-JSON cursor codec | Signed/encrypted cursor (HMAC) | If cursors must be tamper-proof against clients enumerating data; not needed for public read stats. |
| Streaming XML sitemap route | `sitemap` npm (`9.0.1`) | If you need image/video/news sitemap extensions or hreflang — none apply to a replay-ID index. |
| Persisted `slug` column + unique index | Slug-addressable resolution endpoint only | Both viable; the persisted column is mandatory regardless (sitemap canonical URLs need it). |
| Existing byte-diff drift gate | `@redocly/cli` lint + breaking-change diff | Add as a dev gate if you want spec-validity + breaking-change enforcement beyond byte-diff. |
| Offset → keyset migration | Keep offset pagination | Never for 10k–100k tables; PROJECT decision already mandates cursor pagination. |

## What NOT to Use / Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any new query builder / ORM (Prisma, Drizzle, Kysely-as-active-dep) | Codebase idiom is raw `pg` parameterized SQL; mixing paradigms adds surface area and breaks the pattern | Raw `pg` + small `WhereClause`/cursor helpers |
| `sitemap` npm package | Builds the URL set in memory; overkill for a flat replay-ID index at 100k+ rows | Streaming XML route + keyset batching (+ sitemap index over 50k URLs) |
| A cursor-pagination npm library | Couples pagination to a query builder you don't use; ~40 lines of helper replaces it | In-repo keyset SQL + cursor codec |
| `count(*)` on every list request | Full scan per request is the exact cost cursor pagination removes | `limit pageSize+1` to derive `hasMore`; separate cacheable count endpoint only if `web` needs it |
| OFFSET pagination on large tables | Postgres scans+discards offset rows; unstable under writes | Keyset / row-value seek |
| Computing slugs at read time | Non-deterministic under display-name changes; breaks bookmarks & sitemap canonicals | Persisted `slug` column, generated at write |
| A heavy i18n / unicode dep just for slug transliteration | Disproportionate for a `[a-z0-9-]` slug | ~30-line in-repo Cyrillic→latin transliteration map |
| Hand-maintaining a separate OpenAPI YAML | Diverges from route schemas; the project generates the spec from `@fastify/swagger` | Keep generating from route schemas + drift gate |
| Bumping `openapi-typescript` or core deps "to be safe" | All are at latest; churn risks the frozen contract | Pin current versions through the freeze |

## Stack Patterns by Variant

**If the replay corpus stays under ~50k replays:**
- A single streaming sitemap route is sufficient.
- A `(replay_timestamp, id)` index plus the existing rotation-scoped index covers list + sitemap seeks.

**If the corpus exceeds 50k replays (sitemaps.org per-file limit):**
- Emit a sitemap **index** + paginated child sitemaps; design the sitemap route to take a page param now so this is config, not a rewrite.

**If `web` needs total counts for page-number UIs (not "load more"):**
- Expose a dedicated, cacheable `…/count` endpoint rather than re-adding `count(*)` to the hot list path.

**If a stricter contract freeze is mandated (breaking-change enforcement):**
- Add `@redocly/cli` (dev) for `lint` + breaking-change diff on top of the existing byte-diff drift gate.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@fastify/swagger@9.7.0` | `fastify@5.8.5` | Plugin v9 targets Fastify v5; already paired correctly. |
| `openapi-typescript@7.13.0` | OpenAPI `3.0.3` artifact (server-2 emits) | 7.x consumes both 3.0 and 3.1; the 3.0.3 spec is fully supported on the `web` side. |
| `@fastify/type-provider-typebox@6.1.0` | `@sinclair/typebox@0.34.x` + `fastify@5.x` | Current trio; no change. |
| `pg@8.20.0` (→8.21.0 available) | `node >=25 <26` | Patch bump optional; keyset SQL is plain parameterized queries, no driver feature dependency. |
| `@redocly/cli@2.x` (optional) | OpenAPI 3.0/3.1 artifacts | Dev-only; integrates with openapi-typescript's redocly config for multi-schema generation. |

## Sources

- Local codebase inspection (HIGH) — `package.json`, `pnpm-lock.yaml`, `src/modules/public-stats/{repository.ts,routes/schemas.ts,routes/filters.ts,routes/models.ts}`, `src/openapi/{register-openapi.ts,export-openapi.ts,verify-openapi.ts,schema.ts}`, `src/infra/db/migrations/0001_v1_domain_schema.sql`. Confirmed: raw `pg` SQL idiom, offset pagination, TypeBox `paginated()` helper, `@fastify/swagger`-generated + byte-diff-gated OpenAPI, `kysely` installed-but-unused, no `slug` anywhere, `replays`/`parser_results`/`parser_events` tables + indexes already present.
- `.planning/PROJECT.md` + `.planning/V2-CUTOVER-REVIEW.md` (HIGH) — locked decisions: cursor + server-side sort on all list endpoints, SteamID masking server-side, slug→id resolution required, OpenAPI `0.1.0 → stable` freeze + CI gate, SSE deferred.
- Context7 `/fastify/fastify-swagger` (HIGH) — OpenAPI `info.version` configuration is the single freeze point; spec generated from route schemas.
- Context7 `/websites/openapi-ts_dev` (HIGH) — `openapi-typescript` CLI consumes a local JSON/YAML schema; supports OpenAPI 3.0 + 3.1; redocly-config multi-schema mode.
- npm registry (HIGH, 2026-05-31) — verified latest versions: `fastify@5.8.5`, `@fastify/swagger@9.7.0`, `@sinclair/typebox@0.34.49`, `@fastify/type-provider-typebox@6.1.0`, `pg@8.21.0` (installed 8.20.0), `openapi-typescript@7.13.0`, `sitemap@9.0.1`.
- Context7 `/lukewpc/kysely-cursor`, `/charlie-hadden/kysely-paginate` (MEDIUM) — confirmed cursor-pagination libs exist but require Kysely; rejected because Kysely is dead code in this repo.
- Postgres keyset/row-value seek pagination (HIGH) — established SQL pattern; cursor-lib docs corroborate the `(sortkeys..., unique_id)` total-order + `WHERE tuple < cursor` technique.

---
*Stack research for: public read API completion + OpenAPI contract freeze (Fastify + TypeBox + PostgreSQL)*
*Researched: 2026-05-31*
