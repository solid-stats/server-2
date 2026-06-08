# Phase 14: Pagination & Masking Core - Research

**Researched:** 2026-05-31
**Domain:** Cursor (keyset) pagination + server-side sort + SteamID masking for a Fastify 5 / TypeBox / raw `pg` PostgreSQL API
**Confidence:** HIGH (codebase facts grep-verified; SQL/keyset patterns cross-verified against PostgreSQL community sources; zero new deps confirmed)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Replace `page`/`pageSize`/`total` on all list responses with an opaque cursor contract. `total`, `page`, `pageSize` MUST NOT appear on any list response.
- Response carries `items` + `nextCursor` (+ boolean `hasMore`). No `total`, no count surface, no COUNT query, no approximate-total field. (User: "Без total".)
- A request supplying both `page` and `cursor` is rejected (400), not silently resolved.
- Cursor is `base64url` of `{ sort, order, values[], id }` — **UNSIGNED**. Integrity is enforced by structural validation on decode (shape, sort/order against the endpoint whitelist, value types). **Zero new runtime dependencies** — use Node's built-in base64url. (User: "base64url без подписи".)
- Decode failures (malformed base64, wrong shape, sort/order not in endpoint whitelist) → 400 validation error, never silently ignored.
- Sort = two explicit query params: `?sort=<field>&order=asc|desc`. Each endpoint defines a whitelist of sortable fields + a default; unknown field → rejected. (User: "sort=field&order=asc|desc".)
- Every sort tuple ends in a unique `id` tie-breaker → deterministic, stable across page boundaries, including shared sort values and NULL sort keys (explicit NULLS FIRST/LAST folded into the keyset predicate).
- Cursor's encoded `sort`/`order` MUST match the request's `sort`/`order`; mismatch → rejected (prevents resuming a cursor under a different ordering).
- SteamID surfaced only as masked last-4 (e.g. `...7890`), never full Steam64. (User: "Masked last-4".)
- Masking enforced server-side at the row→payload mapper boundary (single choke point), so no payload, cursor token, log line, or error path emits a full Steam64.
- Acceptance: `7656119\d{10}` regex over any public response body, cursor token, log line, error payload → **zero matches**.

### Claude's Discretion
- Exact masked field name (`steamIdMasked` vs reusing `steamIds` as masked strings) — choose least-surprising shape for `web`, keep consistent across endpoints, document in plan.
- Internal module layout for cursor codec and keyset query builder.
- Whether `hasMore` is derived by fetching `limit + 1` rows or by cursor presence — pick the standard keyset approach.

