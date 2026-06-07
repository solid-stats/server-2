# Phase 18: API Ergonomics, Admin & Winner-Fix - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning
**Source:** Autonomous discuss (grey areas auto-decided per /gsd:autonomous; cross-app boundary respected). Grounded in a thorough live-code exploration on 2026-06-07.

<domain>
## Phase Boundary

Complete the trust-and-admin surfaces on `server-2`: (1) expose the already-stored
bounty formula component breakdown on bounty + leaderboard responses; (2) add explicit
`unknown`-outcome exposure and a `side` filter to commander-side stats; (3) add an admin
rotation CRUD write surface (create/update/delete, admin-role-guarded); (4) verify and
freeze — NOT rebuild — the existing `legacy_winner_fix` moderator workflow.

All four requirements are additive on the shipped stack. **Zero new runtime dependencies.**
No bounty/commander **formula** change (formulas are computed upstream in the statistics
module; this phase only surfaces/filters/administers, it does not recompute or redefine).

Out of scope: changing the bounty or commander-side math; OCAP parsing (`replay-parser-2`);
ingest/crawl (`replays-fetcher`); the contract version bump + CI freeze gates (Phase 19).
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Data sources (grounded in live code — confirmed 2026-06-07)
- **Bounty:** `bounty_points` table has `(id, rotation_id, player_id, points numeric(12,2),
  inputs jsonb)`. `inputs` shape (per `src/modules/statistics/bounty/bounty.ts:25-34`):
  `{ base_score: 1, events: BountyPointEventEvidence[], total_points: number, version: 1 }`.
  Each kill event evidence carries `player_factor` (victim effectiveness) and `squad_factor`
  (squad effectiveness); excluded events carry `excluded_reason` + `points: 0`. The formula is
  `points = 1 * (1 + player_factor) * (1 + squad_factor)` per counted kill — **there is NO
  rotation multiplier in the formula.** `mapBounty` (`repository.ts:1667`) currently DISCARDS
  `inputs`.
- **Commander-side:** `commander_side_stats (rotation_id, player_id, side, known_wins,
  known_losses, unknown_outcomes, calculated_at)`. `unknown_outcomes` is already stored and
  already exposed as `unknownOutcomes` in `CommanderSideResponse`
  (`routes/schemas.ts:404-411`). `listCommanderSides(filters)` (`repository.ts:452-476`)
  already supports a `rotationId` filter; there is **no `side` filter yet**.
- **Rotations:** `rotations (id, name UNIQUE, starts_at, ends_at, created_at, slug)` with
  `check (ends_at is null or ends_at > starts_at)`; `slug` + `slug_base()` SQL added in
  migration 0006. Read routes exist (`GET /stats/rotations`, `/stats/rotations/:id`).
- **Winner-fix:** `legacy_winner_fix` is ALREADY implemented and exposed at
  `POST /moderation/requests/:id/workflows` (action `legacy_winner_fix`, payload
  `{ replayId, winnerSide }`), guarded by `requireAnyRole(["admin","moderator"])`. The applier
  (`workflow-applier.ts:94-122`) `jsonb_set`s `parser_results.raw_snapshot.side_facts.outcome`
  to `status:"known"` + `winner_side`, then triggers
  `recalculateCommanderSideStatsForParserResult`. Moderation trail via `moderation_actions`.

### API-02 — Bounty breakdown
- Add an **additive, optional** `breakdown` object to `BountySummaryResponse` (and therefore
  the leaderboard, which reuses the bounty list). Shape:
  `breakdown: { countedKills: number, victimEffectiveness: number, squadEffectiveness: number,
  baseScore: number } | null`. Values are **derived from the stored `inputs.events`** at the
  mapper boundary — NO recomputation, NO formula change:
  - `countedKills` = number of `event_type:"kill"` evidence entries (excluded events ignored).
  - `victimEffectiveness` = sum of `player_factor` over counted-kill events.
  - `squadEffectiveness` = sum of `squad_factor` over counted-kill events.
  - `baseScore` = `inputs.base_score * countedKills` (the pre-multiplier base contribution).
