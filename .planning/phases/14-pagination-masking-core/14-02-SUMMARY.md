---
phase: 14-pagination-masking-core
plan: 02
subsystem: public-stats
tags: [security, masking, logging, steamid, sec-01, sec-02]
requires:
  - "src/modules/public-stats/repository.ts (mapPlayerProfile choke point)"
  - "src/infra/logging/logger.ts (createLoggerOptions redact config)"
provides:
  - "maskSteamId(steamId) -> last-4 masked string"
  - "expectNoSteam64(value) reusable zero-Steam64 guard helper (exported for 14-03)"
  - "pino redact paths covering SteamID-bearing log fields"
affects:
  - "PlayerProfileResponse.steamIds now masked (...NNNN); contract type unchanged (string[])"
tech-stack:
  added: []
  patterns:
    - "Single row->payload mask choke point at mapPlayerProfile"
    - "Defense-in-depth: mapper mask + pino redact + test-time regex guard"
key-files:
  created:
    - "src/modules/public-stats/routes/pagination/mask.ts"
    - "src/modules/public-stats/routes/pagination/mask.test.ts"
    - "src/test/integration/steamid-leak-guard.test.ts"
  modified:
    - "src/modules/public-stats/repository.ts"
    - "src/infra/logging/logger.ts"
    - "src/test/app.test.ts"
decisions:
  - "Reuse steamIds: string[] holding masked '...NNNN' strings (no schema type change; minimizes web churn) — per 14-RESEARCH Open Question 2."
  - "maskSteamId returns `...${steamId.slice(-4)}`; short/edge values yield '...'+available trailing chars, never throwing."
metrics:
  duration: "~12 min"
  completed: "2026-05-31"
  tasks: 2
  files: 6
requirements: [SEC-01, SEC-02]
---

# Phase 14 Plan 02: Masking Core Summary

Closed the live full-Steam64 leak in `PlayerProfileResponse.steamIds` by masking
to last-4 (`...7890`) at the single `mapPlayerProfile` row→payload choke point,
plus pino `redact.paths` defense-in-depth and a reusable `expectNoSteam64` guard
that sweeps every public route asserting zero `7656119\d{10}` matches.

## What Shipped

### Task 1 — maskSteamId + mapPlayerProfile choke point (SEC-02) — `f935b04`
- `mask.ts`: `maskSteamId(steamId: string): string` → `` `...${steamId.slice(-4)}` ``.
- `repository.ts`: `mapPlayerProfile` now emits
  `steamIds: row.steam_ids.map((steamId) => maskSteamId(steamId))` — raw
  `row.steam_ids` emission removed. Confirmed no other mapper/query path emits raw
  `steam_id`/`steam_ids` (summary/list mappers do not include steamIds).
- `mask.test.ts`: RITE/AAA case-table covering the canonical Steam64, edge lengths
  (3/1/0-char), non-digit trailing chars, and an explicit zero-`7656119\d{10}`
  assertion.

### Task 2 — pino redaction + zero-Steam64 leak guard (SEC-01) — `79bf480`, `f9123ac`
- `logger.ts`: extended `redact.paths` with `*.steamId`, `*.steamIds`,
  `*.steam_id`, `*.steam_ids` (existing paths + `censor: "redacted"` preserved).
- `src/test/integration/steamid-leak-guard.test.ts`:
  - **Exports** `expectNoSteam64(value: unknown)` (regex `/7656119\d{10}/u`) for
    reuse by Plan 14-03.
  - **Negative self-tests** prove the guard catches a planted Steam64 in both an
    object and a raw string (not a vacuous assertion).
  - Redact-path assertion verifies the four SteamID paths are present.
  - Route sweep injects `/stats/players`, `/stats/squads`, `/stats/bounty`,
    `/stats/leaderboards`, `/stats/players/:id`, `/stats/squads/:id` and runs
    `expectNoSteam64` over both `response.json()` and `response.payload`.

## Masked Field Shape (decision)
`steamIds` stays `string[]` and holds masked `...NNNN` strings. No TypeBox schema
type change, no OpenAPI contract break, minimal `web` churn.

