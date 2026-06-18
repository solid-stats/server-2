# Quick Task 260617-v4e: Golden E2E Integration Oracle — Research

**Researched:** 2026-06-17
**Domain:** server-2 ingest→stats pipeline regression oracle (Vitest 4 integration, real PG/RabbitMQ/S3)
**Confidence:** HIGH (call path + contracts traced in current code; one open item = VPS coordinates)
**Mode:** quick-task — decisions LOCKED in DEEP-BRAINSTORM.md; this validates/deepens mechanisms only.

## Summary

The full ingest→stats chain is wired exactly as the decision pack traced. The cross-app artifact contract holds: `server-2` `ParserArtifact` (`parser-artifact.ts:4`) is a structural subset of parser-2 `parse-artifact-v3`, and a parser-2-emitted artifact loads **as-is** (`loadParserArtifact` just does `JSON.parse(body)` — `storage/client.ts:87`). **Two load-bearing corrections to CONTEXT.md surfaced**: (1) server-2 does **NOT** verify SHA-256 of artifact bytes anywhere on the ingest path — `recordParserCompleted` stores `rawSnapshot` and only persists the checksums as metadata (`repository.ts:525-596`); the byte-verification lives in parser-2. So the fixture's `artifact_checksum` does **not** need to match its bytes for ingest to succeed. (2) The consume handler swallows errors and **nacks-with-requeue** (`rabbitmq.ts:126-128`) — a malformed/failing artifact will infinitely redeliver, so the bounded DB poll must have a hard timeout and the test must only feed artifacts that ingest cleanly.

The bounty formula is small and hand-computable (`bounty.ts:124`): `points = round₂(1 · (1+playerFactor) · (1+squadFactor))`, `effectiveness = kills / max(1, deaths.total)`. Non-trivial bounty requires seeding a **previous rotation** with `player_stats`/`squad_stats` rows whose `stats` JSON carries `{kills, deaths:{total}}` (`repository.ts:1073-1153`).

**Primary recommendation:** Build the oracle as `src/test/integration/golden/*.test.ts` mirroring `adapters.test.ts`/`postgres.test.ts` (docker-compose ports, `runMigrations()` in `beforeAll`, `truncate … cascade` in `beforeEach`). Drive promotion via `promotionService.promotePending()` directly (or `IntervalTask.runOnce()`), publish the real `parse.completed` to the real broker, then bounded-poll `parse_jobs.status='succeeded'`. Add a `test:golden` script that is **not** referenced by `verify`. The parser-2 golden floor (8 distinct OCAP inputs → CLI) is committable today; the hundreds-from-VPS capture is the only gated item.

## Architecture Patterns

### Real call path (validated against current code)

```
IntervalTask.runOnce()  (or promotionService.promotePending directly)
  → IngestPromotionService.promoteRecord (service.ts:72)
      findReplayBySource → findReplayByChecksum → createReplay → createParseJob   ← durable parse_jobs row HERE, in-tx, before any publish
      markStagingPromoted
  → [publishTask] ParseJobPublisher.publishQueued → queue.publishJson(parse.requested)   (runtime.ts:73-80)
  → TEST injects ParseCompletedMessage onto exchange `solid_stats.parser` rk `parse.completed`
  → real broker → consumeParserResults.completed (rabbitmq.ts:74, runtime.ts:93-108)
      artifactLoader.loadParserArtifact({bucket,key})  → S3 GetObject + JSON.parse  (storage/client.ts:76-88)
      repository.recordParserCompleted({...message, rawSnapshot: artifact})  (repository.ts:525)
          locks job; no-op if terminal (idempotency); job→succeeded, replay→parsed,
          supersede prior current parser_results, insert new current parser_results(raw_snapshot=artifact)
      recalculation.recalculateParserResult(parserResultId, artifact)  (recalculation.ts:45)
          persistParserArtifact → parser_events
          recalculatePlayerAndSquadStatsForParserResult → player_stats, squad_stats
          recalculateCommanderSideStatsForParserResult → commander_side_stats
          recalculateBountyPointsForParserResult → bounty_points  (repository.ts:185)
  → assert GET /stats/* via app.inject
```

### Await seam (no completion Promise)

