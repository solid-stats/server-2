# Phase 09: Parser Counter Ingestion and Aggregate Semantics - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Mode:** Autonomous smart discuss, defaults accepted by operator instruction

<domain>
## Phase Boundary

This phase updates backend parser-artifact mapping and aggregate semantics so `server-2` consumes parser compact player counters as replay-level public-stat evidence. It preserves kill-row evidence for relationships, weapon/vehicle context, and bounty eligibility. It does not change Rust parser behavior, full-run reporting, rotation readiness, legacy export, or diff harness behavior; those belong to later v2.0 phases.

</domain>

<decisions>
## Implementation Decisions

### Counter Preservation
- Extend parser artifact TypeScript types for compact player counters `d`, `td`, `tk`, `su`, `nkd`, `ud`, `vk`, and `kfv`.
- Preserve compact counter evidence in normalized parser events so recalculation can use typed data without parsing the raw snapshot ad hoc.
- Keep the raw parser artifact snapshot as the complete audit source; avoid adding a dedicated DB table in this phase unless existing storage proves insufficient.
- Preserve `players[].kills[]` rows as first-class evidence for relationships, weapons, vehicle context, and bounty candidates.

### Death Semantics
- Use compact counters as authoritative replay-level public death evidence: `d` is total deaths, `td` is teamkill deaths, and `su`, `nkd`, and `ud` are preserved as breakdown evidence.
- Do not derive public death totals solely from attacker kill rows; kill rows may be incomplete for deaths without attacker-side relationship evidence.
- Keep kill rows authoritative for attacker kills, teamkills, victim relationships, weapon attribution, vehicle context, and legacy detail surfaces.
- Preserve unknown/null/suicide death evidence without converting those rows into enemy kills or bounty-eligible events.

### Bounty Boundary
- Bounty candidate generation remains based on enemy `kills[]` rows.
- Teamkills, unknown kills, suicide deaths, null-killer deaths, and unknown deaths do not award bounty points.
- Compact counters may affect previous-rotation death denominators after aggregate recalculation, but they do not create bounty kill events by themselves.
- Keep bounty tests focused on strict exclusion behavior and relationship-row preservation.

### Contract Documentation and Tests
- Add focused tests at parser artifact mapper, aggregate calculation, and bounty boundaries.
- Document the backend-facing interpretation of compact counters and kill rows.
- Document parser-contract escalation criteria: only request `replay-parser-2` changes if a required compact counter is missing, ambiguous, or not schema-documented.
- Keep OpenAPI unchanged unless code changes expose a new API surface; this phase is internal semantics and docs.

### the agent's Discretion
Implementation details such as helper names, event payload shape, and small refactors are at the agent's discretion, provided existing repository patterns, strict TypeScript, and current public API compatibility are preserved.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/modules/statistics/parser-artifact.ts` maps parser artifacts into normalized `parser_events`.
- `src/modules/statistics/service/service.ts` calculates player and squad aggregates from `AggregateReplayInput`.
- `src/modules/statistics/repository/repository.ts` loads raw parser snapshots, normalized events, identity evidence, squad memberships, and previous bounty stats.
- `src/modules/statistics/bounty/bounty.ts` already excludes non-enemy kills and teamkills from bounty points.
- `docs/bounty-formula.md` documents current bounty behavior.

### Established Patterns
- Parser artifacts are persisted as raw snapshots plus normalized event rows.
- Aggregates are pure functions with focused Vitest coverage before PostgreSQL repository tests.
- Existing death stats expose `total` and `by_teamkills`; additional breakdown evidence should be additive and compatible with current public shapes unless later phases expand exports.
- Repository code prefers explicit SQL and transaction-scoped recalculation.

### Integration Points
- Parser artifact type and mapper changes start in `src/modules/statistics/parser-artifact.ts`.
- Aggregate semantic changes start in `src/modules/statistics/service/service.ts`.
- Repository input loading may need to pass compact counter events to aggregate calculation.
- Tests should extend `src/modules/statistics/parser-artifact.test.ts`, `src/modules/statistics/service/tests/aggregates.test.ts`, and bounty tests where needed.
- Documentation should live in a backend docs file close to current operations/formula docs.

</code_context>

<specifics>
## Specific Ideas

- Prefer preserving compact counters as a normalized event type over adding a new table in this phase.
- Treat `players[].d` as the authoritative total death count for a resolved player in a replay.
- Treat `players[].td` as authoritative public `deaths.by_teamkills`.
- Preserve `su`, `nkd`, and `ud` in event payloads for later legacy export/diff phases.
- Keep `kills[]` rows as the only source for bounty candidate events.

</specifics>

<deferred>
## Deferred Ideas

- Full-run recalculation commands and status reports are Phase 10.
- Rotation and no-SteamID readiness reports are Phase 11.
- Legacy public export shape and API/OpenAPI changes are Phase 12.
- Diff harness and known-difference policy implementation are Phase 13.
- Parser contract changes in `replay-parser-2` require a concrete blocker found by backend implementation.

</deferred>