## WEB CONSUMER NOTICE
**`PlayerProfileResponse.steamIds` is a semantic contract change for the `web`
app.** The OpenAPI/TypeBox type is unchanged (`string[]`), but the **values** are
now masked last-4 strings (`...NNNN`, e.g. `...7890`) instead of full Steam64
identifiers. Any `web` code that assumed full Steam64 values in `steamIds` (deep
links to Steam, identity matching, copy-to-clipboard of a full ID) must be updated
to treat the field as a display-only masked token. This is intentional (SEC-01/
SEC-02): a full `7656119\d{10}` must never leave the server. **Action for `web`:**
audit all `steamIds` consumers and drop any full-Steam64 assumption. No generated
client regeneration is required (type identical); this is a value-contract change
only.

## Deferred / it.todo for Plan 14-03
`src/test/integration/steamid-leak-guard.test.ts` contains one `it.todo`:
**"emits zero full Steam64 over the malformed-cursor 400 error path"**. The
malformed-`cursor=` → 400 path only exists once 14-03 wires `BadCursorError` → 400.
**Plan 14-03 must un-skip this case**: inject a malformed `cursor=`, assert 400, and
run `expectNoSteam64` over the error body + payload. 14-03 should also extend
`tests/postgres.test.ts` with the real-pg leak sweep using the exported
`expectNoSteam64`.

## Reusable helper path
`expectNoSteam64` is exported from
`src/test/integration/steamid-leak-guard.test.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint forbids direct callback reference to `.map(maskSteamId)`**
- **Found during:** Task 1 (lint gate).
- **Issue:** `unicorn/no-array-callback-reference` rejects
  `row.steam_ids.map(maskSteamId)` (and `import-x/order` rejected the value import
  placed between type imports).
- **Fix:** Wrapped as `.map((steamId) => maskSteamId(steamId))` and moved the value
  import above the type-import group with a blank line. The plan's `key_link`
  intent (`steam_ids.map(...maskSteamId...)`) is preserved; the masking is
  identical. Acceptance A1 literal-string grep no longer matches verbatim, but the
  masked-mapper behavior and the `mask.test.ts` round-trip prove the wiring.
- **Files modified:** `src/modules/public-stats/repository.ts`
- **Commit:** `f935b04`

**2. [Rule 1 - Bug] Stale logger redact-paths snapshot in `app.test.ts`**
- **Found during:** Task 2 full-suite verification.
- **Issue:** `src/test/app.test.ts` `toStrictEqual` on `redact.paths` failed after
  adding the four SteamID paths — a direct, in-scope consequence of the Task 2
  logger change.
- **Fix:** Added the four `*.steamId*`/`*.steam_id*` paths to the expected array.
- **Files modified:** `src/test/app.test.ts`
- **Commit:** `f9123ac`

## Verification Status
- `pnpm test` (unit suite): **53 files, 243 tests passed**.
- `npx vitest run src/test/integration/steamid-leak-guard.test.ts`: **10 passed, 1 todo**.
- `npx vitest run src/modules/public-stats/routes/pagination/mask.test.ts`: **8 passed**.
- `pnpm run typecheck`: clean (only the known Node-engine `>=25` WARN under Node 22 — STATE.md blocker, not a failure).
- `pnpm run lint`: clean.
- `steamIds` remains `string[]` — no schema change required (SEC-02 contract intact).

## Known Stubs
The fake read model returns `steamIds: ["steam-a"]` (no Steam64) for the in-memory
route sweep; the strongest real-data guard is the `mask.test.ts` unit case plus the
real-pg extension that Plan 14-03 adds. This is documented, not a blocking stub.

**Wave-1 coverage handoff (intentional, not a defect):** the single
`it.todo("emits zero full Steam64 over the malformed-cursor 400 error path")`
placeholder is deliberately un-wired at Wave 1 — the malformed-`cursor=` → 400
surface and the real-pg leak-guard seed do not exist yet. **Plan 14-03 Task 3**
completes both (wires `BadCursorError` → 400, replaces the `it.todo` with a live
case, and extends `tests/postgres.test.ts` with the real-pg sweep using the
exported `expectNoSteam64`). The Wave-1 file is graded at 100% V8 coverage on its
own because `it.todo` adds no un-exercised executable branch — see
`<acceptance_criteria>` in 14-02-PLAN.md Task 2.

## Self-Check: PASSED
- FOUND: src/modules/public-stats/routes/pagination/mask.ts
- FOUND: src/modules/public-stats/routes/pagination/mask.test.ts
- FOUND: src/test/integration/steamid-leak-guard.test.ts
- FOUND commit: f935b04
- FOUND commit: 79bf480
- FOUND commit: f9123ac
