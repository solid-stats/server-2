# Requirements: server-2

**Defined:** 2026-05-12
**Core Value:** Provide a reliable backend source of truth that turns parsed replay data into public statistics, supports corrections through audited moderation, and keeps parsing, storage, and jobs observable and recoverable.

## v2.0 Requirements

Requirements for Backend Parity and Full-Run Readiness. Each requirement maps to one roadmap phase.

### Parser Counter Semantics

- [x] **STAT-10**: Server preserves parser compact player counters `d`, `td`, `tk`, `su`, `nkd`, `ud`, `vk`, and `kfv` when ingesting parser artifacts.
- [x] **STAT-11**: Server preserves `players[].kills[]` evidence for kill relationships, weapon context, vehicle context, and bounty eligibility.
- [x] **STAT-12**: Server aggregate calculation uses parser death counters as replay-level death evidence instead of deriving all deaths from attacker kill rows.
- [x] **STAT-13**: Server tests cover enemy death, teamkill death, suicide, null-killer death, unknown death, vehicle kill, kills-from-vehicle, and kill relationship rows.
- [x] **STAT-14**: Server bounty calculation remains strict so teamkills and non-enemy kills do not award bounty points.
- [x] **STAT-15**: Server documents the backend-facing interpretation of compact counters and kill rows for future parser contract review.

### Full-Run Recalculation Evidence

- [x] **OPS-07**: Operator can run an idempotent recalculation/backfill command for all current parser results.
- [x] **OPS-08**: Recalculation output reports parser result count, recalculated count, skipped count, missing rotation count, missing timestamp count, missing identity count, changed aggregate rows, and failures.
- [x] **OPS-09**: Operator can distinguish staged, promoted, parsed, parser-result-current, recalculated, skipped, and stale states without ad hoc SQL.
- [x] **OPS-10**: Recalculation skips and failures include replay identifiers, reason codes, and enough context to retry or fix inputs.
- [x] **OPS-11**: Recalculation/report commands produce deterministic output for a small sample, the existing partial staging corpus, and a later full corpus.
- [x] **OPS-12**: Operator-readable full-run status is exposed or documented in a supported surface outside one-off database queries.
- [ ] **OPS-13**: App CI prevents reintroducing staging SSH, `kubectl`, Kubernetes Secret mutation, or rollout orchestration into `server-2` workflows.

### Rotation and Identity Readiness

- [ ] **DATA-07**: Server validates that every replay timestamp maps to exactly one rotation or to a documented excluded range.
- [ ] **DATA-08**: Operator can inspect missing-rotation replays after recalculation or readiness checks.
- [ ] **DATA-09**: Rotation readiness reports include enough range and replay-count evidence to support controlled full-run review.
- [ ] **DATA-10**: No-SteamID parser players resolve through nickname history or provisional observed-name identity according to auditable rules.
- [ ] **DATA-11**: Nickname history supports validity-window evidence, conflict detection, and operator import/export where needed for parity preparation.
- [ ] **DATA-12**: Operator can inspect unresolved observed nicknames after recalculation.
- [ ] **DATA-13**: Server documents migration behavior for future replays that start carrying SteamID after no-SteamID historical data has been resolved by name evidence.

### Legacy Public Export Contract

- [ ] **PUB-07**: Operator can export deterministic player global statistics from `server-2` for legacy comparison.
- [ ] **PUB-08**: Operator can export deterministic squad statistics from `server-2` for legacy comparison.
- [ ] **PUB-09**: Operator can export deterministic rotation-scoped statistics from `server-2` for legacy comparison.
- [ ] **PUB-10**: Operator can export legacy detail surfaces needed by downstream planning, including `other_players`, `weapons`, and `weeks`.
- [ ] **PUB-11**: Exported fields include kills, kills from vehicle, vehicle kills, teamkills, deaths, KD, score, total played games, relationships, weapons, weekly buckets, and visible player/squad identity.
- [ ] **PUB-12**: Export output includes deterministic metadata that identifies source database, command version, input corpus scope, generated time, and relevant contract version.
- [ ] **PUB-13**: Export normalizes parser-level non-public differences when needed to preserve public legacy parity.
- [ ] **API-05**: Any public API or OpenAPI shape change needed for parity reporting or future `web` consumption updates the committed OpenAPI artifact and compatibility documentation in the same change.

### Diff Harness Contract

