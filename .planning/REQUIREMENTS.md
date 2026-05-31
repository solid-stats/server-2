# Requirements: server-2 — v3.0 Public API v1

**Defined:** 2026-05-31
**Core Value:** Provide a reliable backend source of truth that turns parsed replay data into public statistics — now exposed as a complete, frozen public API contract the `web` frontend can build against.

## v1 Requirements

Requirements for this milestone. Each maps to a roadmap phase.

### Pagination & Sort (PAGE)

- [ ] **PAGE-01**: API consumer can page any list endpoint with an opaque cursor instead of page numbers.
- [ ] **PAGE-02**: API consumer can sort list endpoints by supported fields server-side, with deterministic, stable ordering (unique tie-breaker on every sort tuple).
- [ ] **PAGE-03**: Existing list endpoints (players, squads, bounty, leaderboards) are migrated to the cursor+sort contract before the freeze.

### SteamID Protection (SEC)

- [ ] **SEC-01**: The public API never returns full SteamIDs in any response — profiles, search, lists, errors, or logs.
- [ ] **SEC-02**: Where SteamID identity is surfaced at all, only a masked form (or omission) is exposed; the masking format is decided in planning.

### Profile Parity Stats (PARITY)

- [ ] **PARITY-01**: Public API exposes per-player weapon statistics on the player profile, with values matching the legacy-export formulas.
- [ ] **PARITY-02**: Public API exposes per-player vehicle statistics.
- [ ] **PARITY-03**: Public API exposes player-vs-player relationship stats (killed, killers, teamkilled, teamkillers).
- [ ] **PARITY-04**: Public API exposes weekly stat buckets for a player.
- [ ] **PARITY-05**: Public API exposes KD ratio, score, and total games on player profiles.
- [ ] **PARITY-06**: Public API exposes the equivalent parity surfaces on squad profiles.

### Replay Surface (REPLAY)

- [ ] **REPLAY-01**: API consumer can list replays with filters (rotation, date, map) and cursor pagination.
- [ ] **REPLAY-02**: API consumer can fetch replay detail (map, rotation, date, per-side summary, participants, provenance).
- [ ] **REPLAY-03**: API consumer can fetch a replay's event timeline, paginated.
- [ ] **REPLAY-04**: A sitemap enumerating all replay IDs is available for SEO indexing.

### History, Provenance & Winner Fix (HIST)

- [ ] **HIST-01**: Public API exposes a player's nickname/alias history with timestamps.
- [ ] **HIST-02**: Public API exposes player and squad membership history with dates.
- [ ] **HIST-03**: Public stat responses carry provenance / last-updated metadata.
- [ ] **HIST-04**: A moderator can set the commander-side winner for legacy-unknown games via the API (expose/verify the existing `legacy_winner_fix` workflow).

### API Ergonomics & Admin (API)

- [ ] **API-01**: Player, squad, and rotation resources are resolvable by slug, not only UUID.
- [ ] **API-02**: Bounty and leaderboard responses include the formula component breakdown (victim effectiveness, squad effectiveness, rotation context).
- [ ] **API-03**: Commander-side stats expose explicit unknown outcomes and are filterable by rotation and side.
- [ ] **API-04**: An admin can create, update, and delete rotations via the API.

### Contract Freeze (FREEZE)

- [ ] **FREEZE-01**: The OpenAPI contract version is bumped from `0.1.0` to a stable `1.0.0` tag.
- [ ] **FREEZE-02**: A published OpenAPI artifact path is available for `web`'s `openapi-typescript` generation.
- [ ] **FREEZE-03**: CI classifies OpenAPI diffs against the committed baseline: additive/backward-compatible changes pass freely (minor bump), while breaking changes fail unless the same change intentionally bumps the major version and updates the baseline snapshot. This governs contract evolution via semver — it does not make the contract immutable.
- [ ] **FREEZE-04**: PostgreSQL integration tests run in CI as a freeze gate.

## Future Requirements

Deferred. Tracked but not in this roadmap.

### Realtime

- **RT-01**: SSE freshness stream so the UI can update without manual refresh.

### Request Model (separate hybrid milestone)

- **REQ-01**: Rework the player-correction request model into the brief's guided flows (add/remove kills, add/remove teamkills, remove-player, commander dispute).
- **REQ-02**: Request drafts with autosave and 7-day TTL; reopen of rejected requests.

### Historical Statistics

- **YEAR-01**: Annual/yearly nomination statistics.

### Optional Ergonomics

- **PAGE-04**: Total-count endpoints for page-number UIs (only if `web` needs counts rather than load-more).

## Out of Scope

| Feature | Reason |
|---------|--------|
| `web` UI implementation | Owned by the `web` application. |
| Player-request correction-flow model rework | Separate hybrid request-model milestone; contract must not be frozen on it now. |
| `replay-parser-2` / Rust parsing changes | Parser is done and user-verified. |
| New statistics aggregation/computation | Underlying data already computed in v1.0/v2.0; this milestone only exposes it. |
| SSE / realtime | Deferred past v1 (static + manual refresh first). |
| Production traffic cutover approval | Out of this milestone; parity is review evidence, not auto-cutover. |

## Traceability

Mapped during roadmap creation (Phases 14-19).

| Requirement | Phase | Status |
|-------------|-------|--------|
| PAGE-01 | Phase 14 | Pending |
| PAGE-02 | Phase 14 | Pending |
| PAGE-03 | Phase 14 | Pending |
| SEC-01 | Phase 14 | Pending |
| SEC-02 | Phase 14 | Pending |
| PARITY-01 | Phase 15 | Pending |
| PARITY-02 | Phase 15 | Pending |
| PARITY-03 | Phase 15 | Pending |
| PARITY-04 | Phase 15 | Pending |
| PARITY-05 | Phase 15 | Pending |
| PARITY-06 | Phase 15 | Pending |
| API-01 | Phase 16 | Pending |
| HIST-01 | Phase 16 | Pending |
| HIST-02 | Phase 16 | Pending |
| HIST-03 | Phase 16 | Pending |
| REPLAY-01 | Phase 17 | Pending |
| REPLAY-02 | Phase 17 | Pending |
| REPLAY-03 | Phase 17 | Pending |
| REPLAY-04 | Phase 17 | Pending |
| API-02 | Phase 18 | Pending |
| API-03 | Phase 18 | Pending |
| API-04 | Phase 18 | Pending |
| HIST-04 | Phase 18 | Pending |
| FREEZE-01 | Phase 19 | Pending |
| FREEZE-02 | Phase 19 | Pending |
| FREEZE-03 | Phase 19 | Pending |
| FREEZE-04 | Phase 19 | Pending |

**Coverage:**
- v1 requirements: 27 total (PAGE 3, SEC 2, PARITY 6, REPLAY 4, HIST 4, API 4, FREEZE 4)
- Mapped to phases: 27 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-31*
*Last updated: 2026-05-31 after roadmap creation (Phases 14-19 mapped)*
