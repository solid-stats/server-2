# Project Research Summary

**Project:** server-2 v3.0 — "Public API v1: complete & freeze the contract for `web`"
**Domain:** Public read-API surface completion + OpenAPI contract freeze on a shipped Fastify + TypeBox + PostgreSQL backend (serving the new `web` frontend `sg.zone`)
**Researched:** 2026-05-31
**Confidence:** HIGH

## Executive Summary

This milestone is **API-surface completion, not new product**. The stack (Node + TS + Fastify + TypeBox + PostgreSQL + `pg` raw SQL + `@fastify/swagger`-generated OpenAPI) is already shipped, validated, and idiomatic; the underlying data — parity stats, replays, parser events, nickname/squad history, bounty inputs, commander-side outcomes — already exists in the database. All four researchers converged on the same headline: **add ZERO new runtime dependencies.** Every capability `web` needs (cursor pagination, replay surface, sitemap, slug resolution, contract freeze) is a *pattern addition* on existing deps, not a library addition. The only arguably-new thing is an optional dev-only breaking-change/lint gate (`@redocly/cli` or `oasdiff`) to harden the freeze — and even that breaking-diff gate is recommended.

The recommended approach is to build a small number of **shared foundational helpers first, then layer surfaces on top, then freeze.** Two foundations gate almost everything: (1) a shared **cursor keyset-pagination helper** — a base64-JSON cursor codec over a `(sortValue, id)` total-order tuple plus a `cursorPaginated()` TypeBox combinator — which must land before every list endpoint (players, squads, bounty, replays, events); and (2) a **SteamID masking module** applied at the row→payload mapping boundary, because full SteamIDs **leak live today** through `PlayerProfileResponse.steamIds` to anyone unauthenticated. After those, the parity stats are promoted by **extracting the `legacy-export` SQL into a shared `parity-sql.ts`** (parameterized by a per-entity predicate) so CLI export and per-profile routes read one SQL source and derive identical numbers. The replay surface (list + detail + paged event timeline + sitemap) is the largest new piece but needs **no schema change except a `slug` column migration**. The closing gate is the OpenAPI freeze: bump `0.1.0 → 1.0.0`, add a breaking-change diff gate beyond the existing byte-diff drift check, and promote `test:integration` into CI.

The dominant risks are all **freeze-permanence risks** — anything wrong that ships in `1.0.0` becomes a breaking `2.0.0` to fix. The four that must be gated before freeze: the **live SteamID leak** (hard blocker — mask or drop the field), **unstable cursors** (missing unique tie-breaker / NULL sort-key handling causing duplicated/skipped rows), **reusing bulk export SQL in hot per-profile routes** (full-corpus `parser_events` seq scans that saturate Postgres), and **freezing a contract the byte-diff gate can't protect from semantic drift**. Two scope traps must be actively resisted: the **player-request correction-flow model is OUT of scope** (a separate hybrid milestone) and must NOT be frozen now; and the **moderator manual commander-winner fix already exists** as the `legacy_winner_fix` workflow — verify and freeze it, do not rebuild.

## Key Findings

### Recommended Stack

**Add nothing to runtime deps.** The work is pattern additions over already-installed, already-latest packages: raw `pg` parameterized SQL (the codebase idiom — no ORM/query builder), TypeBox schemas, `@fastify/swagger` for OpenAPI generation, and `openapi-typescript` (already a devDep) on the `web` side. Cursor pagination = ~40 lines of in-repo keyset SQL + a tiny base64-JSON codec. Replay surface = new TypeBox schemas + `pg` queries over existing tables. Sitemap = a streaming Fastify route, no `sitemap` npm package. slug→id = a `slug` column + unique index. Freeze = bump `info.version` + tighten the existing gate. (`kysely@0.29.0` is installed but **dead code** — do not build cursor libs on it; consider removing as cleanup.)

**Core technologies (all already shipped — do NOT re-add or replace):**
- `fastify@5.8.5` + `@fastify/type-provider-typebox@6.1.0`: HTTP + schema-typed handlers — streaming covers the sitemap, route schemas drive OpenAPI.
- `@sinclair/typebox@0.34.49`: request/response schemas — expresses cursor params, replay/event schemas, and the `cursorPaginated()` helper.
- `pg@8.20.0`: raw parameterized SQL — keyset pagination, slug lookup, event timeline are plain SQL over the existing Pool. This is the idiom; new queries must follow it.
- `@fastify/swagger@9.7.0`: generates OpenAPI 3.0.3 from route schemas — `info.version` here is the single freeze line.
- `openapi-typescript@7.13.0` (devDep, `web` consumer): generates `web`'s client types from the frozen artifact — no version change.
- **Optional dev-only:** `@redocly/cli` / `oasdiff` for spec-lint + breaking-change diff as a stricter freeze gate.

