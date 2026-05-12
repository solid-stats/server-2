# Phase 10 Context: Full-Run Recalculation and Coverage Report

**Status:** complete
**Completed:** 2026-05-12
**Mode:** autonomous smart discussion

## Phase Goal

An operator can prove what parser results were recalculated and what was skipped, stale, or failed without relying on one-off SQL.

## Relevant Requirements

- OPS-07: Operator can run an idempotent recalculation/backfill command for all current parser results.
- OPS-08: Recalculation output reports parser result count, recalculated count, skipped count, missing rotation count, missing timestamp count, missing identity count, changed aggregate rows, and failures.
- OPS-09: Operator can distinguish staged, promoted, parsed, parser-result-current, recalculated, skipped, and stale states without ad hoc SQL.
- OPS-10: Recalculation skips and failures include replay identifiers, reason codes, and enough context to retry or fix inputs.
- OPS-11: Recalculation/report commands produce deterministic output for a small sample, the existing partial staging corpus, and a later full corpus.
- OPS-12: Operator-readable full-run status is exposed or documented in a supported surface outside one-off database queries.

## Decisions

- Use a supported Node/TypeScript CLI command as the Phase 10 operator surface. This avoids adding API/OpenAPI shape before the parity output contract stabilizes in Phase 12.
- Reuse existing repository recalculation methods for player/squad, commander-side, and bounty aggregates so full-run behavior stays identical to per-result recalculation.
- Treat compact parser event persistence as already handled by parser completion and audit patch flows. Phase 10 recalculates from current persisted parser results and events.
- Report identity gaps conservatively as current parser results containing parser players with blank observed names, because Phase 11 owns deeper no-SteamID identity readiness rules.
- Keep runtime orchestration, SSH, Kubernetes, and legacy snapshot capture out of this repo; the command reads PostgreSQL only through supported app configuration.

## Assumptions

- Current parser results are the recalculation input set for Phase 10.
- Recalculation remains idempotent because aggregate tables are replaced per rotation by existing repository methods.
- Repeating rotation recalculation for multiple parser results in the same rotation is acceptable for Phase 10 correctness; later optimization can group by rotation if full-corpus runtime proves it necessary.
- Command output is JSON so it can be archived by the infrastructure/full-run operator without this app repo owning artifact storage.

## Risks

- Missing-identity detection is intentionally conservative until Phase 11 formalizes nickname/provisional identity readiness.
- Full-corpus runtime may reveal that per-result rotation recalculation is slow; Phase 10 prioritizes correctness, determinism, and evidence before performance optimization.
- Existing aggregate freshness is inferred from aggregate `calculated_at` timestamps and current parser result creation time, not from a dedicated recalculation ledger.

## Output Shape

Phase 10 should produce:

- A recalculation service with deterministic summaries and per-parser-result evidence.
- A PostgreSQL-backed full-run read model for current parser result targets and lifecycle counts.
- A CLI command/script for recalculation plus dry-run coverage reporting.
- Tests covering summary counts, skips, failures, lifecycle counts, and command behavior.
- Operator docs and README/package script updates.