The consumer fires `void handleCompletedMessage` — there is no awaitable signal. Poll `parse_jobs.status='succeeded' AND parser_results.status='current' exists for replay_id` with a hard ceiling (e.g. 30s, 200ms interval). On failure the handler **nacks with requeue=true** (`rabbitmq.ts:127`), so a bad artifact loops forever — the poll timeout is the only backstop. Do NOT use real timers; a plain `await new Promise(setTimeout)` poll loop is acceptable per `[tests]` "Deterministic time" guidance since this is a real-broker integration test, not a unit loop test.

## Validated Mechanisms (the 6 focus areas)

### 1. Artifact contract — minimum field set & checksum truth

`ParserArtifact` required fields (`parser-artifact.ts:4`): `contract_version: string`, `parser: Record`, `source: {…}`, `status: "success"|"partial"|"skipped"|"failed"`. Everything ingest reads downstream is **optional**: `players[]`, `weapons[]`, `destroyed_vehicles[]`, `diagnostics[]`, `side_facts`. The whole artifact is stored verbatim into `parser_results.raw_snapshot` (jsonb) and re-mapped by `mapParserArtifact` (`parser-artifact.ts:139`) into `parser_events`.

Minimum **useful** fixture for a non-empty stats run: `contract_version`, `parser`, `source`, `status:"success"`, plus `players[]` with `eid`, `n`, compact counters (`k`/`d`/`tk`/…) and nested `kills[]` (`{c,v,w}`), and `weapons[]` for name resolution. `[VERIFIED: src/modules/statistics/parser-artifact.ts:4-281, repository.ts:569-583]`

**A parser-2 artifact loads as-is.** parse-artifact-v3 `MinimalPlayerRow` (schema $defs:2257) is a superset of server-2 `PlayerRow` (extra `ck`,`eids`,`rn`,`tag` are ignored by TS structural typing; `s`/`n` nullable in schema, server reads them loosely). No deserialization gate, no `unevaluatedProperties` check at runtime. `[VERIFIED: storage/client.ts:87 — plain JSON.parse, no schema validation]`

**CHECKSUM — CONTEXT.md is WRONG for server-2.** `recordParserCompleted` (`repository.ts:525-596`) takes `artifact_checksum`/`source_checksum` but **never recomputes or compares them to the bytes** — it stores `rawSnapshot` directly and the checksums only land in metadata when `rawSnapshot` is absent (`repository.ts:581`, `parserResultMetadata`). `grep` over `src/` confirms zero `sha256(`/`verifyChecksum` on the ingest path. **Consequence for the plan:** the fixture's `source.checksum` / message `artifact_checksum` can be any well-formed `^[0-9a-f]{64}$` value; bytes need not hash to it. (The byte-verification the brief mentions is a parser-2/worker responsibility, not server-2.) `[VERIFIED: repository.ts:525-596 + grep]`

### 2. parser-2 CLI for the floor

Binary `replay-parser-2` (Cargo bin in `crates/parser-cli`, `Cargo.toml:14`). Command (`main.rs:39,208`):
```
cargo run --release --bin replay-parser-2 -- parse --input <ocap.json> --output <artifact.json> [--pretty] [--replay-id <id>]
```
`cargo build` is confirmed by presence of `crates/parser-cli` with bin target; `parse_command` (`main.rs:249`) reads input, parses via `public_parse_replay`, writes ParseArtifact JSON to `--output`.

**Golden corpus:** `crates/parser-core/tests/fixtures/golden/manifest.json` = **12 entries** but several reuse the same `.ocap.json`, so **8 distinct OCAP inputs**: `valid-minimal`, `invalid-json`, `metadata-drift`, `killed-events`, `side-facts`, `vehicle-context`, `aggregate-combat`, `combat-events`, `duplicate-slot-same-name`, `connected-backfill`. Named edge cases covered: winner_present/missing, vehicle_kill, teamkill, commander_side, null_killer, duplicate_slot_same_name, connected_player_backfill, partial/malformed. Note: `invalid-json` → `status:"failed"` and `combat-events`/`metadata-drift`/`killed-events` → `partial`; only `success`/`partial` artifacts are safe to feed the completed-consumer (a `failed` artifact still ingests but yields empty stats). `[VERIFIED: manifest.json (12 entries) + main.rs]`

### 3. SSH capture mechanism

