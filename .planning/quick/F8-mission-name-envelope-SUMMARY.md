# F8 — mission-name envelope extraction fix

**Branch:** `fix/f8-mission-name-envelope`
**Severity:** CRITICAL — every replay had `game_type = NULL`, so all aggregates were empty.

## Root cause

`extractMissionName(replay)` in `src/modules/statistics/game-type/classify-game-type.ts`
read `replay[key]` and only accepted it when `typeof value === "string"`, scanning the
camelCase candidate keys `mission / missionName / world / worldName / map / mapName`.

In the **real** parser artifact the mission name lives at the snake_case key
**`mission_name`** (not in the old candidate list) and is wrapped in the present/value
envelope — every `replay`-block field is enveloped this way:

```jsonc
raw_snapshot.replay.mission_name = { "state": "present", "value": "mace@…" }
```

So for all 23 556 production replays `extractMissionName` returned `null` →
`classifyGameType` returned `null` (excluded) → `replays.game_type` stayed `NULL` →
zero aggregates.

The existing unit test passed only because it fed a plain-string `missionName`
(`{ mission: "sg_x" }`), and the real-pg seeds in `postgres.test.ts` seeded the same
plain `replay: { mission: "..." }` shape — neither exercised the production envelope path.

## Fix

**1. `classify-game-type.ts` — `extractMissionName`**

- Added the real snake_case keys to `MISSION_CANDIDATE_KEYS`, in priority order:
  `mission_name` (confirmed production field, first), then `world_name`, `map_name`,
  then the legacy camelCase fallbacks (`mission`, `missionName`, `world`, `worldName`,
  `map`, `mapName`) kept for back-compat.
- Added a small local `unwrapMissionField(value)` that mirrors `repository.ts`
  `presentValue` semantics without importing across the public-stats / repository
  boundary (classifier stays dependency-free):
  - plain `string` → returned as-is (back-compat),
  - `{ state: "present", value: <string> }` → `value`,
  - `{ state: "absent" }` / missing / non-string value → `null` (try next key → null).

Behavior is otherwise unchanged — classification spec (sgs exclusion, prefix match,
mace `<10`, sm month cutoff, includeReplays override, excludeReplays link, per-type /
all-time, `is_show`) is untouched. This is purely a mission-extraction fix.

**2. Tests**

Unit (`game-type/tests/classify-game-type.test.ts`):

- `unwraps the present/value envelope at the real 'mission_name' key (F8)` — mace/sg/sm.
- `treats an 'absent' envelope (or non-string value) as not present (F8)` —
  `{state:"absent"}`, `value: 42`, `null` → null.
- `prefers the real 'mission_name' envelope over legacy snake_case fields (F8)`.
- `falls back to legacy 'world_name'/'map_name' envelopes when mission_name is absent (F8)`.
- `still accepts a plain-string mission for back-compat (F8)`.

These were verified to **FAIL against the old extractor** (3 enveloped cases returned
`null`) and **PASS against the fix** — proving the test catches this bug class.

Real-pg (`repository/tests/postgres.test.ts`):

- Added `missionEnvelope(missionName)` helper building the faithful production block
  `{ mission_name: { state: "present", value } }`.
- Replaced all 16 `replay: { mission: "..." }` seed sites (literal sg_assault/sg_one/
  sg_two seeds + the `seedClassifiableReplay` / `seedKillReplay` /
  `seedManyPlayerKillReplay` / `seedCorpusReplay` helpers) with
  `replay: missionEnvelope(...)`, so the classification / per-type / all-time / parity
  tests now drive the production envelope-unwrap path end-to-end. No parity assertion
  weakened — only the seed shape was made faithful.

Other test files (`readiness.test.ts`, `fixtures.ts`, `full-run.test.ts`) set no
`replay` mission block and don't exercise classification → left unchanged.

## Verification

Infra-free (green):

- `prettier --check` — clean
- `eslint .` — clean (added file-level `eslint-disable camelcase` for the snake_case
  wire keys in the test, matching repo convention)
- `tsc --noEmit` — clean
- unit `classify-game-type.test.ts` — 26/26 pass
- `openapi:check` — OpenAPI contract diff EMPTY

PG-backed (`test:integration`, `postgres.test.ts`, `test:coverage`): pending — requires
the Docker stack (PG/RabbitMQ/MinIO) which could not be started in this environment
(user not in `docker` group; `sudo` needs a TTY). Run `sudo docker compose up -d` then
`pnpm verify` (`--no-file-parallelism`) to complete the mandated full green run.

## Out of scope (deferred)

`src/modules/public-stats/replay-mapper.ts` `extractMapName` has the **identical** bug
(plain-string only, no `mission_name` / envelope), so the public replay *label* is also
empty on real data. Not part of F8 (separate module / symptom, classifier must stay
dependency-free). Should be fixed in a follow-up.

## Commits

- _pending atomic commit on `fix/f8-mission-name-envelope`_ (hash recorded after commit).
