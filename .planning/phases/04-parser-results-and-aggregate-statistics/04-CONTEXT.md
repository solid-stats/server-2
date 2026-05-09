# Phase 4: Parser Results and Aggregate Statistics - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 persists parser artifacts from Phase 3 result references into server-owned normalized/auditable records and calculates deterministic rotation-aware aggregates: player stats, squad stats, commander-side outcomes, and bounty points. It owns aggregate recalculation after parser completion and approved data patches.

It does not parse OCAP raw replay files, crawl replay sources, implement public stats APIs, build auth/roles, or implement moderation request workflows. Those remain in `replay-parser-2`, `replays-fetcher`, Phase 5, Phase 6, and Phase 7 respectively.

</domain>

<decisions>
## Implementation Decisions

### Parser Artifact Persistence
- **D-01:** Phase 3 stores parser result placeholders and artifact references. Phase 4 should add the server-side path that ingests parser artifact JSON from S3-compatible storage or an injected artifact source and persists the current raw snapshot plus normalized rows needed for audit/recalculation.
- **D-02:** Parser v3 artifacts are compact and table-shaped. `server-2` must treat `/home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-artifact-v3.schema.json` and `parse_artifact_success.v3.json` as the compatibility evidence.
- **D-03:** Preserve parser artifact identity: parser contract version, source checksum, artifact checksum/key when available, replay metadata, parse status, diagnostics, and raw artifact snapshot.
- **D-04:** Do not reconstruct OCAP event semantics that the parser did not emit. If an aggregate input is absent from the compact artifact, model it as unknown/zero only when the domain rule explicitly allows that.

### Normalized Storage and Recalculation
- **D-05:** Use existing `parser_results`, `parser_events`, `player_stats`, `squad_stats`, `commander_side_stats`, and `bounty_points` tables before adding schema. Add migrations only for concrete gaps discovered during planning.
- **D-06:** Recalculation should be deterministic and replay/rotation-scoped first. Avoid ad hoc public-query aggregation paths; Phase 5 should read persisted aggregates.
- **D-07:** Recalculation should be idempotent: rerunning a replay/rotation update replaces derived rows for the affected scope rather than accumulating duplicates.
- **D-08:** Approved moderation patches in Phase 7 must be able to trigger the same recalculation path, so service boundaries should separate artifact normalization from aggregate recalculation.

### Identity and Rotations
- **D-09:** Phase 4 may create or update canonical-player/squad evidence only from parser-observed rows when needed for aggregate keys, but it must not implement broad manual identity merge/split workflows.
- **D-10:** Replay-to-rotation assignment should use existing rotation periods and replay timestamps. Missing rotation should be represented clearly and should not corrupt aggregate tables.
- **D-11:** Player/squad aggregate rows should be keyed by canonical player/squad IDs where available, with observed identity evidence preserved for audit.

### Commander and Bounty Rules
- **D-12:** Commander-side stats must represent known wins, known losses, and unknown legacy outcomes distinctly.
- **D-13:** Bounty points use previous-rotation player effectiveness and previous-rotation squad effectiveness. Teamkills never award bounty points.
- **D-14:** The v1 bounty formula can be hardcoded but must be documented in README or a dedicated phase artifact and covered by tests.
- **D-15:** Deterministic fixtures should cover enemy kill, teamkill, missing previous rotation, unknown commander outcome, and recalculation overwrite cases.

### the agent's Discretion
Exact TypeScript types, repository/service boundaries, fixture shape, SQL upsert strategy, and aggregate JSON payload fields are at the agent's discretion if they preserve parser boundaries, OpenAPI compatibility, deterministic recalculation, and existing schema direction.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Scope and Phase Contract
- `.planning/PROJECT.md` - `server-2` ownership, parser boundary, and product-wide workflow rules.
- `.planning/REQUIREMENTS.md` - Phase 4 requirements `STAT-01` through `STAT-04`, `STAT-06` through `STAT-09`.
- `.planning/ROADMAP.md` - Phase 4 goal, success criteria, and planned slices.
- `.planning/STATE.md` - Current project position and blockers/concerns.
- `.planning/phases/03-ingest-promotion-and-parser-job-lifecycle/03-VERIFICATION.md` - Verified Phase 3 parser result reference state and lifecycle APIs.

### Existing Code
- `src/modules/ingest/repository.ts` - Parser result placeholder and parse job lifecycle persistence.
- `src/infra/db/migrations/0001_v1_domain_schema.sql` - Existing parser result, event, aggregate, rotation, identity, and bounty tables.
- `src/infra/db/migrations/0002_ingest_processing_status.sql` - Phase 3 ingest claim enum update.
- `src/test/integration/ingest-repository.test.ts` - Integration test style for DB-backed lifecycle repositories.

### Parser Contract
- `/home/afgan0r/Projects/SolidGames/replay-parser-2/schemas/parse-artifact-v3.schema.json` - Parser artifact schema.
- `/home/afgan0r/Projects/SolidGames/replay-parser-2/crates/parser-contract/examples/parse_artifact_success.v3.json` - Success artifact example.
- `/home/afgan0r/Projects/SolidGames/replay-parser-2/.planning/PROJECT.md` - Parser output ownership and compact artifact decisions.
- `/home/afgan0r/Projects/SolidGames/replay-parser-2/.planning/STATE.md` - Accepted v1 parser caveats and worker/artifact behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PgIngestRepository.recordParserCompleted` inserts current parser result placeholders and supersedes old current results.
- The schema already includes `parser_events`, aggregate tables, rotations, canonical players, squads, memberships, and bounty points.
- Route/OpenAPI work is not the main Phase 4 surface; Phase 5 will expose public aggregate APIs.
- Integration tests can use Docker Compose PostgreSQL and direct `pg` fixtures.

### Established Patterns
- Use explicit SQL repositories with parameterized queries.
- Keep route schemas TypeBox/OpenAPI-backed when adding API surfaces.
- Keep Phase implementation covered by Vitest and V8 100% coverage gates.
- README and planning docs must stay current after phase scope/commands/architecture changes.

</code_context>

<specifics>
## Specific Ideas

- Add a parser artifact fixture derived from the parser v3 example but minimized to cover player kills, teamkills, squads, commander side facts, and diagnostics.
- Persist normalized events as server-side rows in `parser_events` using stable event types such as `kill`, `teamkill`, `destroyed_vehicle`, and `diagnostic`.
- Store aggregate payloads in existing JSONB `stats`/`inputs` columns until a concrete query requirement justifies typed columns.
- Keep bounty formula small, deterministic, and documented before public API work.

</specifics>

<deferred>
## Deferred Ideas

- Public stats endpoints belong to Phase 5.
- Steam auth, roles, and route authorization belong to Phase 6.
- Player-submitted corrections, merge/split workflows, and manual legacy winner fixes belong to Phase 7.
- Failed job retry/reparse hardening and production operations belong to Phase 8.

</deferred>

---

*Phase: 4-Parser Results and Aggregate Statistics*
*Context gathered: 2026-05-09*