### Expected Features

Every feature traces to the `web` brief / sketches; this is what `web` cannot build without.

**Must have (table stakes — must land before freeze):**
- **Cursor pagination + server-side sort** on ALL list endpoints (players, squads, replays, bounty/leaderboards) — contract-breaking, replaces `page/pageSize`, targets 10k–100k rows.
- **Replay list / detail / paged event timeline + replay-ID sitemap** — the largest new surface; replay is `web`'s default page.
- **Parity stats on player + squad profiles** (weapons, vehicles, pvp relationships, weekly buckets, KD/score/games) — promote from the `legacy-public-export` CLI to public routes.
- **slug→id resolution** (player + squad) — `web` URLs are slug-only.
- **Nickname + squad-membership history timelines** (dated, with explicit unknown gaps).
- **Bounty formula component breakdown** + **squad-effectiveness explainability** — the trust differentiator ("explain WHY," never an opaque number).
- **Commander-side stats: first-class filterable `unknown` outcome** + per-side/rotation/player filters.
- **Provenance / last-updated metadata envelope** on stat responses.
- **Rotation-as-filter** across surfaces + **per-rotation detail endpoint**.
- **Server-side SteamID masking (last-4) or field drop** — security-critical; currently leaking.
- **Admin rotation CRUD** (launch-blocking admin surface).
- **OpenAPI contract freeze** (version bump + published artifact + CI integration freeze gate) — closing gate.

**Should have (competitive / cheap-if-data-exists):**
- **Bounty-relevance boolean flag on replay events** — cross-links the timeline to the bounty story (P2; deep cross-link deferred).
- First-class queryable `unknown` and the consistent provenance envelope are themselves the differentiators (cheap because the data already models them).

**Defer (out of this milestone / v2+):**
- **Player-request correction flows** (5 guided flows, drafts API, autosave, attachments) — separate hybrid request-model milestone; **do NOT freeze this contract now**.
- SSE / realtime freshness — static + `lastUpdatedAt` + manual refresh for v1.
- Comparison endpoints, yearly/nomination stats, global cross-entity search.
- Versioned/historical re-parse results.

### Architecture Approach

Integrate into the existing module structure, not a new module. Every route module follows the **interface (`models.ts`) + empty-default (`createEmpty…ReadModel`) + Pg-impl (`repository.ts`)** pattern, wired via `registerXxxRoutes(app, { readModel })` (empty in `app.ts`/OpenAPI export, Pg in `server.ts`). New surfaces (replay, parity, slug) must follow this split. Cross-cutting output rules (SteamID masking, provenance) live in the row→payload **mapper**, not routes or SQL, so they can't be forgotten on the next endpoint. The central decision: **do NOT call the bulk export service per-request and do NOT copy-paste its SQL** — extract the parity SQL fragments + `PLAYER_ENTITY_CTE` into a shared `parity-sql.ts` parameterized by a per-entity `where` predicate, reuse the existing pure transforms (`playerExport`, `kdRatio`, `weekExport`) so derived numbers stay byte-identical, and expose heavy parity as paginated/cacheable **sub-resources** rather than inflating the profile object.

**Major components:**
1. **Shared cursor helper** (`pagination/cursor.ts`, NEW) — `CursorQuery` schema, `cursorPaginated()` wrapper, `encode/decodeCursor`, keyset `WHERE` builder. Foundational; blocks all lists.
2. **SteamID masking module** (`steam-id-mask.ts`, NEW) — pure `maskSteamId`, applied in every mapper; closes the live leak.
3. **`parity-sql.ts`** (NEW, sibling of `legacy-export.ts`) — extracted CTE + weapons/relationships/weekly SQL, shared by CLI export and per-entity routes.
4. **Replay surface** (`routes/replays/*` + `replays-repository.ts`, NEW) — list/detail/events/sitemap as `PgReplayReadModel`; the long pole.
5. **slug migration `0005_public_slugs.sql`** (NEW) — `slug` columns + unique index, backfilled; the only schema change.
6. **Provenance envelope** + history sub-resources (MODIFIED schemas/repository) over existing timestamped tables; **winner-fix** = verify/freeze the existing `legacy_winner_fix` workflow only.

### Critical Pitfalls