- **"Rotation context"** in the requirement maps to the existing per-rotation scoping
  (`rotationId` is already on the response) — bounty is computed per rotation. We do **not**
  invent a rotation multiplier (that would be a cross-app formula change, out of bounds).
  Document this mapping explicitly in the plan + OpenAPI description.
- Breakdown is **aggregate, not per-event** (API ergonomics + contract stability; per-event
  evidence can be large). No victim ids / no Steam64 in the breakdown (the aggregate carries
  only numbers + counts). `mapBounty` must defensively handle legacy rows whose `inputs` is
  null/missing/old-version → `breakdown: null`.

### API-03 — Commander-side unknown + filters
- Explicit unknown exposure is **already satisfied** (`unknownOutcomes` field) — verify with a
  test and document; do not duplicate.
- **Add a `side` filter**: extend the commander-side query schema with an optional `side`
  string and `listCommanderSides` filters to add `commander.side = $n::text` when present,
  mirroring the existing `rotationId` filter SQL exactly. Keep the existing
  `(rotation_id desc, side, display_name nulls last)` ordering. No pagination change (current
  pattern returns the full filtered set, as today).

### API-04 — Admin rotation CRUD (new write surface)
- New module `src/modules/admin/` (mirrors the `requests`/moderation route module shape:
  handlers take `pool: Pool` + `auth` options directly — the `public-stats` read-model
  triple-declaration pattern does NOT apply to write routes).
- Routes (all `tags: ["admin"]`, in the OpenAPI contract since `web` consumes it):
  - `POST /admin/rotations` → 201 `{ id, name, slug, startsAt, endsAt }`.
  - `PUT /admin/rotations/:id` → 200 (full replace of name/starts_at/ends_at).
  - `DELETE /admin/rotations/:id` → 204.
  - All guarded by `requireRole(options.auth, "admin")` (admin only — NOT moderator).
- **Slug:** generated server-side from `name` via the existing `slug_base()` SQL path on
  create (and regenerate on name change in update); never client-supplied.
- **Validation:** `name` required + unique (DB unique constraint → map violation to **409**);
  `startsAt` required (date-time); `endsAt` optional, must be `> startsAt` (CHECK constraint →
  map to **422** if violated). Body via TypeBox; unknown id → **404**; non-admin → **403**.
- **DELETE safety (LOCKED):** refuse to delete a rotation that has dependent rows
  (`replays.rotation_id`, `commander_side_stats.rotation_id`, `bounty_points.rotation_id`) →
  **409 Conflict** with a clear message. Only empty rotations are deletable. Rationale:
  cascading would silently destroy derived stats/replays — unacceptable; the FK is `NOT NULL`
  on `commander_side_stats`/`bounty_points`. (Pre-check counts in the same transaction.)
- Writes run in a transaction; all values bound as `$n` (no interpolation).

### HIST-04 — Winner-fix verify-and-freeze
- **Do NOT rebuild.** Add/confirm integration coverage that freezes current behavior:
  - non-admin/non-moderator → rejected (role guard);
  - approved `stats_correction` request + `legacy_winner_fix` action → `parser_results.
    raw_snapshot.side_facts.outcome` becomes `status:"known"` + the given `winner_side`;
  - downstream `commander_side_stats` recalculated (unknown→known reflected);
  - a `moderation_actions`/workflow-action audit row is written.
- Confirm the route is present in the regenerated OpenAPI contract. Extend the Steam64
  leak-guard to the workflow response if not already covered. No endpoint changes unless a
  verification gap is found.

### Cross-cutting (reuse, do not reinvent)
- Auth/roles: `requireRole` / `requireAnyRole` from `src/modules/auth/routes/authorization.ts`.
- Write-route shape (auth guard → TypeBox body/params → business validation → standard
  `{ message }` errors with 400/403/404/409/422) mirrors `requests/.../moderation`,
  `audit-patches`, `workflows`.
- OpenAPI must regenerate clean (`pnpm run openapi:check`); 100% reachable-source coverage
  gate holds; full `pnpm run verify` green at phase close.
