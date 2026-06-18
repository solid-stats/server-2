# Code Review — Golden E2E Oracle (260617-v4e)

**Branch:** `quick/260617-v4e-golden-e2e-oracle`
**Depth:** quick (rigorous on test correctness)
**Scope:** `src/test/golden/**` (pipeline / bounty / invariants tests, loader, normalize, harness, README, snapshots), `scripts/*.sh`, `package.json`, `.github/workflows/cd.yml`. Working-tree content reviewed (reflects the final fix; the 3 staged files extract the shared `goldenInfraReachable()` guard).
**Ruleset:** `solidstats-server-ts-code-review` (Phase-1 contract gate N/A — test-only change, no route schema touched), `solidstats-server-ts-tests`, `solidstats-shared-review-standards`.

## API contract
N/A — change is test-only; no Fastify route schema, OpenAPI artifact, or `web`-facing shape is touched. Phase-1 gate passes vacuously.

---

## Verdict: REQUEST CHANGES

One 🟠 (over-redaction that makes a deterministic field assert nothing — the oracle's whole job is correctness) plus minor 🟡/🔵. No 🔴 BLOCK. The oracle is genuinely strong overall: real PG+RabbitMQ+S3, no mocked contract boundary, durable-job-before-publish assertion, hand-computed bounty anchors, role-gate 401/403/2xx, idempotent re-delivery — all pin real behavior, not vacuous shapes. The leak discipline and skip-clean design are sound.

| # | Sev | Topic | File |
|---|-----|-------|------|
| 1 | 🟠 | normalization over-redaction (hides regression) | `fixtures/normalize.ts` |
| 2 | 🟡 | redundant double infra-probe (resource churn) | `fixtures/loader.ts` |
| 3 | 🟡 | invariants suite missing `describe.skipIf` parity | `invariants.golden.test.ts` |
| 4 | 🔵 | dead param / over-eslint-disable | `bounty-anchor.golden.test.ts` |
| 5 | 🔵 | README skip-guard claim drift | `README.md` |

---

## 🟠 Findings

### 1. The normalizer silently collapses every non-redacted `Date` column to `{}` — a deterministic field is pinned but asserts nothing
**File:** `src/test/golden/fixtures/normalize.ts:53-64`, observable in every snapshot (`__snapshots__/pipeline-*.snap.json:10` etc.)

`pg` returns `timestamptz` columns as JS `Date` objects. `normalizeValue` only special-cases `string` and `Array`; a `Date` falls into the `typeof value === "object"` branch → `normalizeObject(value as Record<string, unknown>)` → `Object.entries(date)` returns `[]` (a `Date` has no enumerable own properties) → the value is emitted as `{}`.

`replay_timestamp` is **not** in `TIMESTAMP_KEYS`, so it is not intentionally redacted — yet every snapshot pins it as:
```json
"replay_timestamp": {},
```
This field is deterministic: the tests insert the fixed literal `'2026-05-09T00:00:00.000Z'`. It *should* be asserted as a real value (or, if non-deterministic elsewhere, added to `TIMESTAMP_KEYS` deliberately). Instead the normalizer destroys it. The oracle therefore would **not** catch a regression that drops, zeroes, or corrupts `replay_timestamp` (or any future non-`TIMESTAMP_KEYS` Date column — `valid_from`/`valid_to`/`expires_at` would silently meet the same fate). This is exactly the "over-redaction HIDES a real regression" failure the review focus calls out. `[tests §G strong oracle]` `[testing-standards §B determinism must not erase signal]`

**Fix:** handle `Date` explicitly in `normalizeValue`, *before* the generic object branch, and redact only genuinely non-deterministic timestamps by key rather than by type:
```ts
export function normalizeValue(value: unknown, uuids: UuidMap): unknown {
  if (value instanceof Date) {
    return value.toISOString(); // deterministic Dates survive; key-based redaction in normalizeObject handles now()-driven ones
  }
  if (typeof value === "string") {
    return UUID_PATTERN.test(value) ? uuids.token(value) : value;
  }
  // …
}
```
Then either add `replay_timestamp` to `TIMESTAMP_KEYS` (if you consider it noise) or let the now-correct ISO string be pinned. Re-generate the snapshots after the fix and confirm `replay_timestamp` shows the fixed ISO literal, not `{}`. Also worth a one-line test in `normalize.test.ts` asserting a `Date` round-trips to its ISO string (guards the regression permanently).

---

## 🟡 Findings

### 2. `goldenInfraReachable()` opens and tears down the full PG+RabbitMQ+S3 client triple twice per suite
**File:** `src/test/golden/fixtures/loader.ts:84-122`

`goldenInfraReachable()` calls `dockerReachable()`, which constructs `createDbClient`/`createQueueClient`/`createStorageClient`, probes, and closes them — *then* each `beforeAll` immediately rebuilds the same broker/storage/pool for the actual run. Not a leak (every client is closed in `dockerReachable`'s `finally` via `Promise.allSettled`), so principle 9 is satisfied — but it's a wasted connect/handshake cycle on every suite, and a RabbitMQ connect under a flaky CI broker is a needless extra failure surface. `[std: correctness §AB resource lifecycle — clean, just churny]`

**Fix:** acceptable as-is for a slow master-only gate; if you want it tighter, have the probe reuse the suite's already-built clients, or accept the churn and note it. Low priority.

### 3. `invariants.golden.test.ts` uses a bare `describe(...)`, not `describe.skipIf(!archivePresent())` like the other two suites
**File:** `src/test/golden/invariants.golden.test.ts:57`

The pipeline and bounty suites guard the `describe` with `.skipIf(!archivePresent())` so no phantom case collects when the archive is absent; invariants does not. It is *functionally* safe — every `it` early-returns on `!infraReachable`, and `dockerReachable` (not `goldenInfraReachable`) is used so it doesn't even depend on the archive — but the inconsistency means a Docker-less run reports these 6 specs as **passing** rather than **skipped**, diverging from the "skip cleanly" contract the README advertises (line 38-39). Each test body is a vacuous early-`return` pass, which reads as green coverage of invariants that never actually ran. `[shared-review-standards §F test must not look like it asserted when it didn't]`

**Fix:** for parity and honest reporting, gate the bodies through `it.runIf(infraReachable)` or wrap the describe so absent infra yields *skipped*, not *passed*, specs. At minimum align with the sibling suites' pattern.

---

## 🔵 Findings

### 4. `driveBounty` takes `currentRotationId` only to `void` it; broad file-level eslint-disable
**File:** `src/test/golden/bounty-anchor.golden.test.ts:298-299`

`void currentRotationId;` — the parameter is unused (the rotation is resolved from DB state, not the arg). Dead parameter; drop it and the `void` line, or use it. Minor. Separately, the file-level `eslint-disable … no-magic-numbers, @typescript-eslint/no-unnecessary-condition` is broad; the `no-unnecessary-condition` blanket can mask a genuinely-always-true guard (e.g. the `?? ""` fallbacks that can never be hit could hide a real null). Prefer line-scoped disables. `[std: SKILL §A lint hygiene]`

### 5. README claims `describe.skipIf(!archivePresent() || !dockerReachable)`
**File:** `src/test/golden/README.md:38`

The actual guard is `describe.skipIf(!archivePresent())` (collection-time) plus a runtime `infraReachable` early-return — `dockerReachable` is **not** evaluable inside `describe.skipIf` (it's async; the loader's own comment at `loader.ts:111-113` says exactly this). The README sentence describes a guard shape that does not and cannot exist. Cosmetic but misleading to the next maintainer. `[shared-review-standards docs accuracy]`

**Fix:** reword to match: "suites skip collection-time on `!archivePresent()` and runtime-skip the live block when the infra probe fails."

---

## Non-Findings Checked (ruled out)

- **Vacuous pass / empty snapshot:** snapshots are 4–11 KB of real normalized rows + 5 `GET /stats/*` bodies; bounty anchors use `toEqual(4|9|0)` hand-computed values (not snapshot-only); invariants assert concrete statuses/reasons/role codes. Not vacuous (except the `replay_timestamp` field, finding #1).
- **try/catch swallow:** the only `catch` is `dockerReachable`'s probe (intentional → skip), and `invariants.golden.test.ts:220-260`'s `try/finally` (no catch — `app.close()` guaranteed, errors propagate). No swallowing.
- **Leak discipline (principle 9):** `afterAll` closes broker, app, s3, storage, pool in all live suites; `pollUntil` uses plain `setTimeout` resolved each iteration (no dangling timer — the promise resolves before the next loop), bounded by a hard 30s deadline; no real signal handlers; no fake timers anywhere (correct for a live broker). `purgeParserQueues` and `publishCompleted` close their channel+connection. Clean.
- **Determinism — uuid + now() + ordering:** `UuidMap` first-seen tokens for ids and fks; `TIMESTAMP_KEYS` redacts now()-driven columns; `object_key`/`source_file` redacted for per-run/host paths; `normalizeRows` sorts unordered table dumps by natural key while contractual orders are deliberately *not* sorted. Sound — **except** the Date-type hole in finding #1.
- **Capture script secrets:** no hardcoded VPS host/IP/key/secret — all via `VPS_S3_*` env, validated with fail-loud missing-env check (`capture-artifacts.sh:46-54`); `mc alias remove` cleans the credential alias; Happ-VPN bypass reminder present (script + README). `[shared-project-standards security]` Clean.
- **Skip-clean / verify isolation:** `test`, `test:coverage`, `verify` all `--exclude 'src/test/golden/**'`; `golden-oracle` CI job is `push` + `master`/`main` gated, not a PR check, 30-min timeout. `verify` stays green Docker-less. Confirmed in `package.json:24-39` and `cd.yml:61-102`.
- **Duplication:** one loader, one normalizer, one harness; production `ParserArtifact` / `ParseCompletedMessage` types reused (not hand-mirrored); the shared `goldenInfraReachable()` is the fix's whole point. Clean.
- **Principle 7 (pins current behavior, doesn't "fix"):** `driveBounty` forces `game_type='sg'` and `parse_jobs.status='published'` to *reach* the real scope, not to alter output; comments document why. `bigint size_bytes` pinned as `"123"` string (pg behavior) — pinned as-is, correct.