1. **SteamID leak is LIVE today** (`PlayerProfileResponse.steamIds` returns full IDs unauthenticated) — mask at the read-model/mapper boundary (or drop the field), rename so the change surfaces in review, and add a negative integration test that no `7656119\d{10}` Steam64 appears in ANY response body, cursor token, log, or error. **Hard freeze-gate blocker.** Watch the side doors too: no SteamID search/sort/cursor-key/provenance field/log.
2. **Unstable cursors** — every cursor `ORDER BY` must end in a unique column and the cursor must encode the full `(sortValue, id)` tuple; handle nullable sort keys (`replay_timestamp`, `ends_at`, never-played dates) with explicit `NULLS LAST` + cursor NULL handling. Verify by walking all pages and asserting `distinct id == reachable rows` including NULL-keyed rows.
3. **Reusing bulk `legacy-export` SQL in hot per-profile routes** — those queries are full-corpus `parser_events` seq scans with no entity filter; per-request use saturates Postgres. Write player-scoped queries over the shared `parity-sql.ts` fragments + add indexes; verify `EXPLAIN` shows index scans, not `Seq Scan on parser_events`.
4. **Freezing a contract the byte-diff gate can't protect** — the existing `verify-openapi.ts` catches *drift* but not *semantic/breaking* change; add an `oasdiff`/`@redocly/cli` breaking-change gate + version-bump discipline, and promote `test:integration` into CI so real serialized responses are checked. Add the diff tool *before* the surfaces land so it guards their schema changes too.
5. **Inconsistent pagination + nullable-vs-optional traps at freeze** — clean-break `page/pageSize/total` (no dual model, no `count(*)` per request; `web` is a brand-new consumer so no compatibility burden), and for response fields use a concrete type or `Union([X, Null])` (never `Optional`) so `openapi-typescript` doesn't emit 3-state `field?: T | null`. Unbounded replay events / monolithic sitemap are the same root cause — cursor-paginate events with a hard max page size, and use a sitemap index + ≤50k-URL paged children.

## Implications for Roadmap

Based on combined research, the recommended structure front-loads the two shared foundations, runs the smaller stat surfaces in parallel, treats replay as the long pole, and closes with the freeze. This maps to the milestone's A/B/C/D/G letters plus a new **D0** foundation phase.

### Phase D0: Pagination & masking core (foundation)
**Rationale:** Every list endpoint depends on the cursor helper, and the SteamID leak is live and must close early — both flagged as must-land-first. Building cursor once prevents divergent pagination styles that would poison the freeze.
**Delivers:** shared `pagination/cursor.ts` (codec + `(sortValue, id)` tuple + `cursorPaginated()` combinator + keyset `WHERE` builder) and `steam-id-mask.ts` wired into existing mappers (closing the leak immediately).
**Addresses:** cursor pagination + server-side sort (table stakes); SteamID masking (security).
**Avoids:** Pitfalls 1 (leak), 2 (NULL/tie-breaker), 3 & 11 (offset↔cursor / `total` / clean break).

### Phase A: Parity stats + SteamID hardening
**Rationale:** Parity is "already computed" data needing surfacing; it co-locates the profile-level masking and is the single biggest *performance* risk (hot-path SQL).
**Delivers:** extract `parity-sql.ts`; per-entity weapons/vehicles/relationships/weekly sub-resources + KD/score/games on profile; masked SteamID field.
**Uses:** shared `parity-sql.ts` fragments + existing pure transforms (numbers stay identical to CLI export).
**Avoids:** Pitfalls 4 (leak in profile), 5 (side-door leaks), 6 (full-corpus scans).

### Phase C: History timelines + provenance + filters (parallel with A)
**Rationale:** Pure additions over existing timestamped tables; low risk, unblocks profile/trust screens early.
**Delivers:** nickname + squad-membership history sub-resources, provenance/last-updated envelope, rotation-as-filter + per-rotation detail, commander-side filterable `unknown`, slug→id resolution + `0005_public_slugs.sql` migration.
**Implements:** mapping-layer provenance attachment; resolution endpoints.

### Phase B: Replay surface (long pole)
**Rationale:** Largest new piece and `web`'s default page; depends on D0 (cursor) and A's masking + `PLAYER_ENTITY_CTE`. Start as soon as D0 is ready.
**Delivers:** `/stats/replays` list, `/:id` detail, `/:id/events` paged timeline, streaming replay-ID sitemap (index + paged children); `replays-repository.ts`.
**Avoids:** Pitfalls 9 (unbounded events), 10 (monolithic sitemap), 2 (null `replay_timestamp`).

### Phase G: Contract freeze (closing gate)
**Rationale:** Can only freeze once all read routes land; gates `web` type generation. The fast-unblock path (freeze the read-stats subset A+C first, then B, then full freeze) is viable if `web` needs stats screens early.
**Delivers:** `info.version 0.1.0 → 1.0.0`; breaking-change diff gate (oasdiff/redocly) added on top of byte-diff; `test:integration` promoted into CI; published immutable artifact; verify the existing `legacy_winner_fix` moderator endpoint is frozen.
**Avoids:** Pitfalls 7 (semantic drift), 8 (nullable/optional), 11 (offset artifacts in frozen contract). **Hard gate:** no full SteamID anywhere in `1.0.0`.