S3 layout: `loadParserArtifact` reads `Bucket = message.artifact.bucket ?? config.s3.bucket`, `Key = message.artifact.key` (`storage/client.ts:79-81`). The existing integration `completedMessage` helper uses key prefix `artifacts/v3/<replayId>/<checksum>.json` and bucket `solid-replays` (`postgres.test.ts:607-609`) — that is the observed artifact key convention. Default bucket `solid-replays`, S3 endpoint `http://localhost:9000` path-style (`adapters.test.ts:14-19`).

**Capture script shape** (args/env-driven; VPS coords are the open item):
```sh
# inputs (env): VPS_HOST, VPS_S3_BUCKET (or path), MC_ALIAS or AWS creds, N
# 1. ensure Happ VPN bypass ip rule is active for VPS_HOST (else SSH/mc hangs) — see global memory happ-vpn-bypass-for-servers
# 2. mc cp --recursive <alias>/<bucket>/artifacts/v3/  $TMP/   (or aws s3 cp; or ssh + mc on the box)
# 3. (floor fallback) for each parser-2 golden ocap: replay-parser-2 parse --input … --output $TMP/<id>.json
# 4. tar czf src/test/integration/golden/fixtures/artifacts.tar.gz -C $TMP .
```
Prefer `mc` (MinIO client) or `aws s3 cp` against the VPS S3 endpoint over `scp`, since artifacts are S3 objects not files. The script must `--no-clobber` log captured-vs-skipped counts (no silent caps, principle 8). Unpack at test start to a tmp dir (`os.tmpdir()/golden-<runId>`), iterate with `test.each`.

### 4. Determinism / normalization

Non-deterministic fields entering the asserted surface, with recipe:

| Surface | Non-det field | Source | Normalization |
|---------|---------------|--------|---------------|
| `replays`, `parse_jobs`, `parser_results`, `parser_events`, `player_stats`, `squad_stats`, `commander_side_stats`, `bounty_points`, `ingest_staging_records` | `id` (uuid) | `gen_random_uuid()` | map uuid→stable natural key (replay: `source_system+source_replay_id` or `checksum`; player: nickname/`steam_id`; squad: tag; job: replay-key+contract_version) |
| all tables | `created_at`/`updated_at`/`calculated_at`/`finished_at`/`published_at`/`started_at` | `now()` | redact → `"<ts>"` |
| `parse_jobs` | `attempts` (stable=0 on happy path), `error` (null) | — | keep |
| FK columns (`replay_id`,`parse_job_id`,`parser_result_id`,`rotation_id`) | uuid | — | substitute via the same id→natural-key map |
| row ordering | DB scan order | — | sort rows by natural key before snapshot |
| `GET /stats/*` | embedded ids, slugs derived from names | — | same id map; slugs are derived/stable, keep |

**Ordering that IS contractual — keep asserted order, do not sort:** cursor-paginated lists (`pagination/cursor.ts`), and the bounty `inputs.events[]` array (already sorted deterministically by the producer — `bounty.ts:68-79` `toSorted` on playerId; events are append-order within a player). The event timeline in `parser_events` uses `sourceRef` indices (`player_kill_index`, `destroyed_vehicle_index`) that are deterministic, so sort by `(eventType, observedPlayerRef, sourceRef-index)`.

**Snapshot mechanism:** per `[tests]` repo convention, prefer **`toEqual` on a fully-normalized object** (strong oracle) for the bounty anchors and small tables, and **`toMatchFileSnapshot()`** for the large per-artifact characterization surface (Vitest 4 supports it; keeps hundreds of artifacts manageable and diff-reviewable). Snapshot files live under `src/test/integration/golden/__snapshots__/` (excluded from coverage by `src/test/**`). `[VERIFIED: vitest.config.ts:15]`

### 5. Bounty previous-rotation seeding

Path: `recalculateBountyPointsForParserResult` (`repository.ts:185`) → `assignReplayRotation` (needs a `rotations` row whose window contains `replay.replay_timestamp`) → if `status!=='assigned'` bounty is skipped (returns 0 rows). Then per scope, `loadPreviousBountyEffectiveness(rotationId,…)` (`repository.ts:1073`):
- finds the **previous** rotation = `rotations` row with `starts_at < current.starts_at` (latest such),
- reads that previous rotation's `player_stats`/`squad_stats` rows (matching `game_type`),
- extracts `{kills, deaths:{total}}` from each `stats` jsonb (`previousBountyStats`, `repository.ts:1138`).