- No full Steam64 (`/7656119\d{10}/`) anywhere; extend the leak-guard to any new route bodies.

### Claude's Discretion
- Exact TypeBox field ordering, helper/file names, SQL formatting, test layout, and whether
  admin rotation CRUD lives in one route file or is split — follow established conventions.
- Whether to surface rotation `name`/`slug` inside the bounty breakdown's rotation-context
  description vs. relying on the existing top-level `rotationId`.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Patterns to mirror (this repo)
- `src/modules/statistics/bounty/bounty.ts` — bounty `inputs` shape + formula (READ-ONLY source of truth for the breakdown fields).
- `src/modules/public-stats/repository.ts` — `listBounty`/`mapBounty` (478-509, 1667), `getLeaderboards` (511-534), `listCommanderSides` (452-476).
- `src/modules/public-stats/routes/schemas.ts` — `BountySummaryResponse` (412-417), `CommanderSideResponse` (404-411), `RotationSummaryResponse` (157-164).
- `src/modules/public-stats/routes/filters.ts` — `rotationFilters` (mirror for the new `side` filter).
- `src/modules/auth/routes/authorization.ts` — `requireRole` / `requireAnyRole`.
- `src/modules/auth/routes/role-routes.ts` — admin-guarded write route example (`PUT /admin/users/:id/roles`).
- `src/modules/requests/routes/workflows/workflows.ts` + `workflow-applier.ts` — `legacy_winner_fix` workflow (verify-and-freeze target).
- `src/modules/requests/routes/moderation/moderation.ts`, `audit-patches/audit-patches.ts` — write-route validation/error/transaction patterns.
- `src/infra/db/migrations/0001_v1_domain_schema.sql` — `rotations` (94-101), `commander_side_stats` (213-222), `bounty_points` (224-232), `parser_results` (170-178), `moderation_actions` (260-270).
- `src/infra/db/migrations/0006_slug_addressing.sql` — `slug_base()` SQL for rotation slug generation.
- `src/test/integration/steamid-leak-guard.test.ts` — leak-guard route list to extend.
- `src/openapi/contract.test.ts` — OpenAPI contract guards.

</canonical_refs>

<specifics>
## Specific Ideas

- Bounty breakdown derivation (mapper): fold `inputs.events` once — for each
  `event_type:"kill"` entry accumulate `countedKills++`, `victimEffectiveness += player_factor`,
  `squadEffectiveness += squad_factor`; `baseScore = inputs.base_score * countedKills`. Guard
  `inputs == null || inputs.version !== 1` → `breakdown: null`.
- Commander-side `side` filter: add `side?: string` to the filter type; compose
  `commander.side = $n::text` into the existing WHERE alongside the rotation predicate.
- Admin DELETE pre-check (one transaction): `select 1 from replays where rotation_id=$1
  union all select 1 from commander_side_stats where rotation_id=$1 union all select 1 from
  bounty_points where rotation_id=$1 limit 1` → if any row, 409; else delete.
- Rotation create/update: insert/update name/starts_at/ends_at; derive slug via the same
  `slug_base()` path used by migration 0006; rely on the `name` UNIQUE constraint + CHECK for
  integrity, mapping `23505`→409 and `23514`→422.

</specifics>

<deferred>
## Deferred Ideas

- Bounty rotation-context **multiplier** (a real rotation weighting factor) — would be a
  cross-app formula change requiring `replay-parser-2`/statistics coordination; out of bounds.
  v1 surfaces the existing victim/squad components + per-rotation scoping only.
- Per-event bounty evidence endpoint (drill-down) — aggregate breakdown only for v1.
- Commander-side pagination — current pattern returns the full filtered set; cursor pagination
  is a separate ergonomics follow-up if needed.
- Rotation soft-delete / archive — v1 does a hard delete restricted to empty rotations.

</deferred>

---

*Phase: 18-api-ergonomics-admin-winner-fix*
*Context gathered: 2026-06-07 via autonomous discuss (grey areas auto-decided)*