### Phase Ordering Rationale
- **D0 before everything:** the cursor envelope and masking are shared seams; building them once prevents per-stream divergence that would bake an inconsistent pagination/leak into the frozen contract.
- **A, C parallel; B is the long pole:** A/C are scoped additions over existing data and can proceed concurrently once D0 lands; B has genuinely new SQL + the most scale traps, so it starts early but finishes last among the surfaces.
- **G last, with its tooling added early:** the breaking-diff gate must exist *before* A/B/C/D land so it guards their schema changes, but the freeze (version bump + clean-break verification + CI integration) is the closing act.
- **Scope discipline baked in:** request-correction model is excluded from G; winner-fix is verify-only.

### Research Flags

Phases likely needing deeper research during planning (`/gsd:plan-phase --research-phase`):
- **Phase D0:** keyset cursor over mixed sort directions + NULL sort-key encoding is subtle; confirm the exact tuple-comparison form and synthetic NULL-boundary handling.
- **Phase B:** replay-event ordering key (sequence vs `occurred_at`+id), sitemap index sizing/caching, and `parser_results` map/side extraction shape need a focused look at the parser output.
- **Phase G:** choose and wire the breaking-change tool (oasdiff vs `@redocly/cli`) and define the version-discipline CI rule.

Phases with standard patterns (skip research-phase):
- **Phase A & C:** well-grounded in existing code (shared SQL extraction, sub-resource routes, mapper-layer provenance) — established repo patterns, file-level guidance already in ARCHITECTURE.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against installed `package.json`/lockfile + latest npm versions; "no new deps" conclusion grounded in direct code inspection. |
| Features | HIGH | Traced to the actual `web` brief, sketches 001–003, PROJECT.md, V2-CUTOVER-REVIEW.md — not generic assumptions. |
| Architecture | HIGH | Every recommendation names a real file/line; the export-SQL reuse decision is grounded in the actual `legacy-export.ts` query shape. |
| Pitfalls | HIGH | Most pitfalls verified against current source (incl. the live SteamID leak and missing cursor tie-breakers); openapi-typescript nullable traps corroborated by upstream issues (MEDIUM on those external corroborations). |

**Overall confidence:** HIGH

### Gaps to Address (open questions to resolve during planning)

- **Masked last-4 vs drop the field:** does `web` actually need masked last-4 SteamIDs, or should the field be dropped entirely (smallest attack surface)? Decide before A/G — it changes the frozen schema.
- **Replay-event ordering key:** confirm the canonical monotonic ordering for the timeline cursor (event sequence vs `occurred_at` + `id`), including legacy null `replay_timestamp` handling. Resolve in B.
- **Total-count endpoint need:** does any `web` UI need an (approximate) total for "page X of N", or is "load more" sufficient? If needed, expose a separate cacheable estimate endpoint — never `count(*)` on the hot list path.
- **Stricter freeze linter:** adopt `@redocly/cli` lint in addition to the recommended `oasdiff` breaking-change gate, or is the breaking-diff gate enough? Optional; decide in G.

## Sources

### Primary (HIGH confidence)
- Local codebase inspection — `src/modules/public-stats/{routes/*,repository.ts}`, `src/modules/statistics/{export/legacy-public-export.ts,repository/legacy-export.ts}`, `src/openapi/{register-openapi.ts,verify-openapi.ts,schema.ts}`, `src/infra/db/migrations/0001_v1_domain_schema.sql`, `src/app.ts`, `src/server.ts`, `src/modules/requests/routes/workflows/workflows.ts`, `package.json`, `pnpm-lock.yaml`.
- `.planning/PROJECT.md` + `.planning/V2-CUTOVER-REVIEW.md` — locked v3.0 decisions, gap map (A–G), out-of-scope (request model, SSE).
- `web/gsd-briefs/web.md` + `web/.planning/sketches/{001,002,003}/` — authoritative product brief and concrete column/field lists.
- Context7 `/fastify/fastify-swagger`, `/websites/openapi-ts_dev` — OpenAPI generation & `openapi-typescript` consumption.
- npm registry (2026-05-31) — verified latest versions for all core deps.

### Secondary (MEDIUM confidence)
- Context7 `/lukewpc/kysely-cursor`, `/charlie-hadden/kysely-paginate` — cursor libs exist but require Kysely (dead code here); rejected.
- openapi-typescript upstream issues #1821 (nullable-union regression), #1467 (required→optional); Speakeasy null/optional guidance.
- PostgreSQL keyset/row-value seek pagination + NULLS/tie-breaker behavior; Google sitemap 50k-URL/50MB limits.

---
*Research completed: 2026-05-31*
*Ready for roadmap: yes*