`effectiveness = kills / max(1, deaths.total)`; `points = round₂((1+playerEff)·(1+squadEff))` for an enemy `kill` with a known victim; teamkill/unknown/missing-victim → 0 (`bounty.ts:103-137`).

**Minimum fixture state for a hand-computable anchor:**
1. Two `rotations`: `prev` (`starts_at` earlier) and `current` (window covering the artifact's `replay_timestamp`).
2. The artifact under test resolves to `current` (its `replay.replay_timestamp` inside the `current` window — set `ingest_staging_records.replay_timestamp` or rely on `source_replay_id` epoch derivation, `service.ts:173`).
3. In `prev` rotation, a `player_stats` row for the **victim player** with `stats = {"kills":K,"deaths":{"total":D}}` (matching `game_type`), and optionally a `squad_stats` row for the victim's squad.
4. The artifact contains an enemy `kill` (`players[].kills[].c="enemy_kill"`) where the victim's `eid` resolves to that seeded player.

Worked anchor: victim prev stats kills=3 deaths.total=1 → playerEff=3; no squad → squadFactor=0 → `points = round₂(1·(1+3)·(1+0)) = 4.00`. Two such kills by one attacker → 8.00. Pick 2–3 cases: (a) player-only effectiveness, (b) player+squad effectiveness, (c) excluded teamkill = 0. `[VERIFIED: repository.ts:185-233,1073-1153 + bounty.ts:103-162]`

### 6. Wiring + pitfalls

- **`test:golden` script** (add to package.json, NOT in `verify`):
  `"test:golden": "vitest run src/test/integration/golden --no-file-parallelism"`.
  `verify` (`package.json:38`) chains `format,lint,typecheck,test,test:integration,openapi:check,ops…,test:coverage` — none of these will pick up the golden file IF it is named to escape their globs. **Critical:** `test:integration` globs `src/test/integration` (`package.json:26`), which **would** include `golden/`. Place the golden suite in a path `test:integration` does not match, OR name the script-target dir so it's excluded. Cleanest: put it at `src/test/golden/**` (NOT under `integration/`) so neither `test`, `test:integration`, nor `test:coverage` includes it — but `test:coverage` uses `include: ["src/**/*.ts"]` for measurement and `exclude: ["src/test/**"]` for coverage, so files under `src/test/**` are coverage-excluded regardless. Verify in plan that `test:integration`'s positional glob doesn't sweep it.
- **Coverage:** `src/test/**` is excluded from coverage (`vitest.config.ts:15`); `test:golden` is a separate invocation never run by `verify`/`test:coverage` → zero coverage obligation. The golden test contributes no lines to the 100% gate. `[VERIFIED: vitest.config.ts:5-28, package.json:24-38]`
- **Isolation:** unique S3 key per run (`artifacts/v3/<runId>/<n>.json`) and ephemeral queue OR reuse durable queues but purge — the topology is durable (`rabbitmq.ts:149`). Simplest: publish to the existing `parse.completed` queue but `truncate … cascade` between cases and use unique `job_id`/`replay_id`. For the broker, `consumeParserResults` binds the durable `server2.parse.completed` queue; to avoid cross-test bleed, run `--no-file-parallelism` (already the integration convention) and drain/await per case.
- **Pitfall — infinite requeue:** a handler exception nacks-requeue (`rabbitmq.ts:127`). If a fixture artifact triggers any throw (e.g. recalc on malformed data), it loops. Mitigation: only feed `success`/`partial` artifacts; hard poll timeout; assert the job reached terminal `succeeded` (not just "no error").
- **Pitfall — `runOnce()` vs tasks:** `IntervalTask` exposes start/close; the decision pack says drive via `runOnce()`. Confirm `IntervalTask` has a `runOnce`/single-tick method in plan (else call `promotionService.promotePending(...)` and `publisher.publishQueued(...)` directly — both are public and what the tasks wrap, `runtime.ts:67,78`).

## Don't Hand-Roll

| Problem | Use Instead |
|---------|-------------|
| Schema/DDL for tables | `runMigrations(config.databaseUrl)` (`infra/db/migrate.ts`) — never mirror DDL `[tests Integration Harness]` |
| Fake repo / boundary mock | Real PG/RabbitMQ/S3 via docker-compose; mocking a contract boundary is anti-pattern #1 `[tests "What NOT to mock"]` |
| Config | `loadConfig(env)` with the fixed-port defaults from `adapters.test.ts` |
| Bounty expected values | recompute by hand from `bounty.ts` formula; assert with `toEqual` |
| Artifact parsing | feed real parser-2 CLI output / VPS objects — no synthetic toy blobs (principle 4) |

## Project Constraints (from CLAUDE.md / AGENTS.md / skills)

- Author through `solidstats-server-ts-tests` (cited as `[tests]` above): Vitest 4, `node` env, threads pool; per-layer map (repository/route = integration); co-location vs `tests/` dir; **strong oracles** (`toEqual` full shapes), coverage is a floor not proof; mock only true boundaries; deterministic time. `[tests TESTING.md]`
- `solidstats-server-ts-conventions`: 4-layer arch, `fastify-type-provider-zod`, Kysely, factory DI — the test reuses production factories, never re-implements them.
- `solidstats-shared-testing-standards`: AAA, isolation, determinism, real-infra-for-contracts.
- Do NOT pin request/moderation business logic (Phase 2 rewrites it) — only the role-gate (`requireRole`/`requireAnyRole`, `auth/routes/authorization.ts:25-29`; example protected route `admin/routes/rotations.ts:54` `requireRole(auth,"admin")`).
- Repo isolation convention is `truncate … cascade` (NOT fresh schema/db per test) — overrides the generic brief.
- GSD artifacts in English.

## Assumptions Log

| # | Claim | Risk if wrong |
|---|-------|---------------|
| A1 | VPS S3 bucket uses the same `artifacts/v3/<replayId>/<checksum>.json` key prefix seen in tests | capture script glob wrong → fewer/zero objects; mitigated by floor |
| A2 | `IntervalTask` exposes a single-tick `runOnce()`; if not, call `promotePending`/`publishQueued` directly | trivial plan adjustment |
| A3 | A `partial`-status parser-2 artifact ingests without throwing in recalc | feed only verified-clean artifacts; hard poll timeout backstops |

## Open Questions

1. **VPS host + S3 bucket/path + creds + Happ VPN `ip rule` bypass** — required for the hundreds-capture; agent has no VPS access. Floor (8 parser-2 golden inputs via CLI) is committable now so the oracle is never empty. (P1 — user-owned)
2. **Conflict-review & parse.failed cases have no "real" artifact** — accept a small synthetic staging pair (conflict) and a hand-built `parse.failed` message (failure path) as documented exceptions to the real-data rule. (P2 — plan)
3. **`test:integration` positional glob** may sweep `src/test/integration/golden/**` into `verify` — place the golden suite at `src/test/golden/**` (outside `integration/`) and confirm no `verify` script targets it. (P1 — plan)

## Sources

### Primary (HIGH)
- `src/modules/statistics/parser-artifact.ts`, `src/infra/queue/messages.ts`, `src/modules/ingest/runtime.ts`, `service.ts`, `repository/repository.ts:525-596`, `src/infra/queue/rabbitmq.ts`, `src/infra/storage/client.ts`, `src/modules/statistics/service/recalculation.ts`, `src/modules/statistics/bounty/bounty.ts`, `src/modules/statistics/repository/repository.ts:185-233,1073-1153`, `src/modules/public-stats/routes/routes.ts`, `src/modules/auth/routes/authorization.ts`
- `src/test/integration/adapters.test.ts`, `src/modules/ingest/repository/tests/postgres.test.ts`, `.planning/codebase/TESTING.md`, `package.json`, `vitest.config.ts`
- `replay-parser-2/schemas/parse-artifact-v3.schema.json`, `crates/parser-cli/src/main.rs`, `crates/parser-core/tests/fixtures/golden/manifest.json`

## Metadata
**Confidence:** call path HIGH; contracts HIGH; checksum/non-verification HIGH (grep-confirmed); VPS capture LOW (open item). **Valid until:** until Phase 2 Track C refactor lands (the whole point).
