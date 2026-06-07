# Phase 17: Replay Surface - Research

**Researched:** 2026-06-07
**Domain:** Public read API on Fastify 5 / TypeBox / raw `pg` parameterized SQL (no ORM) — replay list, detail, paginated event timeline, SEO sitemap (XML)
**Confidence:** HIGH (all findings grounded in this repo's code; no new external dependencies)

## Summary

Phase 17 is a **pattern-addition phase, not a foundation phase**. Every primitive it needs already exists and is battle-tested in `src/modules/public-stats/`: keyset cursor pagination (`pagination/cursor.ts` + `keyset.ts`), the slug-or-uuid resolver (`looksLikeUuid` branch in `repository.ts`), the SteamID masking choke point (`maskSteamId`), the row→payload provenance pattern (`maxTimestamp`), the dual-declared read-model contract (`models.ts` ↔ `empty-read-model.ts` ↔ `tests/fixtures.ts`), and the OpenAPI auto-generation + Steam64 leak-guard test harness. The replay routes are four new methods on the existing `PublicStatsReadModel` plus one new XML-serving plugin. [VERIFIED: codebase]

The dominant risk is **data-shape**, not mechanics. The `replays` table (`0001_v1_domain_schema.sql`) has **no map column** and **no per-side/participant tables** — map name, per-side outcome, and participant rosters live exclusively inside `parser_results.raw_snapshot` (a `jsonb` column typed as `ParserArtifact`). The `replay_timestamp` column on `replays` is **nullable** (legacy rows), and the event table `parser_events` orders on `occurred_at` (also **nullable**) — both require NULLS-aware keyset ordering, which the existing `buildKeysetPredicate` already implements. [VERIFIED: codebase]

**Primary recommendation:** Add four read-model methods (`listReplays`, `getReplay`, `getReplayEvents`, plus a sitemap enumerator) that reuse the existing keyset + masking + provenance + slug helpers verbatim, derive map/per-side/participants from `parser_results.raw_snapshot` of the `current` parser result, and add a separate `registerReplaySitemapRoutes` Fastify plugin that serves XML via `reply.type("application/xml")` outside the `@fastify/swagger` JSON contract. Surface map filtering only if a map source is locked in discussion (see Open Questions / Grey Areas).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Replay list + filters + cursor (REPLAY-01) | API / Backend (`public-stats` repository) | Database (keyset index) | List + keyset SQL is owned by `PgPublicStatsReadModel`, mirroring `listPlayers`/`listBounty`. |
| Replay detail + per-side + participants + provenance (REPLAY-02) | API / Backend (repository) | Database (`replays` + `parser_results.raw_snapshot`) | Detail assembly + masking + provenance is a mapper-boundary job, mirroring `getSquad`. |
| Event timeline pagination (REPLAY-03) | API / Backend (repository) | Database (`parser_events` + new keyset index) | NULLS-aware keyset over `parser_events`, reusing `buildKeysetPredicate`. |
| Sitemap index + child sitemaps (REPLAY-04) | API / Backend (new XML route plugin) | Database (replay id/slug enumeration) | XML serving sits outside the JSON/OpenAPI contract; own Fastify child plugin with `reply.type`. |
| SteamID masking in participants | API / Backend (mapper choke point) | — | `maskSteamId` is the single row→payload choke point; participants must route every steam_id through it. |

## Standard Stack

### Core (all already installed — zero new dependencies, per ROADMAP decision)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fastify` | ^5.8.5 | HTTP framework | Existing stack; routes registered as plugins. [VERIFIED: package.json] |
| `@sinclair/typebox` (`Type`, `Static`) | ^0.34.49 | Request/response schemas | Every existing route schema uses it; OpenAPI generated from it. [VERIFIED: package.json] |
| `@fastify/type-provider-typebox` | ^6.1.0 | TypeBox↔Fastify type provider | Wired in `app.ts` via `.withTypeProvider`. [VERIFIED: app.ts] |
| `@fastify/swagger` | ^9.7.0 | OpenAPI 3.0.3 generation | `registerOpenApi` in `register-openapi.ts`; schema captured by `app.swagger()`. [VERIFIED: register-openapi.ts] |
| `pg` (`Pool`, `QueryResultRow`) | ^8.20.0 | Parameterized SQL data access | `PgPublicStatsReadModel` uses `this.pool.query<Row>(sql, values)` exclusively; **no ORM, no Kysely in this module**. [VERIFIED: repository.ts] |

### Supporting (existing in-repo helpers to reuse verbatim)
| Helper | Path | Purpose |
|--------|------|---------|
| `encodeCursor` / `decodeCursor` / `CursorPayload` | `src/modules/public-stats/routes/pagination/cursor.ts` | base64url opaque cursor codec, structurally validated on decode. [VERIFIED: codebase] |
| `buildKeysetPredicate` / `KeysetDescriptor` | `src/modules/public-stats/routes/pagination/keyset.ts` | NULLS-aware expanded-OR seek predicate + stable `ORDER BY`. Already handles nullable sort keys. [VERIFIED: codebase] |
| `keysetSeek` / `keysetResult` (private helpers) | `src/modules/public-stats/repository.ts` | over-fetch `limit+1` reassembly into `{ items, nextCursor, hasMore }`. [VERIFIED: codebase] |
| `page()` + `resolveSort()` + sort whitelist pattern | `routes/filters.ts`, `routes/pagination/sort.ts` | request → `PageQuery`, sort-field whitelisting against a fixed `expr`. [VERIFIED: codebase] |
| `looksLikeUuid` | `routes/slug.ts` | branch slug-or-uuid resolution so a slug never hits `::uuid` (avoids 500). [VERIFIED: codebase] |
| `maskSteamId` | `routes/pagination/mask.ts` | the single Steam64 → `...NNNN` choke point. [VERIFIED: codebase] |
| `maxTimestamp` | `routes/provenance.ts` | row-derived `{ lastUpdatedAt }`, never `now()`. [VERIFIED: codebase] |
| `withGaps` | `routes/history-gaps.ts` | (only if event timeline wants gap markers; likely not needed). [VERIFIED: codebase] |

**Installation:** None. Per ROADMAP decision: "Add zero new runtime dependencies; all capabilities are pattern additions on the shipped stack." [CITED: .planning/ROADMAP.md / STATE.md Decisions]

## Package Legitimacy Audit

> Not applicable — Phase 17 installs **no** external packages (explicit ROADMAP decision: zero new runtime dependencies). All work uses already-installed, already-audited libraries. No slopcheck run required. [VERIFIED: ROADMAP decision + package.json]

## Project Constraints (from AGENTS.md / CLAUDE.md)

- **No ORM in public-stats reads.** Use raw `pg` parameterized SQL via `this.pool.query<Row>(sql, values)`. (The conventions skill names Kysely as the prescribed access layer, but the entire `public-stats` module is raw `pg`; **follow the module's established pattern** — every list/detail method in `repository.ts` is raw parameterized SQL. Do not introduce Kysely here.) [VERIFIED: repository.ts]
- **Never string-concatenate request values into SQL.** All values bind as `$n` placeholders; only fixed server-chosen `expr` strings (from sort whitelists) ever reach the SQL text. [VERIFIED: keyset.ts/sort.ts comments]
- **Do not parse OCAP replay contents in this repo.** Reading already-persisted `parser_results.raw_snapshot` jsonb is allowed (that is stored parser output, not parsing). [CITED: AGENTS.md]
- **OpenAPI is the contract for `web`.** Every new route MUST declare a TypeBox `schema`; after adding routes run `pnpm run openapi:export` and commit `openapi/server-2.openapi.json`. `pnpm run openapi:verify` fails the build on stale schema. **XML sitemap routes are the exception** — see Sitemap section. [VERIFIED: verify-openapi.ts, package.json]
- **100% reachable-source coverage** (`@vitest/coverage-v8`), with `/* v8 ignore next -- @preserve */` only for rare justified branches. [CITED: solidstats-backend-ts-tests SKILL]
- **Strict ESLint 10 `all`** + Unicorn + import hygiene + Prettier. Existing files use `/* eslint-disable max-lines, ... */` headers where justified — match that style; prefer extracting helpers over disabling. [VERIFIED: repository.ts/routes.ts headers]
- **Clean git tree every session** (commit completed work). [CITED: AGENTS.md]
- **GSD workflow gate**: edits go through GSD execution, not ad-hoc. [CITED: AGENTS.md]

## Architecture Patterns

### System Architecture Diagram

```
HTTP GET /stats/replays?rotationId&map&fromDate&toDate&cursor&sort&order
HTTP GET /stats/replays/:id            (slug-or-uuid)
HTTP GET /stats/replays/:id/events?cursor&limit
HTTP GET /sitemap.xml                  (index)
HTTP GET /sitemap-replays-:n.xml       (child, <=50k urls)
        │
        ▼
 Fastify plugin (registerPublicStatsRoutes child scope)   ── JSON routes: TypeBox schema → OpenAPI
        │                                                  ── reuses preValidation reject-legacy-pagination
        │                                                  ── reuses setErrorHandler BadCursorError→400
        ▼
 PublicStatsReadModel (interface in models.ts)
   ├── listReplays(filters, page)      ─┐
   ├── getReplay(id)                    │  PgPublicStatsReadModel (repository.ts)
   ├── getReplayEvents(id, page)        │    raw pg parameterized SQL
   └── (sitemap) listReplayIdsPage()   ─┘
        │
        ▼  pool.query<Row>(sql, $n values)
 PostgreSQL
   ├── replays            (id, slug, source_system, source_replay_id, rotation_id,
   │                       replay_timestamp NULLABLE, status, created_at, updated_at)
   ├── parser_results     (replay_id, status='current', raw_snapshot jsonb=ParserArtifact)
   │      └── raw_snapshot.players[]   → participants (name n, side s, steam_id sid, ...)
   │      └── raw_snapshot.side_facts  → per-side outcome (commanders[], outcome.winner_side)
   │      └── raw_snapshot.replay      → map (UNTYPED — see Grey Area: map source)
   └── parser_events      (parser_result_id, event_type, occurred_at NULLABLE, payload jsonb)
        │
        ▼  mapper boundary
 maskSteamId(participant.sid)  ── single Steam64 choke point
 maxTimestamp([...])           ── provenance
        ▼
 JSON payload (no full Steam64 anywhere)  ───────────────────►  web
 XML sitemap (reply.type("application/xml"))  ─────────────────►  search crawlers
```

### Recommended file additions (follow module layout exactly)
```
src/modules/public-stats/
├── repository.ts                 # ADD: listReplays / getReplay / getReplayEvents / listReplayIdsPage methods
├── routes/
│   ├── models.ts                 # ADD: ReplaySummary, ReplayDetail, ReplayEvent, ReplayListFilters, + 4 read-model methods
│   ├── empty-read-model.ts       # ADD: 4 stubs returning empty/null (Pitfall: must mirror interface)
│   ├── schemas.ts                # ADD: ReplaySummaryResponse, ReplayDetailResponse, ReplayEventResponse, ReplayListQuery
│   ├── routes.ts                 # ADD: registerReplayRoutes(scope, options)
│   ├── filters.ts                # ADD: replayListFilters(query) + REPLAY_SORT page() wiring
│   ├── pagination/sort.ts        # ADD: REPLAY_SORT whitelist (timestamp/created_at), EVENT cursor descriptor
│   ├── sitemap.ts                # NEW: pure XML builders (sitemapIndexXml / urlsetXml) — unit-testable
│   ├── sitemap-routes.ts         # NEW: registerReplaySitemapRoutes (XML, reply.type, no TypeBox response)
│   └── tests/fixtures.ts         # ADD: 4 fake methods + replaySummary()/replayDetail()/replayEvent() builders
└── tests/postgres.test.ts        # ADD: real-pg replay list/detail/events keyset + NULL-timestamp cases
```
A new SQL migration (`0007_*.sql`) is needed for the event-timeline keyset index and (if map filtering is approved) a generated/extracted map column or index. [VERIFIED: keyset perf rationale in 0005]

### Pattern 1: List endpoint with keyset pagination + filters
**What:** `listReplays(filters, page)` mirrors `listBounty` (stored-column sort → seek in `WHERE`, not `HAVING`, because no `GROUP BY`).
**When to use:** REPLAY-01.
**Example (grounded in `listBounty`, `repository.ts:463`):**
```ts
// Source: src/modules/public-stats/repository.ts (listBounty pattern)
public async listReplays(
  filters: ReplayListFilters,
  page: PageQuery,
): Promise<PaginatedResult<ReplaySummary>> {
  const where = buildReplayWhere(filters),               // rotationId / fromDate / toDate as $n
    seek = keysetSeek(REPLAY_SORT, page, "replays.id", where.values.length),
    whereClause = composeWhere(where.sql, seek.predicateSql), // seek in WHERE (stored column)
    values = [...where.values, ...seek.values, page.limit + 1],
    result = await this.pool.query<ReplayRow>(
      `select replays.id, replays.slug, replays.source_system, replays.source_replay_id,
              replays.rotation_id, replays.replay_timestamp, replays.status, replays.created_at
       from replays
       ${whereClause}
       order by ${seek.orderBySql}
       limit $${String(values.length)}`,
      values,
    );
  return keysetResult(result.rows, page, {
    toCursor: (row) => replayRowCursor(row, page),
    toItem: (row) => mapReplaySummary(row),
  });
}
```
> **Sort key is nullable.** `replay_timestamp` is `NULLABLE`. The `REPLAY_SORT` descriptor MUST set `nullable: true` so `buildKeysetPredicate` emits the 4-branch NULLS-aware predicate. The existing builder already handles this (it was written for future nullable keys — `sort.ts` comment). Bind value cast = `"text"` if ordering on the ISO timestamp string, or use a stable numeric/`timestamptz` ordering — see Grey Area: event/replay ordering. [VERIFIED: keyset.ts, sort.ts]

### Pattern 2: Detail endpoint, slug-or-uuid, assembled from `replays` + `parser_results.raw_snapshot`
**What:** `getReplay(id)` resolves slug-or-uuid (the `looksLikeUuid` branch), loads the replay row, then joins/loads the **`current`** parser result's `raw_snapshot`, derives per-side + participants from it, masks every steam id, and attaches provenance.
**Example (slug branch grounded in `getRotation`, `repository.ts:809`; raw_snapshot read grounded in `readiness.ts:104`):**
```ts
// Source: getRotation slug branch + readiness.ts raw_snapshot read
public async getReplay(id: string): Promise<ReplayDetail | null> {
  const isUuid = looksLikeUuid(id);
  const whereClause = isUuid ? "r.id = $1::uuid" : "r.slug = $1::text";
  const result = await this.pool.query<ReplayDetailRow>(
    `select r.id, r.slug, r.source_system, r.source_replay_id, r.rotation_id,
            r.replay_timestamp, r.status, r.created_at, r.updated_at,
            rot.name as rotation_name, rot.slug as rotation_slug,
            pr.raw_snapshot
     from replays r
     left join rotations rot on rot.id = r.rotation_id
     left join parser_results pr on pr.replay_id = r.id and pr.status = 'current'
     where ${whereClause}`,
    [id],
  );
  const [row] = result.rows;
  if (row === undefined) return null;                       // 404 at route
  return mapReplayDetail(row);                              // per-side + participants + maskSteamId + provenance
}
```
> **Participants masking (SEC-01/02 — non-negotiable):** every `raw_snapshot.players[].sid` MUST pass through `maskSteamId` before serialization, OR be omitted entirely. The Steam64 leak-guard integration test enumerates routes and asserts `7656119\d{10}` finds zero matches over `response.json()` AND `response.payload`. **Add the new replay-detail and replay-events routes to that test's `PUBLIC_DETAIL_ROUTES` array** (and seed a player with a planted Steam64 in the real-pg sweep). [VERIFIED: steamid-leak-guard.test.ts]

### Pattern 3: Event timeline keyset over a NULLABLE ordering column
**What:** `getReplayEvents(id, page)` pages `parser_events` for the replay's `current` parser result, ordered by a stable composite key with a hard max page size.
**Example (NULLS-aware seek grounded in `buildKeysetPredicate`):**
```ts
// parser_events has NO direct replay_id — join through parser_results (status='current').
// occurred_at is NULLABLE → descriptor.nullable = true → 4-branch NULLS-aware seek.
const EVENT_KEYSET: KeysetDescriptor = {
  expr: "events.occurred_at",   // or "events.created_at" — see Grey Area
  numeric: false,
  castType: "text",             // bind ISO string; OR model a seq column (see recommendation)
  nullable: true,
};
// ORDER BY events.occurred_at ASC NULLS FIRST, events.id ASC   (orderBy() in keyset.ts)
```
> The existing `keyset.ts` `orderBy()` produces `ASC NULLS FIRST` / `DESC NULLS LAST` and always appends `id ASC` as the unique tie-breaker — exactly what REPLAY-03's "stable cursor that handles legacy NULL `replay_timestamp` rows" requires. The cursor `id` tie-breaker is `parser_events.id` (uuid). [VERIFIED: keyset.ts]

### Pattern 4: Sitemap XML (outside the JSON/OpenAPI contract)
**What:** A separate Fastify child plugin that serves `application/xml`. Do NOT give these routes a TypeBox `response` schema (that would force JSON serialization and pollute the OpenAPI doc). Build XML in pure, unit-tested string builders.
**Example:**
```ts
// Source: Fastify reply.type pattern + sitemaps.org protocol
app.get("/sitemap.xml", async (_request, reply) => {
  const pages = await options.readModel.countReplaySitemapPages(); // ceil(total / 50000)
  return reply.type("application/xml").send(sitemapIndexXml(pages, baseUrl));
});
app.get<{ Params: { n: string } }>("/sitemap-replays-:n.xml", async (request, reply) => {
  const ids = await options.readModel.listReplaySitemapPage(Number(request.params.n));
  return reply.type("application/xml").send(urlsetXml(ids, baseUrl));
});
```
- Use `config.publicBaseUrl` (envalid `PUBLIC_BASE_URL`, default `http://localhost:3000`) for absolute `<loc>` URLs — sitemaps require absolute URLs. [VERIFIED: config/env.ts]
- XML-escape all dynamic content (`&`, `<`, `>`, `"`, `'`) in the pure builder. Slugs match `^[A-Za-z0-9-]+$` so are escape-safe, but escape defensively.
- `<urlset>`/`<sitemapindex>` namespace: `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"`. Hard cap **50,000 URLs per child sitemap** (sitemaps.org protocol limit). [CITED: sitemaps.org/protocol.html]
- These routes are registered as their own plugin so the `rejectLegacyPaginationParameters` preValidation and `BadCursorError→400` handler (scoped to the JSON public-stats child) do not apply. [VERIFIED: routes.ts child-scope encapsulation]

### Anti-Patterns to Avoid
- **Casting a slug to `::uuid`.** Always branch with `looksLikeUuid` first; PG evaluates `$1::uuid` eagerly even inside short-circuit `AND`, producing a 500 instead of a 404. [VERIFIED: repository.ts comments]
- **Putting the keyset seek in `HAVING` for a non-grouped query.** Replay list has no `GROUP BY` → seek goes in `WHERE` (the `listBounty`/`composeBountyWhere` shape), not the `listPlayers` `HAVING` shape. [VERIFIED: repository.ts]
- **Giving sitemap routes a TypeBox `response` schema.** It forces JSON content negotiation and adds noise to `openapi/server-2.openapi.json`. Serve raw XML via `reply.type`. [CITED: Fastify docs]
- **Reading any `parser_results` row regardless of status.** Always filter `status = 'current'`; superseded/failed snapshots must not surface. [VERIFIED: readiness.ts, full-run.ts]
- **Returning unbounded event pages.** Enforce a hard server-side max page size (clamp `limit`) — see Grey Area: hard max page size.
- **Trusting `raw_snapshot.players[].sid` to be absent.** It is often present (`steam-1` in fixtures; full Steam64 in leak-guard seed). Mask or omit unconditionally. [VERIFIED: fixtures, leak-guard test]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Opaque cursor codec | custom base64/JSON | `encodeCursor`/`decodeCursor` (`cursor.ts`) | structurally validated, tamper-rejecting, shared sort whitelist. [VERIFIED] |
| NULLS-aware seek predicate | hand-written `WHERE (a,b) > (...)` | `buildKeysetPredicate` (`keyset.ts`) | tuple comparison breaks on mixed-direction + NULL; the builder's expanded-OR form is correct. [VERIFIED] |
| Over-fetch → `{items,nextCursor,hasMore}` | manual slice + COUNT | `keysetResult` (`repository.ts`) | no COUNT, satisfies "no total" contract. [VERIFIED] |
| Slug-or-uuid resolution | inline regex per call | `looksLikeUuid` + the two-branch `whereClause` | avoids the `::uuid` 500 trap. [VERIFIED] |
| Steam64 masking | per-route string slicing | `maskSteamId` (single choke point) | one auditable boundary the leak-guard test enforces. [VERIFIED] |
| Provenance timestamp | `new Date()` / `now()` | `maxTimestamp([...rows])` | HIST-03 requires row-derived freshness; `now()` is forbidden and grep-gated. [VERIFIED] |
| Sort-field validation | accept `?sort=` raw | `resolveSort` + a fixed `REPLAY_SORT` whitelist | raw `sort` must never reach SQL text. [VERIFIED] |

**Key insight:** Phase 17 should be almost entirely composition of existing primitives. The only genuinely new code is (a) the four read-model methods + their SQL, (b) the `raw_snapshot` → per-side/participants mapper, and (c) the XML sitemap builders + plugin. [VERIFIED: codebase]

## Runtime State Inventory

> Phase 17 adds read endpoints and (likely) one additive migration + index. It does **not** rename or migrate existing runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no rename. Replay slugs already backfilled in migration `0006` (`replays.slug`, `uq_replays_slug`, `idx_replays_slug`). | None — verified by reading `0006_slug_addressing.sql`. |
| Live service config | None — no external service config touched. | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | Reads existing `PUBLIC_BASE_URL` (envalid, default `http://localhost:3000`) for sitemap absolute URLs — already defined, no new secret. | None — verified in `config/env.ts`. |
| Build artifacts | New migration `0007_*.sql` is sha256-checksummed by `migrate.ts`; once applied it must never be edited (checksum-mismatch throws). Write it correct the first time, idempotently (`create index if not exists`). | Author migration carefully; never edit post-apply. |

## Common Pitfalls

### Pitfall 1: Map name / map filter has no structured data source
**What goes wrong:** REPLAY-01 (filter by map) and REPLAY-02 (map in detail) assume a map field, but `replays` has **no map column**, and `ParserArtifact.replay` is `Record<string, unknown> | null` — untyped, and **not even populated in any test fixture**.
**Why it happens:** Map info, if present at all, lives inside `parser_results.raw_snapshot.replay` jsonb with an unverified key name.
**How to avoid:** **This is a locked-decision-needed grey area** (see below). Do not invent a key name. Options: (a) extract a known key from `raw_snapshot.replay` if discussion confirms one exists; (b) add an additive `replays.map_name text` column populated at promotion/parse time (cross-app — needs `replay-parser-2`/promotion confirmation); (c) descope the map filter to "filter by rotation + date only" for v1 and defer map to a follow-up. Tag any chosen key `[ASSUMED]` until confirmed against real parser output.
**Warning signs:** A plan task that hard-codes `raw_snapshot->'replay'->>'mission'` or similar without a cited source.

### Pitfall 2: Forgetting to mask participant steam ids
**What goes wrong:** Full Steam64 leaks via `raw_snapshot.players[].sid`; the leak-guard test fails (or worse, passes because the new route wasn't added to its route list).
**How to avoid:** Route every participant `sid` through `maskSteamId` (or omit), AND extend `steamid-leak-guard.test.ts` `PUBLIC_DETAIL_ROUTES` + the real-pg seeded sweep to include `/stats/replays/:id` and `/stats/replays/:id/events`. Seed a replay whose `current` parser_result `raw_snapshot.players[].sid` contains the planted `76561198012347890`.
**Warning signs:** New detail route absent from the leak-guard route arrays.

### Pitfall 3: `parser_events` has no `replay_id` — must join through `parser_results`
**What goes wrong:** Writing `where parser_events.replay_id = ...` — that column does not exist. `parser_events.parser_result_id → parser_results.replay_id` is the only path, and you must pin `parser_results.status = 'current'`.
**How to avoid:** Resolve `replay → current parser_result_id` first (or join inline), then page events by `parser_result_id`.
**Warning signs:** SQL referencing a nonexistent `parser_events.replay_id`.

### Pitfall 4: Read-model contract triple-declaration drift
**What goes wrong:** A new method added to the `PublicStatsReadModel` interface (`models.ts`) but not to `createEmptyPublicStatsReadModel` (`empty-read-model.ts`) or `FakePublicStatsReadModel` (`tests/fixtures.ts`) → TS compile error / boot-without-DB failure.
**How to avoid:** Every new read-model method must be declared in **all three** places simultaneously, matching Phase 16's pattern (stubs return `[]`/`null`/empty page). [VERIFIED: empty-read-model.ts, fixtures.ts]
**Warning signs:** `typecheck` failure on `PublicStatsReadModel` not satisfied.

### Pitfall 5: Stale OpenAPI snapshot
**What goes wrong:** New JSON routes added but `openapi/server-2.openapi.json` not regenerated → `pnpm run openapi:verify` fails the `verify` gate.
**How to avoid:** After route changes run `pnpm run openapi:export` and commit the JSON. (Sitemap XML routes intentionally do not appear in OpenAPI — no schema → no path entry.) [VERIFIED: verify-openapi.ts]
**Warning signs:** "OpenAPI schema is stale" in CI.

### Pitfall 6: Editing an already-applied migration
**What goes wrong:** `migrate.ts` stores a sha256 of each migration file; any byte change after apply throws `Migration <id> checksum changed after apply`.
**How to avoid:** New migration `0007_*.sql` must be correct and idempotent on first commit; never edit it afterward — write a new migration instead. [VERIFIED: migrate.ts]

## Code Examples

### Sort whitelist + filters wiring (REPLAY-01)
```ts
// Source: src/modules/public-stats/routes/pagination/sort.ts (BOUNTY_SORT shape)
export const REPLAY_SORT = {
  // timestamp ordering must be NULLS-aware (legacy rows have NULL replay_timestamp)
  date: {
    expr: "replays.replay_timestamp",
    numeric: false,           // timestamptz; bind ISO text or model numeric epoch — see Grey Area
    castType: "text",
    nullable: true,           // CRITICAL: drives the 4-branch NULLS-aware seek
  },
} as const satisfies Readonly<Record<string, SortDescriptor>>;
export const REPLAY_SORT_DEFAULT = "date";
```

### XML builder (pure, unit-testable) for sitemap (REPLAY-04)
```ts
// Source: sitemaps.org/protocol.html
const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
export function urlsetXml(slugsOrIds: string[], baseUrl: string): string {
  const urls = slugsOrIds
    .map((s) => `  <url><loc>${escapeXml(`${baseUrl}/replays/${s}`)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NS}">\n${urls}\n</urlset>\n`;
}
export function sitemapIndexXml(pageCount: number, baseUrl: string): string {
  const entries = Array.from({ length: pageCount }, (_unused, i) =>
    `  <sitemap><loc>${escapeXml(`${baseUrl}/sitemap-replays-${i}.xml`)}</loc></sitemap>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${SITEMAP_NS}">\n${entries}\n</sitemapindex>\n`;
}
```

### Real-pg integration test shape (REPLAY-03 NULL-timestamp determinism)
```ts
// Source: src/modules/public-stats/tests/postgres.test.ts harness
// Seed two events with occurred_at = NULL and two with timestamps; assert the
// ASC NULLS FIRST, id ASC cursor walks them in a stable, gap-free order across pages.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `page`/`pageSize`/`total` offset pagination | opaque keyset cursor + `hasMore` | Phase 14 | Replay list MUST use the cursor contract; `page`/`pageSize` are 400-rejected by the shared `preValidation` hook. [VERIFIED] |
| Full Steam64 in profile responses | `maskSteamId` choke point + pino redaction + leak-guard test | Phase 14 | Participants must mask/omit; leak-guard test must include the new routes. [VERIFIED] |
| UUID-only resource addressing | slug-or-uuid via `looksLikeUuid` | Phase 16 | Replay detail + sitemap should prefer the existing `replays.slug`. [VERIFIED] |
| No freshness metadata | `maxTimestamp` provenance envelope on singular responses | Phase 16 | Replay detail should carry `provenance: { lastUpdatedAt }`. [VERIFIED] |

**Deprecated/outdated:** none new; Phase 17 has no deprecations.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Map name (if surfaced) comes from `parser_results.raw_snapshot.replay` jsonb; **the exact key is unknown and unpopulated in fixtures**. | Pitfall 1 / Grey Areas | HIGH — REPLAY-01 map filter + REPLAY-02 map field could ship reading a nonexistent key, returning null/empty for every replay. Must be locked in discussion or descoped. |
| A2 | "per-side summary" is best derived from `raw_snapshot.side_facts` (commanders[] + outcome.winner_side) plus per-player `s` (side) counts. | Grey Areas | MEDIUM — shape is a design choice; needs confirmation of what `web`'s replay page renders. |
| A3 | Sitemap `<loc>` URL form should use `replays.slug` (SEO-friendly) under `PUBLIC_BASE_URL`, NOT the API path. The frontend route shape (`/replays/:slug`) is a `web` concern. | Grey Areas | MEDIUM — wrong URL form yields a technically-valid but useless sitemap; confirm `web`'s replay URL pattern. |
| A4 | Event timeline orders on `parser_events.occurred_at NULLS FIRST, id`; if determinism across NULL rows proves insufficient, a monotonic per-result sequence is preferable. | Grey Areas | MEDIUM — `occurred_at`+`id` is deterministic given unique `id`, but ordering of NULL-timestamp events is arbitrary-but-stable (by id), which may not match parser emission order. |
| A5 | Hard max event page size = 200 (proposed default). | Grey Areas | LOW — tunable; just needs a locked number. |
| A6 | Child sitemap page size = 50,000 URLs (protocol max); gzip not required for v1. | Grey Areas | LOW — well-grounded in sitemaps.org; gzip is an optimization. |

## Open Questions / Grey Areas to Lock in Discussion

1. **Map data source (BLOCKING for REPLAY-01 map filter + REPLAY-02 map field).**
   - What we know: no `replays.map` column; `ParserArtifact.replay` is untyped `Record<string, unknown> | null`; no fixture populates it.
   - What's unclear: does real parser output carry a map/mission/world name, and under what key?
   - Recommendation (pick one): **(a)** if a confirmed key exists in real `raw_snapshot.replay`, extract it (tag `[ASSUMED]` until verified against production data); **(b)** add an additive `replays.map_name` column populated at promotion (cross-app change — needs `replay-parser-2`/promotion sign-off); **(c) recommended for v1:** descope the map *filter* to rotation+date and surface map name in detail only if (a) is confirmed, deferring full map filtering. STATE.md already flags this class of decision as a pending todo.

2. **Per-side summary shape (REPLAY-02).**
   - Options: minimal `{ side, winner: boolean|null, participantCount }[]` derived from `side_facts.outcome.winner_side` + per-player `s` counts; OR richer per-side aggregates (kills/teamkills summed from `raw_snapshot.players`).
   - Recommendation: start minimal — `sides: [{ side, isWinner, participantCount }]` plus `outcome: { status, winnerSide }` from `side_facts`. Expand only if `web` needs per-side stat sums. Tag `[ASSUMED]` pending `web` confirmation.

3. **Participant identity shape (REPLAY-02, SEC-01/02).**
   - Recommendation: `{ displayName, side, group?, maskedSteamId? }` where `maskedSteamId` is `maskSteamId(sid)` or omitted. Where a participant resolves to a canonical player, also include `{ id, slug }` (mirrors the `PlayerReferenceSlug` history shape). Never include raw `sid`.

4. **Event timeline ordering/cursor key (REPLAY-03).**
   - Options: **(A)** `(occurred_at NULLS FIRST, id)` using the existing `buildKeysetPredicate` as-is (zero new schema, deterministic by unique `id`); **(B)** add a monotonic `sequence integer` column to `parser_events` populated at ingest (matches true emission order, but is a schema + ingest-path change crossing into the statistics/ingest module).
   - Recommendation: **(A)** for v1 — it satisfies "stable cursor that handles legacy NULL `replay_timestamp` rows" with no schema risk; NULL-timestamp events sort deterministically by `id`. Reserve (B) as a follow-up if true chronological order of legacy NULL events becomes a product requirement.
   - Required index: `create index if not exists idx_parser_events_result_occurred on parser_events (parser_result_id, occurred_at, id);` (migration `0007`).

5. **Sitemap URL form + sizing (REPLAY-04).**
   - URL form: use `replays.slug` under `PUBLIC_BASE_URL` (e.g. `https://.../replays/<slug>`). Confirm `web`'s replay route pattern.
   - Page size: 50,000 URLs/child (protocol max). Gzip: not required for v1 (recommend skipping).

6. **Hard max event page size (REPLAY-03).** Recommend clamping `limit` to a max of **200** (default 100). Lock the number.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime | ✓ (repo targets >=25 <26; local shell may be v22 — emits engine warnings) | target 25.x | none — warnings are non-fatal per STATE.md |
| PostgreSQL | repository SQL + real-pg integration tests | ✓ via Docker Compose (`postgresql://solid:solid@localhost:15432/solid_stats`) | per compose image | none — integration tests require it |
| pnpm | scripts (`verify`, `openapi:check`) | ✓ (scripts use `pnpm run`) | — | none |
| `openapi-typescript` (devDep) | `openapi:check` | ✓ (devDependency) | — | none |

**Missing dependencies with no fallback:** none — all required tooling is already present.
**Note:** integration tests (`test:integration`, real-pg leak guard, `tests/postgres.test.ts`) need a running Postgres on `localhost:15432`. [VERIFIED: leak-guard test env block, postgres.test.ts]

## Validation Architecture

> `workflow.nyquist_validation` is `true` (config.json) — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 + `@vitest/coverage-v8` |
| Config file | (Vitest projects: unit vs integration; see `package.json` scripts) |
| Quick run command | `pnpm test` (excludes integration + `tests/postgres.test.ts`) |
| Full suite command | `pnpm run verify` (format, lint, typecheck, unit, integration, openapi:check, ops checks, coverage) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REPLAY-01 | list replays + rotation/date filters + cursor paging (incl. NULL-timestamp ordering) | integration (real-pg) | `pnpm run test:integration` (add cases to `public-stats/tests/postgres.test.ts`) | ❌ Wave 0 (extend existing file) |
| REPLAY-01 | route schema + query validation + 400 on legacy `page` | integration (`app.inject`) | add to `public-stats/routes/tests/` | ❌ Wave 0 |
| REPLAY-02 | detail: slug-or-uuid resolve, per-side, participants, provenance | integration + unit (mapper) | `pnpm run test:integration` + unit on `mapReplayDetail` | ❌ Wave 0 |
| REPLAY-02 | NO full Steam64 in participants | integration (real-pg leak guard) | extend `src/test/integration/steamid-leak-guard.test.ts` route arrays + seed | ❌ Wave 0 (extend existing) |
| REPLAY-03 | event timeline keyset, hard max page size, NULL `occurred_at` determinism | integration (real-pg) | `pnpm run test:integration` | ❌ Wave 0 |
| REPLAY-04 | sitemap index + child sitemaps; XML well-formed; <=50k URLs; absolute URLs | unit (pure XML builders) + integration (`app.inject`, assert `content-type: application/xml`) | `pnpm test` (unit on `sitemap.ts`) + `test:integration` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test` (+ targeted `pnpm run test:integration <file>` when touching SQL).
- **Per wave merge:** `pnpm run verify`.
- **Phase gate:** full `pnpm run verify` green (incl. `openapi:check`, coverage 100%) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] Extend `src/modules/public-stats/routes/tests/fixtures.ts` — 4 fake read-model methods + replay builders (mirror interface).
- [ ] Add unit test file for `routes/sitemap.ts` pure XML builders (escaping, namespace, 50k boundary).
- [ ] Extend `src/modules/public-stats/tests/postgres.test.ts` — replay list/detail/events real-pg cases incl. NULL-timestamp determinism.
- [ ] Extend `src/test/integration/steamid-leak-guard.test.ts` — add replay routes to `PUBLIC_DETAIL_ROUTES` + seed a `current` parser_result with planted Steam64 in `raw_snapshot.players[].sid`.
- [ ] Add route integration tests (`app.inject`) for the 4 JSON routes + the 2 XML routes (assert `application/xml`).

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 2`, `security_block_on: high` (config.json) — section required.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Public read endpoints; no auth (matches all other `/stats/*` routes). [VERIFIED: routes.ts] |
| V3 Session Management | no | No sessions on public stats. |
| V4 Access Control | no | Anonymous public data by design (PROJECT.md: public stats are anonymous). |
| V5 Input Validation | **yes** | TypeBox schema on every JSON route; `SlugOrUuidParameters` bounded `^[A-Za-z0-9-]+$` maxLength 128 (DoS mitigation); `limit` clamped (max page size); `looksLikeUuid` branch; sort against fixed whitelist. [VERIFIED: schemas.ts, slug.ts] |
| V6 Cryptography | no | No crypto in this phase (cursor is intentionally UNSIGNED/opaque, validated structurally). [VERIFIED: cursor.ts] |
| V7/V8 Data Protection (SteamID PII) | **yes** | `maskSteamId` choke point + pino redaction + `7656119\d{10}` leak-guard test over body/payload/error. **The defining security control of this phase.** [VERIFIED: leak-guard test] |

### Known Threat Patterns for Fastify + raw pg
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via `?sort=`, filters, slug | Tampering | Fixed `expr` sort whitelist (never raw value in SQL text); all values `$n`-bound; `looksLikeUuid` prevents slug→`::uuid`. [VERIFIED] |
| Full Steam64 PII leak in participants/events | Information Disclosure | `maskSteamId`/omit at mapper boundary; leak-guard test enumerates the new routes. [VERIFIED] |
| ReDoS / oversized path param | Denial of Service | `SlugOrUuidParameters` maxLength 128 + restrictive pattern; clamp event `limit`; sitemap child cap 50k. [VERIFIED] |
| Unbounded result set (event timeline / list) | Denial of Service | keyset paging + `limit+1` over-fetch + hard max page size; no full-table COUNT. [VERIFIED] |
| Cursor tampering | Tampering | `decodeCursor` structural validation (shape, sort whitelist, arity, value types) → `BadCursorError` → 400; error message never echoes input. [VERIFIED] |
| XML injection in sitemap | Tampering | XML-escape all dynamic content in pure builder; slugs already pattern-restricted. [CITED: OWASP] |

## Sources

### Primary (HIGH confidence — this repo, read directly)
- `src/infra/db/migrations/0001_v1_domain_schema.sql` — `replays`, `parser_results`, `parser_events`, `rotations` schema (no map column; nullable `replay_timestamp`/`occurred_at`).
- `src/infra/db/migrations/0006_slug_addressing.sql` — `replays.slug`, `uq_replays_slug`, `idx_replays_slug` (already backfilled).
- `src/infra/db/migrations/0005_keyset_indexes.sql` — keyset index rationale.
- `src/infra/db/migrate.ts` — sha256-checksummed, transactional, sorted migration runner.
- `src/modules/public-stats/repository.ts` — `listBounty`/`listPlayers`/`getRotation`/`getSquad`, `keysetSeek`/`keysetResult`, `looksLikeUuid` branching, `maskSteamId`/`maxTimestamp` usage.
- `src/modules/public-stats/routes/{routes,models,empty-read-model,filters,schemas,slug,provenance}.ts` and `routes/pagination/{cursor,keyset,sort,mask}.ts` — all established patterns.
- `src/modules/public-stats/routes/tests/fixtures.ts` — fake read-model triple-declaration pattern.
- `src/modules/statistics/parser-artifact.ts` (+ `.test.ts`) — `ParserArtifact` shape: `players[]` (eid/n/s/sid/g/k...), `side_facts` (commanders/outcome.winner_side), untyped `replay`.
- `src/modules/statistics/repository/readiness.ts` — canonical `parser_results.status='current'` + `raw_snapshot.players` read pattern.
- `src/openapi/{register-openapi,verify-openapi,schema}.ts` + `package.json` — OpenAPI generation/verify gates; `verify`/`openapi:check` scripts.
- `src/test/integration/steamid-leak-guard.test.ts` — `7656119\d{10}` route-enumerating leak guard + real-pg seed harness.
- `src/config/env.ts` — `PUBLIC_BASE_URL` (envalid url, default `http://localhost:3000`).
- `src/app.ts` — route plugin wiring + `BuildAppOptions.publicStatsReadModel`.
- `.planning/{ROADMAP,STATE,REQUIREMENTS}.md` — Phase 17 success criteria, zero-new-deps decision, pending grey-area todos.

### Secondary (MEDIUM confidence)
- sitemaps.org/protocol.html — 50,000 URLs/sitemap limit, `urlset`/`sitemapindex` namespace, absolute `<loc>` requirement. [CITED]

### Tertiary (LOW confidence)
- None — every claim is grounded in repo code or the sitemap protocol spec.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all helpers read directly; zero new deps.
- Architecture/patterns: HIGH — direct mirrors of `listBounty`/`getRotation`/`getSquad`.
- Pitfalls: HIGH — each pitfall traces to a specific code fact (no map column, no `parser_events.replay_id`, checksum migration guard, leak-guard route enumeration).
- Map data source: LOW — genuinely unknown/unpopulated; flagged BLOCKING in Grey Areas.

**Research date:** 2026-06-07
**Valid until:** 2026-07-07 (stable internal codebase; revalidate map/raw_snapshot assumptions against real parser output before locking REPLAY-01 map filter).

## RESEARCH COMPLETE

Фаза 17 — это фаза-композиция: список реплеев, деталь, пагинированный таймлайн событий и XML-sitemap собираются почти полностью из уже существующих примитивов `public-stats` (keyset-курсор `cursor.ts`/`keyset.ts`, slug-or-uuid через `looksLikeUuid`, маскирование Steam64 через единственный choke-point `maskSteamId`, provenance через `maxTimestamp`, тройное объявление read-model контракта, авто-генерация OpenAPI и leak-guard тест). Новый код сводится к четырём методам read-model + их параметризованному SQL (raw `pg`, без ORM — по конвенции модуля), мапперу `parser_results.raw_snapshot` (status='current') в per-side/участников и к отдельному Fastify-плагину, отдающему XML (`reply.type("application/xml")`, вне JSON/OpenAPI-контракта). Главный риск — не механика, а данные: у `replays` **нет колонки карты**, а `replay_timestamp`/`occurred_at` **nullable** (нужен NULLS-aware keyset, уже реализованный в `buildKeysetPredicate`). До планирования критично залочить источник карты (BLOCKING), форму per-side/участников, ключ сортировки таймлайна (рекомендация: `(occurred_at NULLS FIRST, id)` + индекс в миграции `0007`), форму URL в sitemap (`replays.slug` под `PUBLIC_BASE_URL`) и жёсткий max размер страницы событий. Каждый новый detail-роут обязан попасть в массивы маршрутов `steamid-leak-guard.test.ts`, иначе утечка Steam64 пройдёт незамеченной.
