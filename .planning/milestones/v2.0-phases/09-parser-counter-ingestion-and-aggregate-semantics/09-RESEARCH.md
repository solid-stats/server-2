# Phase 09 Research: Parser Counter Ingestion and Aggregate Semantics

**Researched:** 2026-05-12
**Status:** Ready for planning

## Existing Code Findings

- `src/modules/statistics/parser-artifact.ts` types only `d`, `k`, `kfv`, and `vk` on `PlayerRow`; it does not type `td`, `tk`, `su`, `nkd`, or `ud`.
- `mapParserArtifact` currently emits normalized kill, destroyed-vehicle, and diagnostic events. Compact player counters remain only in the raw snapshot.
- `src/modules/statistics/service/service.ts` derives public deaths from kill/teamkill/unknown kill victim rows through `applyVictimDeath`.
- `src/modules/statistics/repository/repository.ts` loads parser events from `parser_events` and reconstructs only diagnostic, destroyed-vehicle, kill, teamkill, and unknown-kill events.
- `bountyKillInputs` already ignores non-kill event types and `calculateBountyPoints` already excludes teamkills and unknown kills.
- `parser_events.event_type` is unconstrained text, so adding a normalized `player_counter` event does not require a migration.

## Implementation Direction

- Add a normalized `player_counter` event emitted once per parser player with compact counter payload.
- Extend `PlayerRow` to include `td`, `tk`, `su`, `nkd`, and `ud`.
- Keep raw snapshot as full audit source while making counters available through normalized events.
- In aggregate calculation, use `player_counter.payload.deaths_total` and `deaths_by_teamkills` for public death stats when a counter event exists for an entity.
- Preserve legacy fallback from kill victim rows for parser artifacts without counter events to avoid making older or partial fixtures disappear.
- Keep kill rows as the source for kills, teamkills, relationship rows, weapons, vehicle context, and bounty candidates.

## Risks

- Double-counting deaths if both counter events and kill rows are applied to the same player. Mitigation: when a replay has a `player_counter` event for a victim entity, skip kill-row death fallback for that entity.
- Public API shape drift. Mitigation: do not add death breakdown fields to public routes in this phase; preserve `deaths.total` and `deaths.by_teamkills`.
- Bounty drift. Mitigation: keep bounty inputs filtered to kill/teamkill/unknown-kill events only and add tests proving counter events do not create bounty candidates.

## Verification Targets

- Parser artifact mapper tests prove compact counters are typed and emitted.
- Aggregate unit tests prove counter deaths override kill-derived deaths and preserve fallback when counters are absent.
- Bounty/repository tests prove counter events do not award bounty points.
- Docs define backend interpretation and parser escalation criteria.
