# Review — Phase 16: Slug Resolution, History & Provenance

**Scope:** Phase 16 source + test diff, `3e3b187..HEAD` (commits `0c0d5ce`..`6c5f471`). Files: `routes/slug.ts`, `history-gaps.ts`, `provenance.ts` (+ tests), `routes/schemas.ts`, `models.ts`, `empty-read-model.ts`, `repository.ts`, `routes/routes.ts`, migration `0006_slug_addressing.sql`, integration/route tests, generated OpenAPI.
**Gates:** `pnpm run verify` reported green by the submitter (lint/typecheck/tests/coverage/openapi) — not re-run here; style nits the linter enforces are intentionally not flagged.

## API contract
⚠️ Slug-or-uuid contract is **only partially honored**. All 13 detail/sub-resource routes declare `SlugOrUuidParameters` (slug OR uuid), but only `getPlayer`/`getSquad`/`getRotation` actually resolve a slug. The other 10 cast the raw param to `::uuid` → see finding 1 (a real runtime break, not just a doc mismatch). All touched routes declare request + response schemas; the new fields are additive (slug/provenance/history), so no breaking change to the `web` client. OpenAPI regenerated.

## Blockers 🔴

1. `repository.ts:521-547, 548-581, 583-626, 628-663, 670-703, 710-759, 766-804, 831-868, 870-908, 910-952` [contract/correctness] — **Slug input to every sub-resource route 500s.** The routes `/stats/players/:id/{weapons,vehicles,relationships,weekly,name-history,membership-history}` and `/stats/squads/:id/{weapons,relationships,weekly,membership-history}` accept a slug (`SlugOrUuidParameters`, pattern `^[A-Za-z0-9-]+$`), but the repository methods pass `id` straight into `$1::uuid` casts via `playerExists`/`squadExists`/`playerStatTimestamp`/`squadStatTimestamp` and the history `where … = $1::uuid` queries. A slug like `igrok-vasya` makes PostgreSQL throw `invalid input syntax for type uuid` → unhandled → **500**. Only `getPlayer`/`getSquad`/`getRotation` use `looksLikeUuid`; the sibling methods were never adapted. This is the exact `$slug::uuid` 500 the resolver branch was built to prevent, reachable on 10 of 13 new/extended endpoints. The route tests (`players.test.ts`, `squads.test.ts`, `history.test.ts`) and the real-pg sweep only ever pass UUIDs, so the gap is uncaught.
   *Fix:* resolve the slug→uuid once at the top of each sub-resource method (e.g. a private `resolvePlayerId(idOrSlug): Promise<string | null>` that branches on `looksLikeUuid` and selects `id from canonical_players where slug = $1::text`, returning `null`→404), then thread the resolved UUID into the existing `$1::uuid` queries. Add a real-pg test that drives at least one player and one squad sub-resource **by slug** and asserts 200 (not 500).

2. `0006_slug_addressing.sql:53` vs `slug.ts:73` [correctness/data-integrity] — **SQL `slug_base()` and TS `slugify()` are NOT byte-identical** — the documented invariant (slug.ts:5-15, migration header line 17) is violated. TS strips both soft sign `ь` and hard sign `ъ` (slug.ts lines 72-73); the SQL only does `replace(…, 'ь', '')` and never removes `ъ` (it is absent from both the `replace` chain and the `translate` source `'абвгдезийклмнопрстуфыэ'`). In SQL the surviving `ъ` falls through `translate` unchanged and is then collapsed to a dash by `[^a-z0-9]+`. Verified divergence: `"подъезд"` → TS `podezd` vs SQL `pod-ezd`; `"объект"` → `obekt` vs `ob-ekt`; `"съезд"` → `sezd` vs `s-ezd`. Consequence: a backfilled row (SQL path) and an app-inserted row (TS path) get different slugs for the same name, breaking slug stability/lookup for any name containing `ъ`. The determinism test passes only because `SLUG_FIXTURE_NAMES` (postgres.test.ts:1331) contains no `ъ`.
   *Fix:* add `replace(…, 'ъ', '')` to the SQL `slug_base()` chain alongside the existing `ь` removal, and add `"объект"`/`"подъезд"` to `SLUG_FIXTURE_NAMES` so the byte-identical test actually exercises the hard sign. Note: editing the migration body changes its sha256 checksum — coordinate with `migrate.ts`'s checksum contract (re-baseline on a fresh DB, or ship a follow-up migration if `0006` is already applied anywhere durable).

## High 🟠

_none_

## Medium 🟡

3. `repository.ts:806-818` [correctness] — `getRotation` resolves slug-or-uuid correctly, but the correlated subselect `(select max(ps.calculated_at) … where ps.rotation_id = r.id)` runs even in the slug branch; fine functionally, but note the query binds only `[id]` while the player/squad detail queries bind `[id, rotationId]` — confirm the rotation detail genuinely needs no rotation filter (it doesn't here, but the asymmetry is easy to mis-edit later). No behavior bug; leaving as a readability/maintenance note.

## Low 🔵

_none_

## Non-Findings Checked
- **SQL injection / parameterization:** All queries are parameterized; slug branch uses `$1::text`, uuid branch `$1::uuid`. The boolean `looksLikeUuid` flag correctly prevents a slug reaching a `::uuid` cast in `getPlayer`/`getSquad`/`getRotation`. `count()`/`rotationWhere` interpolate only internal constant column/table names, never user input. No string concatenation of user values. (The sub-resource 500 in finding 1 is a correctness/contract defect, not an injection vector.)
- **Steam64 leakage:** History counterparts emit `{id,slug,name}` (squad) / `{id,slug,displayName}` (player) only — no `steam_id` columns selected (repository.ts:879, 919). `maskSteamId` still applied on the profile path. Leak-guard sweep extended to the new routes. No `7656119\d{10}` surface introduced.
- **Provenance no-clock:** `maxTimestamp` derives exclusively from passed `Date` rows; returns `null` for zero rows; no `Date.now()`/`new Date()` no-arg/`now()`. All callers pass row-derived `Date`s (`calculated_at`, `updated_at`, `created_at`, `observed_*`, `valid_*`).
- **`withGaps` edge policy:** Leading gap only when `firstFrom !== null`; between-gap strict `prevTo < nextFrom` (adjacent/overlap → none); trailing gap only when last window closed. Matches the locked policy and the unit tests.
- **TypeBox additivity:** slug/provenance/history fields are all additive; `SlugOrUuidParameters` is bounded (`maxLength:128`, anchored pattern) — DoS-safe. Relationship `id` intentionally not `format:uuid` (documented parity reason).

## Verdict
**BLOCK** — finding 1 (slug → 500 on 10 sub-resource routes) and finding 2 (TS/SQL slug divergence on hard sign `ъ`) are correctness/contract defects reachable in production and uncaught by the current tests. Fix both, add slug-driven sub-resource tests and a `ъ`-bearing determinism fixture, then re-run `pnpm run verify`. Finding 3 is a non-blocking maintenance note.

---
_Reviewer: solidstats-backend-ts-code-review_
