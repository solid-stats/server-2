# Deep Brainstorm Brief — Golden end-to-end integration oracle

## Context
- Date: 2026-06-17
- Request: Build golden E2E integration test(s) that pin the current observable behavior of the
  ingest→stats pipeline as a behavioral regression oracle BEFORE the Phase 2 `server-2` refactor.
- GSD stage: pre-quick brainstorm (decision pack feeding `/gsd-quick --full`).
- Target outcome: locked decision pack → `/gsd-quick --full`.
- Artifact owner: Pavlov Alexandr.
- Source brief: `/tmp/golden-integration-test-prompt.md` (reusable, stack-agnostic).

## Goal
A behavior-preserving regression oracle for the ingest→stats pipeline plus the public read surface,
so the upcoming **Phase 2 `server-2` Track C refactor** — Oxfmt mass-reformat + full Oxlint (blocking
type-aware) + `tsc`→tsdown (2-entry `server.ts` + `migrate.ts`) + dependency-cruiser + knip + lefthook,
explicitly **behavior-preserving** — cannot silently change computed values or pipeline behavior.
It complements (does not replace) the unit suite, the `frozen-contract` + oasdiff contract gate, and
`verify`. The contract gate guards API **shape**; this oracle guards **computed values and pipeline
behavior**, which the shape gate is blind to.

## Users And Workflows
- Developers executing the Phase 2 refactor: the oracle is the safety net — green ⇒ behavior preserved,
  red ⇒ behavioral drift to investigate.
- Runs **only on master, pre-deploy**, as a dedicated slow CI job. Not part of per-PR `verify`.

## Scope
### Must Have
- One golden E2E test driving the **real** production path per real artifact:
  staging-row promote (`IntervalTask.runOnce()` → `IngestPromotionService`, `src/modules/ingest/service.ts`)
  → durable `parse_jobs` row + RabbitMQ publish (`src/modules/ingest/publisher.ts`)
  → real broker delivery → `ParseCompletedMessage` consumer (`src/infra/queue/rabbitmq.ts`)
  → real S3 artifact load (`artifactLoader.loadParserArtifact({bucket,key})`, `src/modules/ingest/runtime.ts:94`)
  → `recordParserCompleted()` (`src/modules/ingest/repository/repository.ts:525`)
  → `ParserResultRecalculationService.recalculateParserResult()` (`src/modules/statistics/service/recalculation.ts`)
  → aggregates + bounty → assert via `GET /stats/*` (`src/modules/public-stats/...`).
- **Real infrastructure** (mirror existing integration harness): real PostgreSQL + real RabbitMQ + real
  MinIO/S3 on the docker-compose fixed ports (PG `15432`, Rabbit `5673`, S3 `9000`), real schema via
  `runMigrations()`, `truncate … cascade` isolation, **unique S3 keys + ephemeral queue per run**.
- **Fixtures**: hundreds of **real** `ParserArtifact` JSONs captured once from real `replay-parser-2`
  output, committed as a **gzip archive** in-tree, **unpacked at test start**, iterated with `test.each`.
- **Assertions** (full observable contract, principle 5): characterization golden snapshots of
  `parser_results` (+ all evidence fields), `parser_events`, `player_stats`, `squad_stats`,
  `commander_side_stats`, `bounty_points`, terminal `parse_jobs`, `ingest_staging_records` status/evidence,
  and `GET /stats/*` responses — with deterministic normalization — **plus** hand-computed bounty
  assertions on 2–3 anchor cases (values are business-critical: check semantics, not only the snapshot).
- **Idempotency / invariants pinned** (principles 6–7, current behavior as-is):
  - durable `parse_jobs` row exists **before** the RabbitMQ publish (never fire-and-forget).
  - re-promote same staging row → dedup/no-op: `status='promoted'` + `promotion_evidence.duplicate_replay_id`.
  - same `source_system`+`source_replay_id`, **different** checksum/bytes → `status='conflicted'` +
    `conflict_details.reason='source_identity_changed_bytes'` (`service.ts:147`).
  - checksum-duplicate (no source match) → `status='promoted'` + duplicate evidence appended (`service.ts:166`).
  - re-deliver same `parse.completed` → terminal state recorded once.