- [ ] **DIFF-01**: Server defines the new-stat export shape consumed by the old-vs-new diff tool.
- [ ] **DIFF-02**: Server defines strict parity failures for missing players, missing matches, changed public aggregate totals, parser/export failures, and unexplained differences.
- [ ] **DIFF-03**: Server defines the known-difference policy with only documented `deaths.byTeamkills` duplicate-slot/respawn cases allowed by default.
- [ ] **DIFF-04**: Diff output includes old/new input metadata, snapshot metadata, summary counts, strict failures, known teamkill-death differences, and `review_required`.
- [ ] **DIFF-05**: Diff harness contract supports small sample, existing partial staging corpus, and final full-corpus comparisons.
- [ ] **DIFF-06**: Broadening the allowlist beyond documented teamkill-death public differences requires an explicit human decision captured in planning docs.

## Future Requirements

Deferred to later milestones or adjacent applications.

### Adjacent Applications

- **FETCH-01**: `replays-fetcher` provides resumable full-corpus ingest with progress events and compact evidence.
- **INFRA-01**: `infrastructure` runs the controlled full corpus and stores full-run evidence.
- **INFRA-02**: `infrastructure` captures the legacy `sg_stats` snapshot over operator-provided SSH/SCP access without mutating legacy server state.
- **WEB-01**: `web` builds public stats UI after backend parity evidence and API/export contracts stabilize.
- **PARSER-01**: `replay-parser-2` updates parser contract docs, examples, or schema only if `server-2` proves existing compact counter evidence is insufficient.

### Historical Statistics

- **HIST-01**: Product supports annual/yearly nomination statistics.
- **HIST-02**: Product imports full historical data from `~/sg_stats` into production.

### Parser History

- **PARSE-01**: Product preserves versioned parse result history across parser contract changes.

### Deployment

- **DEPLOY-01**: Production deployment runs on Kubernetes with horizontal worker scaling.

## Out of Scope

Explicitly excluded from this milestone. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Web UI implementation | Owned by the later `web` milestone after backend parity and API stability. |
| Replay source crawling or resumable full-corpus ingest implementation | Owned by `replays-fetcher`; `server-2` consumes staging evidence and owns canonical state. |
| Controlled runtime orchestration, image pinning, and evidence storage | Owned by `infrastructure`; `server-2` provides commands, reports, and exports. |
| Rust parser behavior changes | Owned by `replay-parser-2` and only triggered by a concrete backend contract blocker. |
| Production traffic cutover approval | A diff result is review evidence, not automatic cutover approval. |
| Broad parity allowlists | Only documented `deaths.byTeamkills` duplicate-slot/respawn differences are accepted by default. |
| Turning legacy export into the only long-term API shape | The export exists for parity; product APIs remain the long-term `web` contract. |
| Committing SSH hosts, private key paths, or secret values | Legacy snapshot access is operator-provided runtime context, not committed planning data. |
| Annual/yearly nomination statistics | Still deferred; this milestone proves core public-stat parity first. |
| Full historical production import from `~/sg_stats` | Historical data remains reference/evidence input until a dedicated import milestone. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STAT-10 | Phase 09 | Complete |
| STAT-11 | Phase 09 | Complete |
| STAT-12 | Phase 09 | Complete |
| STAT-13 | Phase 09 | Complete |
| STAT-14 | Phase 09 | Complete |
| STAT-15 | Phase 09 | Complete |
| OPS-07 | Phase 10 | Complete |
| OPS-08 | Phase 10 | Complete |
| OPS-09 | Phase 10 | Complete |
| OPS-10 | Phase 10 | Complete |
| OPS-11 | Phase 10 | Complete |
| OPS-12 | Phase 10 | Complete |
| OPS-13 | Phase 13 | Pending |
| DATA-07 | Phase 11 | Pending |
| DATA-08 | Phase 11 | Pending |
| DATA-09 | Phase 11 | Pending |
| DATA-10 | Phase 11 | Pending |
| DATA-11 | Phase 11 | Pending |
| DATA-12 | Phase 11 | Pending |
| DATA-13 | Phase 11 | Pending |
| PUB-07 | Phase 12 | Pending |
| PUB-08 | Phase 12 | Pending |
| PUB-09 | Phase 12 | Pending |
| PUB-10 | Phase 12 | Pending |
| PUB-11 | Phase 12 | Pending |
| PUB-12 | Phase 12 | Pending |
| PUB-13 | Phase 12 | Pending |
| API-05 | Phase 12 | Pending |
| DIFF-01 | Phase 13 | Pending |
| DIFF-02 | Phase 13 | Pending |
| DIFF-03 | Phase 13 | Pending |
| DIFF-04 | Phase 13 | Pending |
| DIFF-05 | Phase 13 | Pending |
| DIFF-06 | Phase 13 | Pending |

**Coverage:**
- v2.0 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-05-12*
*Last updated: 2026-05-12 after Phase 10 completion*
