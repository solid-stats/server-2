# Phase 11 Context: Rotation and No-SteamID Identity Readiness

**Status:** complete
**Completed:** 2026-05-12
**Mode:** autonomous smart discussion

## Phase Goal

Public stats must not silently drop parsed replay data because replay timestamps do not map to rotations or because historical no-SteamID players cannot be resolved.

## Relevant Requirements

- DATA-07: Server validates that every replay timestamp maps to exactly one rotation or to a documented excluded range.
- DATA-08: Operator can inspect missing-rotation replays after recalculation or readiness checks.
- DATA-09: Rotation readiness reports include enough range and replay-count evidence to support controlled full-run review.
- DATA-10: No-SteamID parser players resolve through nickname history or provisional observed-name identity according to auditable rules.
- DATA-11: Nickname history supports validity-window evidence, conflict detection, and operator import/export where needed for parity preparation.
- DATA-12: Operator can inspect unresolved observed nicknames after recalculation.
- DATA-13: Server documents migration behavior for future replays that start carrying SteamID after no-SteamID historical data has been resolved by name evidence.

## Decisions

- Continue the Phase 10 operator-command pattern instead of adding public API surface. Readiness is an operator/parity gate, not a `web` contract yet.
- Treat rotation readiness as a report over PostgreSQL `replays` and `rotations`: every timestamped replay must map to exactly one rotation unless it appears in a documented excluded range.
- Treat no-SteamID identity readiness as a report over current parser result snapshots plus canonical identity/nickname history.
- Preserve existing recalculation behavior: active nickname history wins, then display-name/provisional observed-name identity applies where no SteamID exists.
- Report ambiguity and blank observed names for operator review; do not silently broaden identity allowlists.

## Assumptions

- Phase 10 full-run coverage already exposes coarse missing-rotation and conservative blank-name identity counts.
- Phase 11 refines those counts into operator-actionable lists and documented rules.
- Historical no-SteamID data can be prepared with nickname history and provisional observed-name identities before a later legacy export/diff phase.
- Future parser artifacts may start carrying SteamID for players previously resolved by name; migration behavior must be documented before full-corpus parity review.

## Risks

- Identity readiness can become broad if it tries to solve every moderation edge case. This phase should report and document readiness rather than replacing the existing request workflow system.
- Rotation exclusions need an explicit data shape. Without committed exclusions, the report should show zero excluded ranges and list missing/overlapping mappings.
- Nickname import/export must avoid bypassing moderation audit for live product changes. For this phase, export/report support and documented import shape are safer than silent mutation.

## Output Shape

Phase 11 should produce:

- A rotation readiness service/repository/command with range evidence, replay counts, missing mappings, and overlap detection.
- An identity readiness service/repository/command with no-SteamID resolution classes, nickname conflicts, and unresolved observed nickname evidence.
- Operator documentation for readiness commands, identity rules, nickname history export/import shape, and future SteamID migration behavior.
- Verification artifacts and requirement traceability updates.