- **Auth/role gate** (flow 4): a protected route rejects without role / accepts with role via the shared
  `requireRole`/`requireAnyRole` pre-handlers (`src/modules/auth/routes/authorization.ts`).
- **Capture script** (gated — agent lacks VPS access, principles 4 & 8): **pulls real production
  `ParserArtifact` objects from the VPS over SSH** (the actual artifacts `server-2` already ingested) →
  packs them into the committed gzip archive. One-line human command run under `!`, documented. Note:
  both machines run Happ VPN always-on — traffic to own VPSes must bypass it via an `ip rule` or SSH
  hangs (global memory `happ-vpn-bypass-for-servers`). Local fallback floor = the ~10–13
  `replay-parser-2` golden inputs via its CLI, if the VPS pull is unavailable.
- **Shared helpers extracted** (principle 9, no duplication): one fixture-loader/unpacker and one
  snapshot-normalizer, reused — never a hand-mirrored schema/DDL copy.
- Produced **through `solidstats-server-ts-tests`** conventions, citing the rules relied on (convention-bound).

### Nice To Have
- Scale the archive to hundreds by pointing the capture script at a larger real corpus (full
  fetcher→parser run / mounted `~/sg_stats`).

### Non Goals
- request/moderation **business-logic workflow** — Phase 2 deliberately rewrites it into guided flows;
  pinning it would create false reds. Only the **role-gate mechanism** is in scope, not request types/payloads.
- **Not** wired into fast `verify` / `test:coverage`; **no coverage obligation** (principle 10).
- **No** fresh-schema/bucket/db per test — the generic brief suggests it, but the repo convention is
  `truncate … cascade`; Step 0 says repo conventions override the generic brief.
- **Not** a parity/value-vs-legacy comparison — that is the cutover diff harness. This pins `server-2`'s
  own **current** behavior (the parsers are intentionally non-identical to legacy; see CUTOVER-MODEL).

