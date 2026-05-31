# Pitfalls Research

**Domain:** Public read API + frozen OpenAPI contract on an existing Fastify / TypeBox / PostgreSQL backend (server-2 "Public API v1" milestone, v3.0)
**Researched:** 2026-05-31
**Confidence:** HIGH (most pitfalls verified against this repo's actual source; openapi-typescript nullable traps verified against upstream issues)

> Scope note: these pitfalls are written against the *current* server-2 code, not generic advice. Concrete file/line references are given so the roadmap can target the exact code that needs changing. Suggested phases use the milestone's A/B/C/D/G letters from `.planning/V2-CUTOVER-REVIEW.md` (A=parity stats, B=replay surface, C=history timelines, D=cursor pagination + scale ergonomics, G=contract freeze gate). A new **Phase D0 (pagination + sort core)** is recommended before A/B/C land, because every list endpoint depends on it.

---

## Critical Pitfalls

### Pitfall 1: Cursor pagination with no unique tie-breaker — duplicate/skipped rows

**What goes wrong:**
The current list queries order by a non-unique key with no unique final column:
`order by kills desc, players.display_name` (`repository.ts:184`, squads `:242`, bounty `:323` orders by `points desc, display_name`). `display_name`/`name` are NOT unique. With offset pagination this only produces a stable-ish page; with a *cursor* keyed on `(kills, display_name)` two players with the same kills and the same display name (very common in this domain — alts, renamed players, "unknown") straddle a page boundary and get **duplicated on one page and skipped on the next**, or the cursor matches multiple rows and the engine can't decide where to resume.

**Why it happens:**
Developers copy the existing `ORDER BY` into the cursor `WHERE (sort_key, id) > (:last_sort_key, :last_id)` predicate but forget the `id` half because the old offset code never needed it. Notably the **legacy-export SQL already does this right** (`order by kills desc, player.display_name, player.id` at `legacy-export.ts:257`, and `squad.id` at `:296`) while the **public route SQL does not** — so the two code paths disagree on ordering, and reusing legacy SQL fragments will silently mix the two.

**How to avoid:**
- Every cursor `ORDER BY` MUST end in a guaranteed-unique column (`id` / UUID). Make the sort tuple `(sort_col, id)` and the cursor a base64 of the *full tuple*, not just the sort value.
- Use the row-value comparison form: `WHERE (kills, id) < (:kills, :id)` for `DESC` (flip operator/columns consistently). Do not hand-build per-column `OR` chains — they are the #1 source of off-by-one cursor bugs.
- Centralize one cursor encode/decode + one "build keyset WHERE from sort spec" helper. Forbid raw `ORDER BY` strings in route repositories.

**Warning signs:**
A page contains a row that also appeared on the previous page; integration test that walks all pages and asserts `count(distinct id) == total` fails intermittently; QA reports "the same player shows up twice when I scroll".

**Phase to address:** **Phase D0 (pagination core)** — before A/B/C add any new list endpoints.

---

### Pitfall 2: Cursor breaks when the sort key is nullable (NULLS FIRST/LAST mismatch)

**What goes wrong:**
Several proposed sort keys are nullable in this schema: `rotations.ends_at` (`null` for the active rotation), `last_played_game_date` (`legacy-export.ts:241`, null for never-played), `replay_timestamp` (legacy replays, used by weeks/relationships and the replay list). PostgreSQL defaults to `NULLS LAST` for `ASC` and `NULLS FIRST` for `DESC`. A naive keyset predicate `WHERE sort_col > :last` silently **drops every NULL row** (any comparison with NULL is `UNKNOWN`/false), so the NULL-keyed tail of the dataset becomes unreachable through pagination.

**Why it happens:**
Keyset pagination math assumes a total order; NULLs break it. The bug is invisible in tests seeded with non-null data and only appears once real legacy (no-timestamp / never-played) rows exist — which is exactly this product's historical-gap reality (PROJECT.md "old data lacks SteamID", "commander-side winner data may be missing").

**How to avoid:**
- Prefer sort keys that are NOT NULL. Where a nullable column must be a sort key, sort on a coalesced/derived expression and pin the NULL ordering explicitly (`ORDER BY ends_at DESC NULLS LAST, id`) AND encode a synthetic boundary value in the cursor so the keyset predicate handles the NULL segment (e.g. an `is_null` flag column in the tuple).
- Add an integration test that seeds rows with NULL sort keys and asserts they are reachable by paging to the end.

**Warning signs:**
`total` count is larger than the number of rows you can actually page through; active rotation (null `ends_at`) or legacy replays never appear past page 1.

**Phase to address:** **Phase D0**, with replay-specific coverage in **Phase B** (replay_timestamp).

---

### Pitfall 3: Offset↔cursor inconsistency and the disappearing `total`

**What goes wrong:**
The response contract is hard-wired to offset semantics: `PaginatedResult { items, page, pageSize, total }` (`models.ts:70`, `schemas.ts:146` `paginated()`), and `emptyPage`/`pageResult` carry `page`/`pageSize`/`total`. `web` will generate types off this shape. If cursor pagination is bolted on by *adding* `cursor` while keeping `page`/`pageSize`/`total`, you get two mutually inconsistent pagination models on the same endpoint: clients can send `?page=3&cursor=...` and the server must pick a winner. Worse, keyset pagination has no cheap exact `total` — keeping the `total` field means either running a second full `COUNT(*)` on every request (the code already does this: `repository.ts:188-192`, `:247-251`, `:328-331`) defeating the perf win, or returning a stale/fake total that the UI's "page X of N" trusts.

**Why it happens:**
Incremental migration pressure ("don't break the existing shape") plus the assumption that `total` is free. The existing per-list `SELECT count(*)` makes `total` look cheap, but on the heavier parity/replay queries it is a second expensive scan.

**How to avoid:**
- Decide the cursor envelope ONCE and make it the only pagination shape: `{ items, pageInfo: { nextCursor: string | null, hasNext: boolean } }`. Drop `page`/`pageSize`/`total` from list responses.
- If the product genuinely needs an approximate count (overview already exposes totals via `OverviewResponse.totals`), expose it as an explicit, clearly-named *estimate* field on a separate endpoint, not as authoritative `total` on every list.
- Reject requests that mix `page` and `cursor` (400), don't silently prefer one.

**Warning signs:**
`COUNT(*)` showing up in slow-query logs for list endpoints; UI shows "page 5 of 200" but you can only scroll to ~page 10; both `page` and `cursor` accepted on the same route.

**Phase to address:** **Phase D0** (envelope decision) and **Phase G** (freeze the new envelope; ensure no endpoint still ships `total`).

---

### Pitfall 4: SteamIDs already leak through the public profile contract

**What goes wrong:**
This is **live in current code, not hypothetical**. `PlayerProfileResponse` declares `steamIds: Type.Array(Type.String())` (`schemas.ts:65`), `PlayerProfile.steamIds: string[]` (`models.ts:101`), and the repository selects them raw: `array_agg(distinct steam_ids.steam_id) ... as steam_ids` (`repository.ts:208`) → `mapPlayerProfile` returns `steamIds: row.steam_ids` (`:525`). Today `GET /stats/players/:id` returns **full SteamIDs to anyone, unauthenticated**. The locked decision (V2-CUTOVER-REVIEW.md) is server-side masking to last-4; shipping the contract freeze without fixing this bakes the leak into the frozen `1.0.0` contract that `web` generates against.

**Why it happens:**
The field predates the masking decision; "the data is already there" makes it easy to promote as-is. A freeze gate that only checks *drift* (current `verify-openapi.ts` does byte-equality) will happily freeze a leaking-but-self-consistent schema.

**How to avoid:**
- Mask at the read-model boundary, not in the route: change the SQL/mapper to emit masked values (e.g. `steamIdSuffixes: string[]` or `maskedSteamId`) and rename the field so no client can mistake it for the full ID. Renaming forces the contract change to surface in review rather than masking in place under the same name.
- Add a negative integration test asserting no full 17-digit SteamID pattern appears in ANY public response body.
- Decide whether masked last-4 is even needed by `web`; if not, drop the field entirely (smallest attack surface).

**Warning signs:**
A regex for `\b7656119\d{10}\b` (Steam64 prefix) matches any public JSON; `steamIds` present in `openapi/server-2.openapi.json` under a `public-stats` path.

**Phase to address:** **Phase A** (it co-lives with the player/squad profile parity work) — and it is a hard **Phase G** freeze-gate blocker.

---

### Pitfall 5: SteamID leakage through the *side doors* (search, sort, error, logs)

**What goes wrong:**
Masking the profile field is necessary but not sufficient. The existing search builds `lower(...) like lower($n)` against display_name and nicknames (`repository.ts:399-415`). If SteamID search is ever added (tempting, since `player_steam_ids` is already joined), an attacker can confirm/enumerate full SteamIDs by binary-searching the `LIKE` filter even when the response only shows last-4. Other leak channels in this stack:
- **Sort/cursor**: if a list is ever sortable by steam_id, the *cursor* encodes the raw sort value — a masked response with an unmasked cursor leaks the full ID in the opaque token.
- **Provenance/last-updated metadata** (planned in D): legacy export rows key on raw `steam_id` (`PLAYER_ENTITY_CTE`, `legacy-export.ts:182`) — copying that join's selected columns into a "data source" debug field can leak it.
- **Error payloads / logs**: Fastify validation errors and pino logs can echo query params and row data; a 500 during profile load could serialize the raw row including `steam_ids`.

**How to avoid:**
- Treat the full SteamID as a secret that exists ONLY in the DB and identity-resolution layer. Never accept it as a query/sort/cursor input on public routes; never select it into any public DTO, cursor tuple, or metadata field.
- Add a log redaction rule (pino `redact`) for `steam_id`/`steamIds` paths, and a custom error serializer that never echoes row data.
- Enumeration defense: don't expose substring search on identifiers at all; require exact match through the canonical id/slug.

**Warning signs:**
`steam_id` appears in a cursor token, an error message, a structured log line, or a `provenance` field; a search endpoint accepts a `steamId`/`steam` param.

**Phase to address:** **Phase A** (search/profile), **Phase D0** (cursor encoder must reject/omit secret sort keys), **Phase D** (provenance metadata), cross-checked in **Phase G**.

---

### Pitfall 6: Joining the legacy-export SQL straight into hot per-request read paths (N+1 + full-table scans)

**What goes wrong:**
The parity data (weapons, vehicles, relationships, weekly) lives in `legacy-export.ts` as queries **designed for a single batch CLI export of the whole corpus**, not per-profile reads:
- `PLAYER_ENTITY_CTE` (`legacy-export.ts:159-205`) scans ALL `parser_events` with `event_type='player_counter'` across every replay, with several `LEFT JOIN ... lower(...)` correlation joins and a `DISTINCT ON`. It has **no player filter**.
- `RELATIONSHIPS_SQL`, `WEAPONS_SQL`, `WEEKS_SQL` each re-embed that full CTE and aggregate the entire event table, then the TS layer buckets results into per-player maps in memory (`mapRelationships`, `mapWeapons`, `mapWeeks`).
If `GET /stats/players/:id/relationships` calls `loadRelationships()` and filters in JS, every profile view scans the whole event corpus. At even a few req/s this saturates Postgres.

Separately, existing hot paths already have N+1 shape: `getSquad` issues a second query per squad (`repository.ts:280`, `listSquadPlayers`), and `getLeaderboards` runs three sequential list queries (`:342-345`). Promoting parity into the profile response multiplies this.

**Why it happens:**
"The SQL already exists and is verified against legacy" makes copy-paste irresistible, and the CTE *looks* parameterizable. The cost is invisible until production data volume + concurrency.

**How to avoid:**
- Do NOT reuse the export queries verbatim. Write **new, player-scoped** read queries that push the `player_id` filter *into* the CTE/joins (so the planner can use indexes), returning only that player's weapons/vehicles/relationships/weeks.
- Add the required indexes (`parser_events(event_type, observed_player_ref)`, `player_steam_ids(steam_id)`, the nickname `lower(nickname)` expression index) before exposing the routes; verify with `EXPLAIN (ANALYZE)` that profile reads are index scans, not seq scans.
- Consider precomputed/materialized per-player parity rows (a read-model table refreshed on recalculation) rather than computing from raw events on every request — the data is "already computed" conceptually but is currently *derived live* from events.
- Batch the multi-section profile into ONE query or parallel scoped queries; never per-row.

**Warning signs:**
`EXPLAIN` shows `Seq Scan on parser_events` on a single-profile request; p95 latency on `/stats/players/:id` climbs with corpus size, not with that player's activity; Postgres CPU spikes correlate with profile traffic.

**Phase to address:** **Phase A** (parity promotion) — this is the single biggest performance risk in the milestone.

---

### Pitfall 7: Freezing a contract that still drifts — version discipline & gate weakness

**What goes wrong:**
The freeze plan bumps `info.version` `0.1.0`→`1.0.0` (`register-openapi.ts:12`) and relies on `verify-openapi.ts`, which only does **byte-for-byte string equality** of the generated vs committed JSON. That catches *un-committed* drift but does nothing about *semantic* drift after freeze: a developer can change a response field, regenerate, commit the new JSON, and the gate stays green while `web`'s generated types silently break. The version string is a manual field nobody is forced to bump, so `1.0.0` can quietly accumulate breaking changes.

**Why it happens:**
"No drift" is conflated with "no breaking changes". The drift check guarantees the artifact matches the code, not that the contract is backward-compatible. PROJECT.md's rule "keep API schema updates in the same change as API behavior" enforces *co-commit*, not *compatibility*.

**How to avoid:**
- Add a **breaking-change diff gate** (e.g. `oasdiff breaking` or equivalent) in CI comparing the committed `1.0.0` artifact against the PR's generated schema; fail on removed/renamed fields, narrowed types, newly-required request fields, removed enum values.
- Make the version bump mechanical: the breaking-diff tool's verdict drives whether `info.version` must increment; a breaking change that doesn't bump major fails CI.
- Publish a single immutable artifact path (`openapi/server-2.openapi.json`) and document that `web` pins to a tagged version, not `main`.
- Wire the currently-excluded Postgres-backed `test:integration` into the freeze gate (V2-CUTOVER-REVIEW.md item G) so the contract is verified against real serialized responses, not just the static schema.

**Warning signs:**
A PR changes a response shape but `info.version` is unchanged and CI is green; `web` reports type errors after pulling a "non-breaking" backend change; no tooling in CI other than the byte-equality check.

**Phase to address:** **Phase G** (freeze gate) — but the diff tool should be added *before* A/B/C/D land so it guards their schema changes too.

---

### Pitfall 8: nullable-vs-optional traps that break `openapi-typescript` consumers

**What goes wrong:**
This schema already mixes two distinct "missing value" encodings inconsistently:
- **Always-present-but-nullable**: `OverviewResponse.filters.rotationId: Union([uuid, Null])` (`schemas.ts:122`), `PlayerSummaryResponse.rotationId` (`:57`), `RotationSummaryResponse.endsAt` (`:40`). These generate `T | null` and are always in the payload.
- **Optional (may be absent)**: `PaginationQuery.page/pageSize`, `search`, `limit` are `Type.Optional(...)`, generating `T | undefined`.

When the cursor/parity work adds fields, the trap is choosing the wrong one. `openapi-typescript` generates `field?: T` for optional and `field: T | null` for nullable; if a field is marked *both* optional and nullable it becomes `field?: T | null` (three states) and every consumer must handle `undefined`, `null`, AND value — usually they don't, and crash on the case they forgot. Verified upstream: combining `type:object` + `nullable:true` produced wrong unions in openapi-typescript 7.3.0 (regression vs 6.7.6), and missing `required` makes *every* field optional in generated types — easy to hit because TypeBox `Type.Object` requires you to be deliberate about which keys land in `required`.

**Why it happens:**
TypeBox `Type.Optional` and `Type.Union([X, Type.Null()])` look interchangeable but mean different things to the generator. Developers reach for `Optional` to "be safe" and accidentally make required response fields optional, flipping `web`'s types to possibly-undefined and forcing defensive `?.` everywhere — or worse, hiding a genuinely-missing field.

**How to avoid:**
- Rule for **response** bodies: a field that is always present uses a concrete type or `Union([X, Null])` (never `Optional`). Reserve `Optional` for request inputs and for response fields that are genuinely sometimes-absent.
- Never mark a response field both optional and nullable unless `{}` and `{field:null}` mean different things (they don't for read APIs). Pick one.
- Pin the `openapi-typescript` major `web` uses and add a CI check that regenerates types from the frozen artifact and type-checks a tiny consumer fixture, so generator regressions (like the 7.3.0 union bug) surface in `server-2` CI, not in `web`.

**Warning signs:**
Generated `web` types show `field?: T | null` for data that's always present; `web` adds `!` non-null assertions or `?.` chains to compile against required data; a response field silently became optional after a schema edit.

**Phase to address:** **Phase D** (response shape ergonomics) and locked in **Phase G**.

---

### Pitfall 9: Unbounded replay event-timeline payloads

**What goes wrong:**
`GET /stats/replays/:id/events` over `parser_events` can return tens of thousands of rows for a long match. If returned unpaginated (or paginated by offset over a growing list), the response is multi-MB, serialization blocks the event loop (Fastify is single-threaded per worker), and `web` must hold the whole timeline in memory. The replay *list* and *sitemap* have the same unbounded shape.

**Why it happens:**
Event timelines feel like "just return the events". The parity/list endpoints get cursor pagination attention; the events endpoint is treated as a detail sub-resource and skips it.

**How to avoid:**
- Cursor-paginate events keyed on a monotonic per-replay ordering (event sequence / timestamp + id) with a hard `maxPageSize`. Same keyset rules as Pitfall 1–3 apply (unique tie-breaker, NULL handling for legacy null `replay_timestamp`).
- Cap and stream: set a max events-per-page and document it; consider time-window filters (`?fromTs=&toTs=`) so `web` can lazy-load timeline segments.
- For sitemap, page replay IDs too (see Pitfall 10).

**Warning signs:**
A single `/events` response exceeds a few hundred KB; event-loop lag / slow p99 on replay-detail traffic; `web` timeline view janks on long matches.

**Phase to address:** **Phase B** (replay surface).

---

### Pitfall 10: Sitemap that enumerates all replay IDs in one response at scale

**What goes wrong:**
A sitemap "of all replay IDs for SEO" implemented as one endpoint returning the full ID list grows linearly with the corpus (legacy import is large). One giant JSON/XML document blows past the 50k-URL / 50MB sitemap limits search engines enforce and times out as the corpus grows.

**Why it happens:**
Sitemaps look static and small early on; the cost shows up only after backfill.

**How to avoid:**
- Use a **sitemap index** + paged child sitemaps (≤50k URLs each), driven by the same keyset cursor over replay IDs. Add `lastmod` from `replay_timestamp`/updated-at so crawlers fetch incrementally.
- Cache/precompute sitemap pages; they don't need per-request freshness (SSE is deferred anyway).

**Warning signs:**
Sitemap response size grows unbounded; Google Search Console reports "sitemap could not be read" / too large; the endpoint's latency tracks total replay count.

**Phase to address:** **Phase B** (replay surface / sitemap).

---

### Pitfall 11: Deprecating `page`/`pageSize` in a way that breaks the freeze

**What goes wrong:**
`page`/`pageSize` are baked into request queries (`PaginationQuery`, `schemas.ts:4-9`), response bodies (`paginated()`), and helpers (`page()`/`emptyPage()`/`pageResult()`). The milestone replaces them with cursor + sort *and* freezes the contract in the same milestone. If the swap is partial — some endpoints cursor, some still offset, or the response still carries `total` "for compatibility" — the frozen `1.0.0` ships an inconsistent pagination contract that `web` can't model cleanly, and a later cleanup becomes a breaking change against the freeze.

**Why it happens:**
A/B/C/D run in parallel (V2-CUTOVER-REVIEW.md sequencing); without a single enforced pagination shape, different streams implement pagination differently. The "fast-unblock" option (freeze A+C+D read-stats subset first) makes this worse if B's replay lists later introduce a *second* pagination style.

**How to avoid:**
- Land **Phase D0** (one cursor envelope + helpers) FIRST and make every new and migrated list endpoint use it. Delete `PaginationQuery`/`page()`/`total` rather than leaving them as a parallel path.
- Because this milestone is a *fresh contract for a not-yet-built `web`*, do a clean break, not a dual-support deprecation: there is no existing public consumer to keep compatible (web is new). Verify nothing else (CLI, tests) depends on the offset shape before removing it.
- One contract-conformance integration test asserting every list route exposes `pageInfo.nextCursor` and none expose `page`/`total`.

**Warning signs:**
Grep finds both `cursor` and `pageSize` in the committed OpenAPI; two endpoints return different pagination envelopes; `total` still present on any list response at freeze time.

**Phase to address:** **Phase D0** (introduce), **Phase G** (verify clean removal before freeze).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse `legacy-export.ts` full-corpus SQL for per-profile parity routes | No new SQL to write; "already verified vs legacy" | Full `parser_events` seq scan per profile request; Postgres saturation; later forced rewrite | Never for hot read paths; OK only for the existing batch CLI |
| Keep `total` on list responses with cursor pagination | UI gets "page X of N" for free | A `COUNT(*)` per request, or a lie the UI trusts; baked into frozen contract | Never on the frozen public contract; use a separate estimate endpoint if truly needed |
| Mask SteamID in the route handler instead of the read model | Small diff | Raw ID still flows through DTO/cursor/logs; one missed path re-leaks | Never — mask at the read-model/SQL boundary and rename the field |
| Add `cursor` alongside existing `page`/`pageSize` | Non-breaking incremental migration | Two pagination models on one route; ambiguous requests; messy freeze | Never here (web is new — clean break) |
| Use byte-equality drift check as the freeze gate | Already implemented, cheap | Catches drift but not breaking changes; false sense of safety | OK as a *complement* to a breaking-diff gate, not a replacement |
| Mark response fields `Type.Optional` "to be safe" | Fewer required-field decisions | `web` types become possibly-undefined; defensive `?.` everywhere or hidden missing data | Only for genuinely sometimes-absent fields |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `openapi-typescript` (web's generator) | Field marked both optional + nullable → `field?: T \| null` 3-state; or missing `required` → all fields optional | One encoding per field; explicit `required`; pin generator major + CI fixture type-check (7.3.0 had a nullable-union regression) |
| Legacy export read model | Copying CTE that joins on raw `steam_id` (`legacy-export.ts:182`) and lower(name) into live routes | Write player-scoped queries with indexes; never select raw steam_id into a public/provenance field |
| Fastify `@fastify/swagger` version field | Treating `info.version` bump as the only "freeze" act | Add breaking-change diff (oasdiff) + integration tests as the actual gate; version bump is a label, not a check |
| pino logging / Fastify error serializer | Default serialization echoes query params and row data | `redact` steam_id paths; custom error serializer that never includes row payloads |
| PostgreSQL keyset pagination | `ORDER BY sort_col` without unique tail; `> :val` drops NULLs | `(sort_col, id)` row-value comparison; explicit `NULLS LAST` + cursor NULL handling |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-profile parity from full event scan | `Seq Scan on parser_events` in EXPLAIN; latency scales with corpus not player | Player-scoped queries + indexes, or materialized per-player read model | At real corpus size + any concurrency |
| `COUNT(*)` per list request for `total` | Slow-query log full of counts; list p95 climbs | Drop `total`; cursor `hasNext` via `limit+1` | Medium corpus, moderate traffic |
| Unbounded `/replays/:id/events` | Multi-MB responses; event-loop lag; web OOM | Cursor-paginate events with hard max page size | Long matches / busy replays |
| Monolithic sitemap | Response grows linearly; crawler timeouts; >50k URLs | Sitemap index + paged children + lastmod | After legacy backfill |
| `getSquad`/`getLeaderboards` sequential queries (`repository.ts:280`,`342-345`) | Extra round-trips per request | Batch/parallelize; single query where possible | Amplified once parity sections are added |
| Leading-wildcard search `like '%x%'` (`repository.ts:407`) | Seq scan on every search keystroke | Trigram (pg_trgm) index or prefix search; debounce | At many players + typeahead traffic |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Returning full SteamIDs on `/stats/players/:id` (live today, `schemas.ts:65`) | PII/identity leak to anonymous web; violates locked decision | Mask at read model, rename field, negative test for Steam64 regex |
| Allowing SteamID substring search/sort | Enumeration of full IDs even with masked output | No identifier substring search; exact canonical id/slug only; never put steam_id in cursor |
| steam_id in cursor token / provenance / logs | Opaque token or debug field leaks the secret | Forbid secret columns in sort keys/cursor tuples; pino redact; safe error serializer |
| slug→id resolution leaking internal UUIDs or enabling scraping | Mass enumeration of profiles | Rate-limit resolution; treat slug as the only public addressing; don't expose sequential internal keys |
| Moderator winner-fix endpoint reachable by public role | Unauthorized data mutation | Enforce existing moderator/admin role guard; audit record (PROJECT.md moderation rules) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Page X of N" UI on cursor pagination without reliable total | Misleading page counts / broken jump-to-page | Use infinite-scroll / next-cursor UX; don't promise random page access |
| Duplicated/skipped rows from unstable sort (Pitfall 1) | Same player shown twice while scrolling | Unique tie-breaker in cursor |
| Stale "last updated" with SSE deferred | Users think data is live | Show explicit provenance/last-updated metadata (planned in D) and a manual refresh affordance |

## "Looks Done But Isn't" Checklist

- [ ] **Cursor pagination:** Often missing the unique tie-breaker and NULL-key handling — verify by paging the entire dataset and asserting `distinct ids == reachable rows`, including rows with NULL sort keys.
- [ ] **SteamID masking:** Often only the profile field is masked — verify no full Steam64 (`7656119\d{10}`) appears in ANY response body, cursor token, log line, or error payload.
- [ ] **Parity routes:** Often pass tests on tiny seed data — verify `EXPLAIN (ANALYZE)` shows index scans (no `Seq Scan on parser_events`) on a single-profile request.
- [ ] **Contract freeze:** Often only checks drift (byte-equality) — verify a breaking-change diff gate exists and that `info.version` discipline is enforced by CI.
- [ ] **Replay events:** Often returns full timeline — verify a hard max page size and cursor pagination.
- [ ] **page/pageSize removal:** Often partially removed — verify no list response carries `page`/`pageSize`/`total` and no route accepts both `page` and `cursor`.
- [ ] **openapi-typescript output:** Often not validated downstream — verify regenerated types compile against a consumer fixture in `server-2` CI.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Full SteamID frozen into `1.0.0` contract | HIGH | Breaking change → `2.0.0`; coordinate with web; PII exposure already occurred — assess disclosure |
| Unstable cursor shipped | MEDIUM | Add `id` tie-breaker; cursors are opaque so old tokens just resume slightly off — acceptable if migration window short |
| Legacy SQL in hot path | MEDIUM-HIGH | Rewrite as scoped queries / materialized read model; add indexes; may need an emergency cache in front |
| Breaking change slipped past freeze gate | MEDIUM | Add oasdiff gate retroactively; bump major; regenerate web types |
| Monolithic sitemap timing out | LOW | Split into sitemap index + paged children |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. No unique tie-breaker | D0 | Walk-all-pages test: `distinct id == total reachable` |
| 2. NULL sort keys | D0 (+ B for replay_timestamp) | Seed NULL-key rows; assert reachable to end |
| 3. Offset↔cursor / `total` | D0 + G | No `total` on any list; mixed page+cursor → 400 |
| 4. SteamID leak in profile | A (blocker for G) | Steam64 regex absent from all bodies & committed OpenAPI |
| 5. SteamID side-door leaks | A / D0 / D, checked in G | No steam_id in search params, cursor, provenance, logs, errors |
| 6. Legacy SQL in hot path | A | EXPLAIN shows index scans on single-profile reads |
| 7. Contract drift after freeze | G (tooling added before A–D) | oasdiff breaking gate green; version discipline enforced |
| 8. nullable/optional traps | D + G | web consumer fixture type-checks in server-2 CI |
| 9. Unbounded events | B | Max page size enforced; cursor-paginated |
| 10. Sitemap at scale | B | Sitemap index + ≤50k-URL paged children |
| 11. page/pageSize migration | D0 + G | No offset artifacts remain in frozen contract |

## Sources

- This repository's source (verified directly): `src/modules/public-stats/routes/schemas.ts`, `routes.ts`, `filters.ts`, `models.ts`; `src/modules/public-stats/repository.ts`; `src/modules/statistics/repository/legacy-export.ts`; `src/openapi/register-openapi.ts`, `verify-openapi.ts`, `schema.ts` — HIGH confidence
- `.planning/PROJECT.md`, `.planning/V2-CUTOVER-REVIEW.md` (locked decisions, sequencing) — HIGH confidence
- [Null in OpenAPI best practices — Speakeasy](https://www.speakeasy.com/openapi/schemas/null) (optional vs nullable three-state guidance) — MEDIUM
- [openapi-typescript: incorrect type for nullable objects (7.3.0 regression vs 6.7.6) #1821](https://github.com/openapi-ts/openapi-typescript/issues/1821) — MEDIUM
- [openapi-typescript: required fields generated as optional #1467](https://github.com/openapi-ts/openapi-typescript/issues/1467) — MEDIUM
- PostgreSQL keyset/cursor pagination NULLS and tie-breaker behavior (general known issue, corroborated by repo's own legacy SQL adding `id` tie-breaker while public SQL omits it) — MEDIUM
- Google sitemap 50k-URL / 50MB limits (well-established crawler constraint) — MEDIUM

---
*Pitfalls research for: public read API + frozen OpenAPI contract on Fastify/TypeBox/PostgreSQL (server-2 v3.0)*
*Researched: 2026-05-31*