### Deferred Ideas (OUT OF SCOPE)
- Approximate/exact total endpoints — explicitly rejected this milestone (no count surface).
- HMAC-signed / encrypted cursors — not needed (cursor carries no secret); revisit only if cursor tampering becomes an attack concern.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAGE-01 | Page any list endpoint with an opaque cursor instead of page numbers | Cursor codec (§ Code Examples 2) + keyset SQL (§ Architecture Pattern 1) replace OFFSET in `paginationValues()`/`pageResult()`. |
| PAGE-02 | Sort by supported fields server-side, deterministic stable ordering with unique tie-breaker | Per-endpoint sort whitelist + `(sortField <dir>, id asc)` keyset predicate with explicit NULLS handling (§ Architecture Pattern 1, Pitfall 1 & 2). |
| PAGE-03 | Migrate players, squads, bounty, leaderboards to cursor+sort contract before freeze | Single choke point `page()`/`paginated()`/`paginationValues()` (§ Don't Hand-Roll, § Leaderboards decision). |
| SEC-01 | Public API never returns full SteamIDs anywhere (responses, errors, logs) | Mask at `mapPlayerProfile()` boundary + pino redact + onSend/test-time regex guard (§ Architecture Pattern 3, § Security Domain). |
| SEC-02 | Where SteamID surfaced, only masked form exposed | Last-4 masked string at the mapper boundary; `PlayerProfileResponse.steamIds` is the live leak to close (§ Integration Points). |
</phase_requirements>

## Summary

Phase 14 converts every list endpoint to a single opaque-cursor + server-side-sort contract and closes a live SteamID leak. The codebase already centralizes pagination through one choke point — `page()` filter, `PaginationQuery`/`paginated()` schema, `PageQuery`/`PaginatedResult<T>` types, and `paginationValues()`/`pageResult()` repository helpers — so the work is **replacing internals**, not rewriting routes. Everything is achievable with **zero new runtime dependencies**: Node's `Buffer.from(...).toString("base64url")` is built in (verified on this machine), TypeBox + `@fastify/type-provider-typebox` already drive validation, and `@fastify/swagger` regenerates the OpenAPI contract on boot.

**The single hard problem is the keyset SQL.** The current sort key is not a stored column — `kills`, `teamkills`, etc. are computed `coalesce(sum((stats.stats->>'kills')::integer), 0)` aggregates inside a `GROUP BY players.id` query (`repository.ts:454-463`). A keyset predicate cannot live in `WHERE` (the aggregate is not yet computed there) — it must live in `HAVING` (or a wrapping subquery over the grouped result). Combined with mixed ASC/DESC + nullable sort keys, the naive row-value-comparison `(a, b) > ($1, $2)` is **incorrect** and must be replaced with an **expanded-OR predicate** that folds NULLS ordering in explicitly. This is the part most likely to ship a subtle page-boundary bug, so it carries dedicated pitfalls, SQL snippets, and index guidance below.

**Primary recommendation:** Build two small internal modules — a `cursor` codec (`encodeCursor`/`decodeCursor` over base64url JSON with structural validation) and a `keyset` predicate builder (emits the parameterized expanded-OR `HAVING` fragment + `ORDER BY` for a given `{sort, order}` and the cursor's `values`/`id`). Wire both through the existing `page()`/`paginationValues()`/`pageResult()` seam. Mask SteamIDs to last-4 at `mapPlayerProfile()`, defend with a pino redact path and a test-time `7656119\d{10}` guard. Make leaderboards join the cursor contract (no exemption) to satisfy success criterion 1 (one contract for *every* list endpoint).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cursor encode/decode + structural validation | API (Fastify route/filter seam) | — | Cursor is an API contract artifact; no DB or client involvement. |
| Sort whitelist enforcement | API (TypeBox schema + filter) | — | Per-endpoint policy; reject unknown fields before SQL is built. |
| Mixed `page`+`cursor` rejection | API (preValidation hook or schema) | — | Pure request-shape validation, no business logic. |
| Keyset predicate + stable ORDER BY | Database (repository SQL) | API (builds parameterized fragment) | Ordering/seek semantics belong to the SQL engine; the builder just parameterizes. |
| SteamID masking | API (row→payload mapper) | Logging (pino redact), Test (regex guard) | Single choke point at mapper; defense-in-depth at log + test layers. |
| `hasMore` derivation | Database (fetch limit+1) | API (slice + set flag) | Standard keyset: over-fetch one row, drop it, set `hasMore`. |

## Standard Stack

### Core (all already in the repo — zero new deps)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fastify` | ^5.8.5 [VERIFIED: package.json] | HTTP framework, validation lifecycle, 400 on schema failure | Repo standard; `preValidation` hook + schema-driven 400s cover mixed-param rejection. |
| `@sinclair/typebox` | ^0.34.49 [VERIFIED: package.json] | Query/response schemas → OpenAPI + runtime validation | Already the schema source via `@fastify/type-provider-typebox`. |
| `@fastify/swagger` | ^9.7.0 [VERIFIED: package.json] | OpenAPI generation from registered schemas | Contract regenerates on boot; schema edits are the contract edit. |
| `pg` | ^8.20.0 [VERIFIED: package.json] | Raw parameterized SQL (`$1`,`$2`…), `Pool` | DB layer; keyset predicate built as parameterized SQL strings. |
| Node built-in `Buffer` | Node 25 target [VERIFIED: `Buffer.from(...).toString("base64url")` runs locally] | Cursor base64url codec | `"base64url"` encoding is native since Node 15; **zero new deps** satisfied. |
| `pino` (via Fastify logger) | bundled | Structured logs with `redact` paths | Existing `createLoggerOptions()` already uses `redact.paths` — extend for SteamID defense. |
| `vitest` | ^4.1.5 [VERIFIED: package.json] | Unit + integration tests, V8 coverage (100% gate) | Repo test runner; `app.inject()` for route tests, real `Pool` for pg tests. |

### Supporting (no install — patterns only)
| Pattern | Purpose | When to Use |
|---------|---------|-------------|
| `node:test`-style table tests in Vitest | Cursor codec round-trip + reject matrix | Pure-function unit tests for `encodeCursor`/`decodeCursor`. |
| Real `Pool` against dockerized PG | Keyset stability across page boundaries | Already established in `tests/postgres.test.ts` (truncate + seed in `beforeEach`). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Expanded-OR keyset predicate | Row-value tuple `(a,b) > ($1,$2)` | **Rejected** — row-value comparison is only correct for *all-ASC, all-NON-NULL* tuples. Mixed ASC/DESC and NULL sort keys make it silently wrong (skipped/duplicated rows). [VERIFIED: cybertec-postgresql.com, jooq.org] |
| `HAVING` keyset over aggregate sort | Wrapping subquery + `WHERE` on the outer alias | Both correct. `HAVING` keeps one query; subquery is more readable for multi-aggregate sorts. Pick `HAVING` for the single-aggregate sorts here; document if a future sort needs the subquery form. |
| Last-4 masked string | Drop SteamID field entirely | CONTEXT locks masked last-4; dropping is the SEC-02 "omission" fallback only if `web` confirms it never needs the value. |

**Installation:** None. `npm install` adds nothing. Confirm engines: repo targets Node `>=25 <26`; active shell may be Node 22 (STATE.md blocker) — run pg/integration tests under the repo's Node to avoid engine warnings, but base64url works on Node ≥15 regardless.

## Package Legitimacy Audit

> Not applicable — this phase installs **zero new packages** (locked constraint). All capabilities use packages already in `package.json` (verified above) or Node built-ins. slopcheck/registry verification is moot; no new dependency surface is introduced.

## Architecture Patterns

### System Architecture Diagram

```
GET /stats/players?sort=kills&order=desc&cursor=<b64url>&limit=25
        │
        ▼
 [Fastify preValidation hook]  ── page & cursor both present? ──► 400
        │  (mutually-exclusive guard, shared seam)
        ▼
 [TypeBox querystring schema]  ── sort not in whitelist / bad order ──► 400 (default Fastify)
        │
        ▼
 [filter: page(query)]  ──►  decodeCursor(cursor)
        │                      ├─ malformed base64 / shape / type ──► 400
        │                      └─ cursor.sort≠query.sort | cursor.order≠query.order ──► 400
        ▼
 PageQuery { sort, order, after?: { values[], id }, limit }
        │
        ▼
 [repository.listPlayers]
        │  buildKeysetPredicate(sort, order, after) → { havingSql, orderBySql, values[] }
        ▼
 SELECT … sum(...) as kills … GROUP BY players.id
   HAVING <expanded-OR keyset predicate>           ← seek, not offset
   ORDER BY <sortExpr> <dir> NULLS <FIRST|LAST>, players.id ASC
   LIMIT $n   (= limit + 1, over-fetch one row)
        │
        ▼
 rows → mapPlayerSummary/mapPlayerProfile  ── SteamID → last-4 mask (CHOKE POINT)
        │
        ▼
 pageResult(items): drop over-fetched row → hasMore; encodeCursor(lastItem) → nextCursor
        │
        ▼
 { items, nextCursor, hasMore }   (NO page / pageSize / total)
```

### Recommended Project Structure
```
src/modules/public-stats/
├── routes/
│   ├── pagination/
│   │   ├── cursor.ts           # encodeCursor / decodeCursor (base64url JSON + structural validation)
│   │   ├── keyset.ts           # buildKeysetPredicate(sort, order, after) → parameterized HAVING + ORDER BY
│   │   └── sort.ts             # per-endpoint sort whitelists + defaults + field→SQL-expr map
│   ├── filters.ts              # page() rewritten: decode cursor, cross-check sort/order, mutual-exclusion
│   ├── models.ts               # PageQuery (sort/order/after/limit), PaginatedResult<T> (items/nextCursor/hasMore)
│   └── schemas.ts              # PaginationQuery (sort/order/cursor/limit), paginated() (items/nextCursor/hasMore)
└── repository.ts               # paginationValues→keyset values; pageResult→nextCursor+hasMore; mask in mapPlayerProfile
```

### Pattern 1: Keyset predicate over an AGGREGATE sort key with NULLS + mixed direction

The sort key here is a computed aggregate (`sum(...) as kills`), so the seek predicate **cannot** go in `WHERE` (the aggregate isn't available pre-group). It goes in `HAVING`. The predicate must be the **expanded-OR** form, not row-value comparison.

For a sort tuple `(S <dir>, id ASC)` where `S` is the (possibly NULL) sort expression and the cursor carries `S = $v` (the last row's sort value, possibly null) and `id = $i`:

**DESC with NULLS LAST** (PG default for DESC is NULLS FIRST — we force LAST for a stable "biggest first, nulls at the bottom" order). Seek = "strictly after `($v, $i)`":
```sql
-- params: $v = last sort value (nullable), $i = last id, plus existing filter params
HAVING (
     (S IS NOT NULL AND $v::int IS NOT NULL AND S < $v)            -- next non-null bucket, smaller value
  OR (S IS NULL     AND $v::int IS NOT NULL)                       -- we were in a non-null row; nulls come after
  OR (S = $v        AND players.id > $i)                           -- same value, tie-break by id (non-null case)
  OR (S IS NULL     AND $v::int IS NULL AND players.id > $i)       -- inside the null bucket, tie-break by id
)
ORDER BY S DESC NULLS LAST, players.id ASC
LIMIT $limitPlusOne
```

**ASC with NULLS FIRST** (PG default for ASC is NULLS LAST — force FIRST so a single rule covers it, or keep PG default and flip the null branches). Seek = "strictly after `($v, $i)`" for `S ASC`:
```sql
HAVING (
     (S IS NOT NULL AND $v::int IS NOT NULL AND S > $v)            -- next non-null bucket, larger value
  OR (S IS NOT NULL AND $v::int IS NULL)                          -- we were in the null bucket (top); non-nulls come after
  OR (S = $v        AND players.id > $i)                           -- same value, tie-break by id
  OR (S IS NULL     AND $v::int IS NULL AND players.id > $i)       -- inside the null bucket, tie-break by id
)
ORDER BY S ASC NULLS FIRST, players.id ASC
```

**First page (no cursor):** omit the `HAVING` keyset entirely; only the `ORDER BY … , id ASC LIMIT limit+1` runs.

**Why row-value comparison `(S, id) > ($v, $i)` is rejected here:**
- It only encodes a single direction. With `S DESC, id ASC` the directions are **mixed**, so no single tuple operator is correct. [VERIFIED: jooq.org "Faster SQL Pagination with Keysets, Continued"; cybertec-postgresql.com "Keyset pagination with descending order"]
- Tuple comparison treats `NULL` with three-valued logic: any comparison against `NULL` yields `NULL` (not `TRUE`), so rows in the NULL bucket are silently dropped or duplicated at the boundary. [CITED: postgresql.org row-value comparison semantics]
- Therefore the expanded-OR form above (one OR-branch per ordering region: strictly-past, same-value tie-break, null-bucket entry, null-bucket tie-break) is the correct general pattern. [VERIFIED: cross-checked sequinstream.com + cybertec + jooq]

**`hasMore` (standard keyset, per discretion): fetch `limit + 1`.** Request `LIMIT $limit+1`; if `rows.length > limit`, set `hasMore = true`, drop the extra row, and build `nextCursor` from the **last kept** row. If `rows.length <= limit`, `hasMore = false` and `nextCursor = null`. No COUNT, satisfies "Без total".

### Pattern 2: Sort field → SQL expression whitelist

Never interpolate `query.sort` into SQL. Map a whitelisted enum value to a **fixed SQL expression string** chosen by the server:
```ts
// sort.ts
const PLAYER_SORT = {
  kills:    { expr: "coalesce(sum((stats.stats->>'kills')::integer), 0)", nullable: false },
  teamkills:{ expr: "coalesce(sum((stats.stats->>'teamkills')::integer), 0)", nullable: false },
  name:     { expr: "players.display_name", nullable: false },
} as const;
export type PlayerSortField = keyof typeof PLAYER_SORT;
export const PLAYER_SORT_DEFAULT: PlayerSortField = "kills";
```
Because `coalesce(...)` already eliminates NULLs for the stat sums, those sort keys are **non-nullable** in practice — the NULL branches of the keyset predicate are dead for them but MUST still be implemented and tested for any nullable sort key the plan adds (e.g. a future `last_seen` timestamp). Document which whitelisted fields are nullable so the planner can scope NULL tests precisely.

### Pattern 3: SteamID masking at the single choke point
```ts
// mask.ts
export function maskSteamId(steamId: string): string {
  return `...${steamId.slice(-4)}`;
}
// repository.ts mapPlayerProfile — the ONLY place steam_ids leaves the row layer
steamIds: row.steam_ids.map(maskSteamId),   // was: row.steam_ids (RAW LEAK — close this)
```
Defense-in-depth (satisfies "zero matches in logs/errors too"):
1. **pino redact**: add a path covering any field that could carry a SteamID to `createLoggerOptions().redact.paths` (already has `*.password`, `*.secret`). Pino redact masks structured-log fields, not free-text — so also never `log.info(rawSteamId)`.
2. **Test-time regex guard**: an integration test that hits every list+detail+error route and asserts `JSON.stringify(response.body)` has **zero** `7656119\d{10}` matches.
3. Optional `onSend` hook as a last-resort net is possible but expensive (re-stringify every response) — prefer the mapper choke point + test guard; reserve `onSend` only if a leak path can't be closed at the mapper.

### Anti-Patterns to Avoid
- **Keyset predicate in `WHERE` over an aggregate sort key** — the aggregate isn't computed yet; it must be `HAVING` (or a wrapping subquery). Putting `sum(...) < $v` in `WHERE` is a SQL error.
- **`OFFSET`-based "keyset"** — keeping `OFFSET` defeats the contract; replace `paginationValues()` entirely.
- **Interpolating `sort`/`order` into SQL** — always map via whitelist to a fixed expression + a `"ASC"`/`"DESC"` literal chosen by code, never the raw string.
- **Encoding masked SteamID into the cursor** — cursors encode sort `values[]` + `id` only; SteamID is never a sort key, so it never enters the cursor (keeps the `7656119` regex clean on tokens too).
- **Trusting the cursor's encoded `values` types** — validate arity (matches sort tuple length = 1 sort value) and primitive types on decode; a tampered cursor must 400, not crash the SQL.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| base64url encode/decode | Custom base64 + URL-safe char swap | `Buffer.from(json).toString("base64url")` / `Buffer.from(token, "base64url").toString("utf8")` | Native since Node 15; verified locally. Hand-rolling padding/`+`→`-` is bug-prone. [VERIFIED: ran locally] |
| Query validation + 400 responses | Manual `if`-checks per route | TypeBox querystring schema (Fastify auto-400) + one `preValidation` for mutual-exclusion | Fastify already emits 400 on schema failure with a consistent error shape; only the page+cursor cross-field rule needs a hook. |
| Pagination reassembly | New per-route shaping | Existing `page()` / `paginationValues()` / `pageResult()` choke point | One seam already flows through every list route; replace internals once. |
| Log redaction | Stringify-and-regex on every log call | pino `redact.paths` (already configured) | Structured redaction is built into the logger the repo already uses. |

**Key insight:** The whole phase is "swap the internals of an existing choke point + add two pure modules." The risk is not breadth, it's the **correctness of one SQL predicate** under NULLs and mixed direction — concentrate test effort there.

## Runtime State Inventory

> This is a contract/code change, not a rename or data migration, but it touches stored-shaped tokens and an index surface — inventory applies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — cursors are stateless (encoded client-side round-trip), not persisted. No DB column stores a cursor. Verified: no cursor table, `pg` is stateless query layer. | None. |
| Live service config | **None** — `web` is a brand-new consumer (STATE.md: "clean break; `web` is a new consumer"); no deployed client holds old `page`/`pageSize` cursors. | None — confirms no dual-support needed. |
| OS-registered state | **None** — no cron/scheduler/queue consumer reads list-pagination shape. Verified: `parse_jobs`/RabbitMQ paths are unrelated to public-stats pagination. | None. |
| Secrets/env vars | **None** — unsigned cursor needs no key; no new env var. (Deferred HMAC would add one — out of scope.) | None. |
| Build artifacts / indexes | **Composite indexes** for non-degenerate keyset queries. Current indexes (`idx_player_steam_ids_*`, `idx_player_nicknames_*`, `idx_squad_memberships_*` — migration `0001`) do **not** cover the grouped-aggregate sort. | New migration: see Index Implications below. OpenAPI artifact regenerates on boot (no manual step). |

**Index Implications (verified against migration `0001_v1_domain_schema.sql`):**
- The sort keys (`kills`, `teamkills`) are computed `sum()` aggregates over `player_stats.stats` JSONB inside `GROUP BY players.id`. **No index can make a keyset over a runtime SUM "seek" the way a stored column does** — PG must group then filter via `HAVING`. The keyset still avoids the COUNT and avoids OFFSET's growing scan, but the grouped scan cost is bounded by the players/squads cardinality, not by page depth.
- Add a covering index to keep the per-row JSONB extraction fast: `create index on player_stats (player_id, rotation_id)` if not already covered (verify `0001`). For `name`-sorted endpoints (`players.display_name`, `squads.name` — stored columns), add `create index on canonical_players (display_name, id)` and `create index on squads (name, id)` so those keyset orderings are non-degenerate.
- **Migration note:** follow the existing immutable-checksum runner (`migrate.ts` — never edit an applied `.sql`; add a new numbered file `0005_*.sql`). Checksum changes after apply throw.

## Common Pitfalls

### Pitfall 1: Keyset predicate placed in WHERE over an aggregate sort
**What goes wrong:** `WHERE sum(...) < $v` → `ERROR: aggregate functions are not allowed in WHERE`.
**Why it happens:** Sort key is computed at GROUP, not stored.
**How to avoid:** Emit the keyset predicate into `HAVING` (single-query) or a wrapping subquery aliasing the aggregate then `WHERE` on the alias. Builder must know whether each sort field is an aggregate or a stored column.
**Warning signs:** SQL error on first cursor request; or the planner writing `WHERE` in the builder.

### Pitfall 2: Row-value tuple comparison with NULLs / mixed direction
**What goes wrong:** Rows with a NULL sort key, or rows around a shared sort value, appear on two pages or vanish.
**Why it happens:** `(S, id) > ($v, $i)` returns `NULL` (not `TRUE`) whenever `S` or `$v` is NULL; and a single tuple operator can't express `S DESC, id ASC`.
**How to avoid:** Use the expanded-OR predicate (Pattern 1) with explicit `IS NULL` branches and `NULLS FIRST/LAST` matched to the predicate.
**Warning signs:** A test that pages a dataset with shared sort values + a NULL sort key shows duplicated or missing ids across the boundary.

### Pitfall 3: Cursor/sort drift between pages
**What goes wrong:** Client resumes a `kills`-sorted cursor while requesting `order=asc` → mixes two orderings, skips/duplicates rows.
**Why it happens:** Cursor encodes the ordering it was built under; request can disagree.
**How to avoid:** On decode, reject (400) when `cursor.sort !== query.sort` or `cursor.order !== query.order` (locked decision). The cursor's `values[]` arity must also match the sort tuple.
**Warning signs:** Mismatch test returns 200 instead of 400.

### Pitfall 4: SteamID escapes outside the mapper
**What goes wrong:** `7656119…` appears in an error payload (e.g. a stack trace echoing a row) or a log line.
**Why it happens:** Masking only at the success-path mapper; error/log paths still see raw rows.
**How to avoid:** Mask at the mapper AND (a) pino redact path, (b) never log raw rows, (c) test-time regex guard over success+error responses and captured logs.
**Warning signs:** The `7656119\d{10}` integration guard finds a match.

### Pitfall 5: Leftover `page`/`pageSize` after removal
**What goes wrong:** A client (or a stale test) sends `?page=2&pageSize=5`; if the schema still accepts them, behavior is ambiguous; if it strips them silently, the mixed-param 400 contract isn't honored.
**Why it happens:** `PaginationQuery` currently declares `page`/`pageSize` (`schemas.ts:4-9`); tests assert `page/pageSize/total` (`players.test.ts`, `stat-indexes.test.ts`).
**How to avoid:** Remove `page`/`pageSize`/`total` from schema, types, and helpers; update the existing tests (they will fail otherwise — that's expected, not a regression); add the page+cursor 400 guard.
**Warning signs:** Old assertions `toMatchObject({ page: 1, pageSize: 25, total: 0 })` still present.

## Code Examples

### 1. Mutually-exclusive page+cursor + leftover-param rejection (Fastify 5)
```ts
// preValidation runs before handler; raw query is request.query (typed by schema after validation,
// but we inspect the raw URL params for the cross-field rule).
app.addHook("preValidation", async (request, reply) => {
  const q = request.query as Record<string, unknown>;
  if ("cursor" in q && "page" in q) {
    return reply.code(400).send({ message: "Provide either 'cursor' or 'page', not both." });
  }
  // 'page'/'pageSize' are no longer in the schema; if present they are rejected here:
  if ("page" in q || "pageSize" in q) {
    return reply.code(400).send({ message: "'page'/'pageSize' are not supported; use 'cursor'." });
  }
});
```
Scope this hook to the public-stats list routes only (register inside `registerPublicStatsRoutes` via an encapsulated plugin, or guard by URL prefix) so it doesn't reject `page` on unrelated routes. [CITED: Fastify lifecycle — preValidation hook]

### 2. Cursor codec (base64url JSON + structural validation, zero deps)
```ts
// cursor.ts
export interface CursorPayload { sort: string; order: "asc" | "desc"; values: (number | string | null)[]; id: string; }

export function encodeCursor(p: CursorPayload): string {
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}

export function decodeCursor(
  token: string,
  allowedSorts: readonly string[],
  expectedArity: number, // = sort-tuple length (1 here)
): CursorPayload {
  let raw: unknown;
  try { raw = JSON.parse(Buffer.from(token, "base64url").toString("utf8")); }
  catch { throw new BadCursorError("malformed cursor"); }

  if (typeof raw !== "object" || raw === null) throw new BadCursorError("bad shape");
  const c = raw as Record<string, unknown>;
  if (typeof c.sort !== "string" || !allowedSorts.includes(c.sort)) throw new BadCursorError("bad sort");
  if (c.order !== "asc" && c.order !== "desc") throw new BadCursorError("bad order");
  if (typeof c.id !== "string") throw new BadCursorError("bad id");
  if (!Array.isArray(c.values) || c.values.length !== expectedArity) throw new BadCursorError("bad values arity");
  for (const v of c.values) if (v !== null && typeof v !== "number" && typeof v !== "string") throw new BadCursorError("bad value type");
  return c as unknown as CursorPayload;
}
```
`BadCursorError` maps to a 400 (either thrown in `page()`/filter and caught by a `setErrorHandler`, or converted inline to `reply.code(400)`). Note: **no `setErrorHandler` exists today** (grep-verified) — the plan must either add one that maps `BadCursorError`→400 or do the decode inside the filter and return 400 directly.

### 3. Schema edits (TypeBox)
```ts
// schemas.ts — replace PaginationQuery
export const PaginationQuery = Type.Object({
  cursor: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ default: 25, maximum: 100, minimum: 1 })),
  sort: Type.Optional(Type.String()),               // value validated against per-endpoint whitelist in filter
  order: Type.Optional(Type.Union([Type.Literal("asc"), Type.Literal("desc")], { default: "desc" })),
});
// paginated() — drop page/pageSize/total
export function paginated<T extends ReturnType<typeof Type.Object>>(item: T) {
  return Type.Object({
    items: Type.Array(item),
    nextCursor: Type.Union([Type.String(), Type.Null()]),
    hasMore: Type.Boolean(),
  });
}
```
`sort` is a free `String` at the schema layer (per-endpoint whitelists differ), so the **filter** rejects an out-of-whitelist value with 400. If the planner prefers schema-level enforcement, generate a per-endpoint `Type.Union([Type.Literal("kills"), ...])` instead — stronger OpenAPI, more schema boilerplate. Document the choice.

### 4. Repository seam (over-fetch + nextCursor)
```ts
// pageResult replacement
function keysetResult<T>(rows: T[], page: PageQuery, toCursor: (last: T) => CursorPayload): PaginatedResult<T> {
  const hasMore = rows.length > page.limit;
  const items = hasMore ? rows.slice(0, page.limit) : rows;
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(toCursor(last)) : null,
  };
}
// paginationValues replacement → returns keyset HAVING fragment + ORDER BY + bound values
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OFFSET/LIMIT + COUNT total | Keyset (seek) cursor, no COUNT | Industry standard for years; locked here | Stable under inserts, no deep-page scan, no expensive COUNT. |
| Row-value tuple `(a,b) > (..)` | Expanded-OR predicate when NULLs/mixed-direction present | Long-known PG caveat | Required for correctness here (nullable/mixed sorts). |
| base64url via custom char-swap | Native `Buffer … "base64url"` | Node ≥15 | Zero-dep codec. |

**Deprecated/outdated in this codebase:**
- `page`/`pageSize`/`total` on list responses, `paginationValues()` OFFSET math, `emptyPage()` page/total shape — all to be removed.
- Raw `row.steam_ids` emission in `mapPlayerProfile()` — the live SEC leak.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `player_stats`/`squad_stats` have one stat row per (entity, rotation); the keyset over the grouped SUM is stable for a fixed rotation filter | Pattern 1, Index Implications | If multiple concurrently-mutating stat rows exist, the SUM (hence sort value) could shift between page requests — but stats are batch-derived, not live-mutated mid-read, so risk is low. Planner should confirm stats are not rewritten during a paging session. |
| A2 | `web` holds no persisted old cursors (clean break) | Runtime State Inventory | If any non-`web` consumer exists, removing `page` breaks it. STATE.md asserts `web` is the only/new consumer. |
| A3 | No `setErrorHandler` exists, so `BadCursorError`→400 needs new wiring | Code Example 2 | Grep-verified absent; if added elsewhere later, reuse it. |
| A4 | last-4 masking is sufficient and `web` does not need full SteamID anywhere | Pattern 3 | SEC-02 allows "masked or omission"; if `web` needs exact value for a feature, that's a separate (out-of-scope) decision. |

## Open Questions

1. **Schema-level vs filter-level sort whitelist**
   - What we know: both work; schema-level gives richer OpenAPI enums, filter-level is less boilerplate across 4 endpoints with different field sets.
   - Recommendation: per-endpoint `Type.Union` of literals for `sort` (richer frozen contract, aligns with FREEZE phase) — but acceptable to start filter-level and tighten before freeze. Planner decides; document.
2. **Masked field name** (`steamIdMasked: string[]` vs reuse `steamIds: string[]` holding masked strings)
   - Recommendation: reuse `steamIds` as masked strings to minimize `web` churn and keep the array shape; the value type stays `string[]`. If `web` would be confused by an unlabeled-masked array, introduce `steamIdsMasked`. Decide with the masked-format note in the plan.
3. **Leaderboards** — see decision below; resolved in favor of joining the contract.

## Leaderboards Decision (resolved)

**Recommendation: leaderboards JOIN the cursor contract; no exemption.** Success criterion 1 is "**every** list endpoint paginates with one opaque-cursor + server-side-sort contract." `/stats/leaderboards` today returns a non-paginated object of three arrays (`bounty`, `playersByKills`, `squadsByKills`) capped by `limit`. Options:
- **(chosen)** Convert each leaderboard array into the `{items, nextCursor, hasMore}` shape (either three paginated sub-lists or split into three cursor endpoints). This honors "one contract everywhere" and removes the special-case `limit`-only shape before the freeze.
- (rejected) Explicit exemption — contradicts criterion 1 and leaves a non-uniform surface to freeze at 1.0.0.

The planner should confirm whether `web` wants leaderboards as one endpoint with three paginated sections or three separate cursor endpoints; either satisfies the contract. This is a contract-shape decision worth surfacing in discuss if `web` input is available, but the default is **join the contract**.

## Migration / Back-Compat (resolved)

- **No transitional dual support.** `web` is a brand-new consumer (STATE.md). Clean break: remove `page`/`pageSize`/`total` outright.
- **Internal callers of the old `page()` shape to update:** `filters.ts` (`page()`, `emptyPage()`), `models.ts` (`PageQuery`, `PaginatedResult<T>`), `schemas.ts` (`PaginationQuery`, `paginated()`), `repository.ts` (`paginationValues()`, `pageResult()`, all four `list*` methods + their `order by … limit … offset …`), `routes.ts` (`createEmptyPublicStatsReadModel` uses `emptyPage`), and the fakes in `routes/tests/fixtures.ts`. **Existing tests assert the old shape** (`players.test.ts`, `stat-indexes.test.ts`, `tests/postgres.test.ts`) and MUST be rewritten — their failure is the expected signal of the contract change, not a regression.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node `Buffer.base64url` | Cursor codec | ✓ | Node ≥15 (target 25) [VERIFIED: ran locally] | — |
| PostgreSQL (dockerized) | Keyset integration tests | ✓ (assumed via compose `localhost:15432`) | per compose | Unit-test the predicate builder string output if DB unavailable in a given run |
| `pg` Pool | Repository | ✓ | ^8.20.0 | — |
| Vitest | Tests | ✓ | ^4.1.5 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** Integration pg tests need the compose DB at `postgresql://solid:solid@localhost:15432/solid_stats` (from `tests/postgres.test.ts`); if absent, the keyset *builder* can still be unit-tested by asserting the generated SQL string + bound values, but the cross-page-boundary stability proof requires the real DB.

## Validation Architecture

> nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 |
| Config file | `vitest.config.ts` (V8 coverage, thresholds 100% branches/functions/lines/statements) |
| Quick run command | `npx vitest run src/modules/public-stats/routes/pagination` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAGE-01 | cursor round-trip encode/decode; nextCursor present iff hasMore | unit | `npx vitest run src/modules/public-stats/routes/pagination/cursor.test.ts` | ❌ Wave 0 |
| PAGE-01 | malformed/tampered cursor → 400 | unit+route | same + `app.inject` | ❌ Wave 0 |
| PAGE-02 | stable ordering across page boundary with shared sort values + NULL sort key (no dup, no gap) | integration (real pg) | `npx vitest run src/modules/public-stats/tests/postgres.test.ts` | ⚠️ exists; extend |
| PAGE-02 | unknown sort field → 400; cursor.sort≠query.sort → 400 | route | `npx vitest run src/modules/public-stats/routes/tests/players.test.ts` | ⚠️ exists; rewrite |
| PAGE-03 | players, squads, bounty, leaderboards all return `{items,nextCursor,hasMore}` (no page/pageSize/total) | route | `npx vitest run src/modules/public-stats/routes/tests` | ⚠️ exists; rewrite |
| PAGE-01 | page+cursor together → 400; leftover page/pageSize → 400 | route | players/stat-indexes tests | ❌ Wave 0 |
| SEC-01/02 | `7656119\d{10}` zero matches across all list+detail+error responses (and captured logs) | integration | new guard test over every public route | ❌ Wave 0 |
| SEC-02 | `mapPlayerProfile` emits `...7890` form, never raw | unit | mask.test.ts | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/modules/public-stats/routes/pagination` (+ the touched route test).
- **Per wave merge:** `npx vitest run src/modules/public-stats` (route + pg integration).
- **Phase gate:** `npx vitest run` full suite green (100% coverage gate) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `src/modules/public-stats/routes/pagination/cursor.test.ts` — encode/decode round-trip + reject matrix (PAGE-01)
- [ ] `src/modules/public-stats/routes/pagination/keyset.test.ts` — predicate builder emits correct parameterized HAVING+ORDER BY per direction (PAGE-02)
- [ ] `src/modules/public-stats/routes/pagination/mask.test.ts` — last-4 masking (SEC-02)
- [ ] `src/modules/public-stats/tests/steamid-leak-guard.test.ts` — `7656119\d{10}` zero-match across all public routes + error paths (SEC-01)
- [ ] Extend `tests/postgres.test.ts` — seed a dataset with shared sort values AND a NULL sort key; page through it and assert no duplicate/missing ids across boundaries (PAGE-02 cross-boundary)
- [ ] Rewrite `routes/tests/players.test.ts`, `routes/tests/squads.test.ts`, `routes/tests/stat-indexes.test.ts`, `routes/tests/fixtures.ts` — new `{items,nextCursor,hasMore}` shape; add page+cursor 400 and unknown-sort 400 cases
- Framework install: none (Vitest present)

## Security Domain

> security_enforcement enabled (config.json `workflow.security_enforcement: true`, ASVS level 2).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Public read endpoints; no auth in this phase. |
| V3 Session Management | no | — |
| V4 Access Control | partial | Data minimization: full Steam64 is sensitive identity; masking enforces least exposure (SEC-01/02). |
| V5 Input Validation | **yes** | TypeBox querystring schema + structural cursor validation + sort whitelist; reject malformed/tampered cursor (400). |
| V6 Cryptography | no | Cursor is explicitly unsigned (locked); no secret in token, so no crypto control needed. Do not hand-roll signing. |
| V7 Error Handling & Logging | **yes** | pino redact + no raw-row logging + zero-Steam64-in-errors guard. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via `sort`/`order` | Tampering | Whitelist `sort` → fixed SQL expression; `order` → `"ASC"`/`"DESC"` literal; never interpolate raw input. Keyset bind values via `$n` params. |
| Cursor tampering (inject SQL/values via base64) | Tampering | Decode → structural validation (type, arity, whitelist); bound as `$n` params only; tampered cursor → 400, never executed raw. |
| Sensitive data exposure (full Steam64) | Information Disclosure | Mask at mapper choke point; pino redact; `7656119\d{10}` zero-match guard over bodies + errors + logs. |
| Resource exhaustion via huge `limit` | Denial of Service | `limit` schema `maximum: 100`; over-fetch is `limit+1` only. |
| Enumeration via predictable cursor | Information Disclosure | Cursor reveals only sort value + id of a public row — already public data; no new exposure. (Unsigned is acceptable per locked decision.) |

## Sources

### Primary (HIGH confidence)
- Codebase (grep/Read verified): `routes/filters.ts`, `routes/models.ts`, `routes/schemas.ts`, `routes/routes.ts`, `repository.ts` (lines 150-300, 440-538), `src/app.ts`, `src/openapi/register-openapi.ts`, `vitest.config.ts`, `src/infra/db/client.ts`, `src/infra/db/migrate.ts`, `src/infra/db/migrations/0001_v1_domain_schema.sql`, `src/infra/logging/logger.ts`, `tests/postgres.test.ts`, `routes/tests/players.test.ts`, `routes/tests/stat-indexes.test.ts`, `package.json`.
- Node `Buffer.from(...).toString("base64url")` — verified by running locally.
- Project skills: fastify-best-practices, javascript-testing-patterns, nodejs-backend-patterns, openapi-to-typescript, estesis-backend-vc-swagger-spec-write.

### Secondary (MEDIUM confidence)
- cybertec-postgresql.com — "Keyset pagination with descending order" (mixed-direction caveat).
- blog.jooq.org — "Faster SQL Pagination with Keysets, Continued" (row-value vs expanded predicate).
- blog.sequinstream.com — "Keyset Cursors, Not Offsets, for Postgres Pagination".
- vladmihalcea.com — "SQL Seek Method or Keyset Pagination" (unique tie-breaker requirement).

### Tertiary (LOW confidence)
- Medium/andrewfisher.me general keyset overviews (corroborating only).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in `package.json`; zero new deps confirmed.
- Architecture (cursor codec, masking, validation seam): HIGH — direct codebase fit, native base64url verified.
- Keyset SQL over aggregate sort with NULLs: MEDIUM-HIGH — pattern cross-verified across multiple PG sources; the aggregate-sort `HAVING` constraint is grep-confirmed from `repository.ts` SQL.
- Pitfalls: HIGH — derived from verified codebase shape and known PG semantics.

**Research date:** 2026-05-31
**Valid until:** 2026-06-30 (stable stack; re-verify only if PG major or `pg`/Fastify majors change)

---

## Сводка (RU)

Фаза 14 переводит **все** списочные эндпоинты (players, squads, bounty, leaderboards) на единый контракт «непрозрачный курсор + серверная сортировка» и закрывает **живую утечку** полного Steam64 через `PlayerProfileResponse.steamIds`. Кодовая база уже имеет единую точку прохода пагинации (`page()`, `paginated()`, `paginationValues()`/`pageResult()`), поэтому работа — это **замена внутренностей**, а не переписывание роутов. Новых зависимостей **ноль**: base64url есть в Node нативно (проверено), TypeBox/Swagger/`pg`/Vitest уже стоят.

**Единственная по-настоящему сложная часть — keyset-SQL.** Ключ сортировки (`kills` и т.п.) — это вычисляемый `sum(...)` внутри `GROUP BY`, а не хранимая колонка. Поэтому seek-предикат нельзя класть в `WHERE` (агрегата там ещё нет) — только в `HAVING`. Из-за смешанного ASC/DESC и NULL-значений наивное сравнение кортежей `(a,b) > ($1,$2)` **некорректно** (строки дублируются или теряются на границе страниц) — нужен **развёрнутый OR-предикат** с явными ветками `IS NULL` и `NULLS FIRST/LAST`. Конкретные SQL-сниппеты для обоих направлений даны в Pattern 1.

**Рекомендация:** два маленьких модуля — `cursor` (кодек base64url+структурная валидация, отклонение битых/подменённых курсоров → 400) и `keyset` (построитель параметризованного `HAVING`+`ORDER BY`); подключить через существующий seam. Маскирование Steam64 до последних 4 цифр — в `mapPlayerProfile()` (единая точка), плюс pino-redact и тест-страж `7656119\d{10}` с нулём совпадений по телам, ошибкам и логам. Leaderboards — **включить в контракт** (без исключений), иначе не выполнить критерий 1. `web` — новый потребитель, поэтому чистый разрыв без двойной поддержки; старые тесты на `page/pageSize/total` нужно переписать (их падение — ожидаемый сигнал смены контракта).

## RESEARCH COMPLETE

**Phase:** 14 — Pagination & Masking Core
**Confidence:** HIGH (MEDIUM-HIGH on the keyset-over-aggregate SQL — the one area needing executor care)

### Key Findings
- **Sort keys are computed aggregates** (`sum(...)` in `GROUP BY`), so the keyset predicate MUST go in `HAVING`, not `WHERE` — this is the central, non-obvious constraint that shapes the whole keyset builder.
- Row-value tuple comparison is **incorrect** for this phase (mixed ASC/DESC + NULL sort keys); the **expanded-OR predicate** (concrete SQL in Pattern 1) is required for cross-page stability.
- **Zero new deps confirmed**: native `Buffer.base64url` (ran locally), existing TypeBox/Swagger/pino/Vitest cover everything.
- Single choke point already exists (`page()`/`paginated()`/`paginationValues()`/`pageResult()`) — replace internals; SteamID leak is one line in `mapPlayerProfile()`.
- **Leaderboards should join the contract** (recommended, resolved) to satisfy "one contract for every list endpoint." No `setErrorHandler` exists today — plan must wire `BadCursorError`→400.

### File Created
`.planning/phases/14-pagination-masking-core/14-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All versions grep-verified; zero new deps. |
| Architecture (codec/masking/validation) | HIGH | Direct codebase fit; base64url verified. |
| Keyset SQL (aggregate sort + NULLs) | MEDIUM-HIGH | Pattern cross-verified across PG sources; aggregate constraint grep-confirmed. |
| Pitfalls / Testing | HIGH | Derived from verified code shape + known PG semantics. |

### Open Questions (for planner/discuss)
- Schema-level vs filter-level sort whitelist (recommend per-endpoint literal union before freeze).
- Masked field name (`steamIds` reused as masked vs `steamIdsMasked`) — recommend reuse, confirm with `web`.
- Leaderboards as one endpoint with three paginated sections vs three cursor endpoints — both satisfy the contract.

### Ready for Planning
Research complete. The planner can create PLAN.md files; concentrate task/test effort on the keyset predicate correctness (Pattern 1 + Pitfalls 1-2 + the cross-page-boundary NULL test).