## Confirmed Decisions
| Decision | Choice | Rationale | Consequence |
|----------|--------|-----------|-------------|
| Refactor protected | Phase 2 `server-2` Track C convergence (behavior-preserving) | Mass Oxfmt reformat + `tsc`→tsdown are classic silent-runtime-drift sources; contract gate is blind to values | Oracle targets computed values + pipeline behavior |
| Scope | Full ingest→stats chain **+ public read API** assertion | Pins what frozen-contract/oasdiff cannot (values, pipeline) and confirms read surface returns them | Largest fixture/wiring surface; accepted |
| Realism | Real RabbitMQ **and** real MinIO/S3 round-trip via `buildApp()` + real runtime | A mock at a contract boundary hides the exact failures the oracle exists to catch (anti-pattern #1) | Slower, needs an await-seam; fine for a master-only job |
| Fixtures storage | Hundreds of **real** artifacts committed as one **gzip archive**, unpacked at test start | Artifacts are small; self-contained, reproducible, no external gating/skips | Archive lives in git; regenerate via capture script |
| Fixtures source | **Pull real production artifacts from the VPS over SSH** (gated, human-run script); parser-2 golden parse as local fallback | Real production data (principle 4) — the actual objects prod ingested; agent lacks VPS/VPN access | One-time gated capture under `!`; needs Happ VPN bypass for SSH |
| Assertions | Characterization snapshots (normalized) **+** computed bounty anchors on 2–3 cases | Only snapshots scale to hundreds; bounty is business-critical → also checked semantically | Needs a normalization layer + a few hand-computed expectations |
| Determinism | Drive promotion via `IntervalTask.runOnce()`; await completion via **bounded DB-state poll** | No injectable clock/id/pacer; consumer exposes no completion Promise; no real timers/handlers (principle 9) | Poll loop with generous timeout (test may run long) |
| Normalization | Map UUID → stable natural key (checksum / nickname / replay), redact timestamps, sort rows | DB generates `gen_random_uuid()` / `now()` (not injectable) | Keep ordering asserts where ordering is contractual (cursor, timeline) |
| Gate placement | Dedicated script (e.g. `test:golden`) + **master-only pre-deploy** CI job; **not** in `verify`/`test:coverage` | User: "не часть быстрого verify, только в мастере перед деплоем; может идти долго" | Zero coverage obligation; `verify` green without fixtures automatically (principles 8, 10) |
| Cross-app contract | `server-2` `ParserArtifact` == parser-2 `parse-artifact-v3` (traced, matches) | `runtime.ts:94` loads `ParserArtifact`; schema fields align, no version mismatch | Re-validate at capture; pin `parser_contract_version` |
| Conventions | Author through `solidstats-server-ts-tests` (+ shared testing standards) | Convention-bound test work; repo skills override generic brief | Cite rules; match harness/naming/isolation |

## Assumptions
| Assumption | Confidence | Evidence | How To Validate |
|------------|------------|----------|-----------------|
| `server-2` ingests exactly the shape parser-2 emits (`parse-artifact-v3`) | High | Traced: `messages.ts:28`, `parser-artifact.ts:4`, `runtime.ts:94`; schema match | Validate a captured artifact loads + persists in research |
| `replay-parser-2` CLI builds and emits artifacts here | Medium | `crates/parser-cli` with `replay-parser-2` binary present | `cargo run --bin replay-parser-2 -- <input>` dry-run in research |
| The VPS holds hundreds of real `ParserArtifact` objects pullable over SSH | High (user-confirmed) | User: pull artifacts from the VPS over SSH | Confirm exact host/path-or-bucket + creds in research; Happ VPN bypass needed |
| `parser_contract_version` is stable across the behavior-preserving refactor | High | Refactor is toolchain-only, no parser change | Pin the value; document regen if it bumps |
| Master pre-deploy CI provides docker-compose PG/Rabbit/S3 | High | Existing `test:integration` job already needs them | Reuse that job's service setup |

## Backend And Infrastructure Notes
| Topic | Decision/Default | Consequence | Hidden Cost | Breaking Point |
|-------|------------------|-------------|-------------|----------------|
| Message bus | Real RabbitMQ round-trip | Catches serialization/topology/ack regressions | Async flake; needs await-seam | Broker contract change |
| Object store | Real MinIO/S3 read of the artifact | Catches key-layout/serialization regressions | Per-run unique keys + cleanup | S3 key convention change |
| Snapshots | Committed golden, normalized | Scales to hundreds; any drift turns red | Normalization must be exact or it's brittle | Non-deterministic field leaks into snapshot |
| Run placement | Master-only, slow, separate job | No per-PR cost; no coverage obligation | Drift caught later (pre-deploy, not per-PR) | Someone wires it into `verify` by mistake |

## Risks
| Risk | Severity | Why It Matters | Mitigation |
|------|----------|----------------|------------|
| Snapshot brittleness from non-deterministic fields | High | False reds erode trust in the oracle | One audited normalization layer (stable id map, redacted timestamps, sorted rows); determinism re-run check |
| `parser_contract_version` bump regenerates fixtures/snapshots | Medium | Oracle churns on unrelated parser releases | Pin version; document one-line regen command |
| Real-broker async, no completion Promise | Medium | Naive `sleep` is flaky/leaky | Bounded DB-state poll; `runOnce()`; no real timers/handlers (principle 9) |
| Archive size in git (hundreds of gz JSON) | Low-Med | Repo weight | Single compressed archive; revisit git-lfs/out-of-tree only if it grows large |
| VPS access for capture (SSH + Happ VPN bypass) | Medium | Capture hangs/fails without the `ip rule` bypass; agent cannot do it | Human runs the gated script under `!` with the bypass in place; commit the parser-2 golden floor so the oracle is never empty; log captured-vs-skipped (no silent caps) |
| Pinning behavior adjacent to the request rewrite | Medium | Phase 2 rewrites request/moderation → would false-red | Keep request business logic OUT; pin only role-gate + ingest/stats |
| Normalization hides a real id/order regression | Medium | Masks a true bug | Keep ordering assertions where order is contractual (cursor pagination, event timeline) |

## Acceptance Criteria
- The oracle drives the **real** pipeline end-to-end (real PG/Rabbit/S3) for every artifact in the
  archive and asserts: the normalized full-surface snapshot; bounty anchors (2–3 hand-computed);
  the durable-job-before-publish invariant; dedup vs conflict branching; re-deliver terminal-once;
  and the protected-route role gate.
- Runs via a dedicated script (e.g. `pnpm test:golden`) on **master pre-deploy only**; it is **not** in
  `verify` and **not** in `test:coverage`; fast `verify` stays green at 100% coverage, untouched.
- Capture script + one-line human command committed; the gzip archive committed (or script + a note if
  the larger corpus must be captured in a specific environment).
- Snapshots are generated from **current (pre-refactor)** code; re-running on current code is byte-stable
  across runs (determinism proven, principle 6).
- Produced through `solidstats-server-ts-tests`, citing the rules relied on; shared helpers extracted
  (one definition, no duplication).

## Verification Plan
- Generate snapshots on current master → re-run twice → identical (determinism).
- Confirm the coverage gate is untouched (oracle excluded from `test`/`test:coverage`).
- Confirm `verify` is green **without** the archive present (skip-clean path, principle 8).
- Dry-run the capture script over the ~10–13 `replay-parser-2` golden inputs; load one artifact through
  the real consumer to prove the cross-app contract.

## Open Questions
| Priority | Question | Why It Matters | Owner/Status |
|----------|----------|----------------|--------------|
| P1 | Exact VPS host + path/bucket of the real artifacts, credentials, and the Happ VPN bypass for SSH | The gated capture script needs concrete coordinates | Research / spike (user has access) |
| P1 | Archive layout: single `.tar.gz` vs per-artifact `.json.gz`; unpack to tmp vs in-memory | Loader design + git diff noise | Plan |
| P1 | Exact normalization natural keys per table (checksum / nickname+replay / squad tag) | Snapshot stability hinges on it | Research / plan |
| P2 | Conflict-review case has no "real" artifact — accept a small synthetic staging pair for that one invariant? | One documented exception to the real-data rule | Plan |
| P2 | Capture a real `parse.failed` case for the failure-path terminal-state assertion | Cover the failure branch with real data | Plan |

## Question Ledger
| Priority | Question | Answer | Decision Impact |
|----------|----------|--------|-----------------|
| P0 | Scope of the oracle | Full chain + read API | Pins values + pipeline + read surface |
| P1 | Fixtures: real vs synthetic | Real, captured | Capture script + real artifacts |
| P1 | Realism / boundaries | Maximal: real broker + S3 | Real round-trip, await-seam needed |
| P1 | Runtime / gate budget | Master-only pre-deploy, may run long, not in `verify` | Dedicated slow job; no coverage obligation |
| P0 | Where do "hundreds" live / run | Commit a gzip archive, unpack at test time | Self-contained in-tree corpus |
| P1 | Assertion mechanism | Snapshots + bounty anchor | Characterization + semantic anchor |

## Recommended Next GSD Step
- **Primary: `/gsd-quick --full`** (discussion + research + plan-check + verify), as the brief mandates.
  The real call path is already traced (hand the citations above to research); the research phase must
  still **confirm the SSH capture mechanism** (VPS host + path/bucket + Happ VPN bypass → archive →
  unpack) before planning, and the test must be authored through `solidstats-server-ts-tests`.
- Alternative: **`/gsd-spike`** first if the capture mechanism is uncertain (prove: SSH-pull one real
  artifact from the VPS; it round-trips the real consumer; archive unpack + normalization is stable).
- Alternative: **`/gsd-plan-phase`** if this is treated as a phase rather than a quick task (the full
  real-broker/S3 oracle + capture tooling is arguably phase-sized, not quick-sized).
