# replay-parser-2 - GSD New Project Brief

**Created:** 2026-04-24  
**Intended command:** `$gsd-new-project --auto @gsd-briefs/replay-parser-2.md`
**Application:** `replay-parser-2`

This document initializes the Rust replay parsing application only. It is one part of the Solid Stats product alongside `replays-fetcher`, `server-2`, and `web`.

## Product Context

Solid Stats is a public SolidGames statistics platform that replaces the current replay-parser/statistics workflow. The product needs fast, trustworthy replay parsing, public player/squad/rotation/commander-side statistics, player-submitted correction requests, and bounty points based on player and squad effectiveness.

`replay-parser-2` owns the parsing engine and parsing result contract. It does not own replay discovery/fetching, the public website, Steam OAuth, moderation UI, request workflow, or main PostgreSQL schema. Those belong to `replays-fetcher`, `server-2`, and `web`.

## Product-Wide GSD Workflow

Development across `replays-fetcher`, `replay-parser-2`, `server-2`, and `web` uses AI agents plus GSD workflow only.

The following standards apply product-wide:

- Keep README and planning docs current when scope, commands, architecture, validation data, or workflow changes.
- End completed work with a clean git tree by committing intended results; do not delete completed work just to make status clean.
- Push back on requests that conflict with architecture, current logic, quality, maintainability, or proportional scope; explain the risk and propose safer alternatives.
- Check cross-application compatibility before execution.

Compatibility checks are risk-based:

- Local-only changes can rely on local planning docs, AGENTS rules, and these `gsd-briefs`.
- Parser contract, raw replay object key/checksum assumptions, RabbitMQ/S3 message, artifact shape, API/data model, canonical identity, auth, moderation, or UI-visible behavior changes require checking adjacent app docs/repos when available.
- If evidence is missing or contradictory, ask the user before proceeding.

## Core Value

Parse OCAP JSON replays quickly and deterministically into normalized raw events plus aggregate outputs that `server-2` can persist, audit, compare against golden data, and use for public statistics.

## Existing Reference Data

- Current reference data lives at `~/sg_stats`.
- `~/sg_stats/raw_replays` contains 23,473 raw replay JSON files in the current full-history corpus.
- `~/sg_stats/lists/replaysList.json` contains 23,456 replay-list rows prepared at `2026-04-25T04:42:54.889Z`.
- `~/sg_stats/results` contains 88,485 existing calculated result files.
- `~/sg_stats/year_results` contains 14 legacy annual nomination output files and is a v2 reference, not ordinary v1 stats.
- The archive is for tests/golden validation only, not production import.
- Example weekly result fields seen in existing data: `kills`, `killsFromVehicle`, `vehicleKills`, `teamkills`, `deaths`, `kdRatio`, `killsFromVehicleCoef`, `score`, `totalPlayedGames`, `week`, `startDate`, `endDate`.
- Example OCAP top-level keys: `EditorMarkers`, `Markers`, `captureDelay`, `endFrame`, `entities`, `events`, `missionAuthor`, `missionName`, `playersCount`, `worldName`.

## v1 Scope

### Must-Haves

- Rust parser for OCAP JSON only.
- CLI that can parse a local OCAP JSON file and write normalized result JSON.
- Worker/container mode that can be used by `server-2` through RabbitMQ/S3 integration.
- Successful worker parse artifacts stored in S3 and reported by artifact reference.
- Deterministic normalized event output.
- Aggregate output for stats that exist today and new stats needed by Solid Stats.
- Golden tests using `~/sg_stats`.
- Benchmark harness comparing old/current results against new parser behavior.
- Target performance: around 10x faster than the current parser, measured through a baseline benchmark.
- Structured parse errors tied to replay file/job identifiers.
- Output schema versioning at the contract level, even though v1 may overwrite derived server results.

### Out of Scope

- Public website and UI.
- Replay discovery and production fetching from the external replay source.
- Steam OAuth.
- User roles, moderation, and request workflow.
- PostgreSQL persistence as the primary source of truth.
- Direct editing/correction of stats.
- Supporting replay formats other than OCAP JSON.
- Production Kubernetes deployment.
- Financial rewards or payout logic.
- Annual/yearly nomination statistics. Legacy `src/!yearStatistics` and `~/sg_stats/year_results` are historical references only in v1; product support is deferred to v2.

## Parsing Responsibilities

`replay-parser-2` should extract enough data for:

- Player stats.
- Squad stats.
- Rotation stats.
- Commander-side stats where data is present.
- Winner information where newer replay data contains it.
- Bounty point calculation inputs.
- Raw/normalized event audit.
- Future recalculation after moderated corrections.

## Identity Constraints

The parser must not assume nickname equals real player identity.

Solid Stats uses a canonical player model in `server-2`:

- One canonical player can have many nicknames.
- One canonical player can have many SteamIDs.
- Old replay data may have no SteamID.
- Future replay data may include SteamID.
- A real player may use multiple accounts.

Parser output should preserve observed identifiers from the replay, such as nickname, side/faction/squad fields, and SteamID when available. Canonical matching belongs to `server-2`.

## Commander-Side Statistics

In this domain, "KS" means commander of a side.

Parser should detect and output commander-side data when present in replay data:

- Replay identifier.
- Side identifier/name.
- Commander observed identity fields.
- Winner/outcome if present.
- Source/confidence metadata if available.

Older data may not contain winner information. Unknown winner must be representable in the output.

## Bounty Inputs

Bounty points are calculated by `server-2`, but parser output must support the inputs.

For each valid kill event, output enough data to determine:

- Killer observed identity.
- Victim observed identity.
- Whether it is an enemy kill.
- Whether it is a teamkill.
- Kill timestamp/frame.
- Relevant vehicle/infantry context if available.
- Replay and side context.

Only valid enemy kills award bounty points in v1. Teamkills do not award bounty points.

## Integration Contract with server-2

Recommended message flow:

1. `replays-fetcher` discovers replay files from the external source, writes raw replay objects under S3 `raw/`, and records source/checksum/object evidence in staging rows.
2. `server-2` promotes staging rows into canonical `replays` and durable `parse_jobs`.
3. `server-2` publishes a RabbitMQ parse request containing:
   - `job_id`
   - `replay_id`
   - `object_key`
   - `checksum`
   - `parser_contract_version`
4. `replay-parser-2` worker downloads the file from S3-compatible storage and verifies checksum.
5. Parser emits either:
   - `parse.completed` with normalized parse artifact reference after writing the artifact under S3 `artifacts/`.
   - `parse.failed` with structured error data.
6. `server-2` owns persistence into PostgreSQL and aggregate publication.

Parser should not directly mutate `server-2` business tables in v1. This keeps the app independently testable and makes the contract explicit.
Parser should not crawl the external replay source or write ingestion staging rows. That belongs to `replays-fetcher`.

Because `web` consumes generated API types from the `server-2` OpenAPI schema through `openapi-typescript`, parser output contract changes that affect API payloads must be coordinated with `server-2` schema changes before `web` consumes new fields.

## Suggested Requirements

### Parser Core

- **PARS-01**: Parser reads OCAP JSON files matching `~/sg_stats/raw_replays`.
- **PARS-02**: Parser extracts replay metadata: mission, world, author, player count, frame/time boundaries.
- **PARS-03**: Parser extracts normalized player/entity observations.
- **PARS-04**: Parser extracts normalized kill/death/teamkill events.
- **PARS-05**: Parser extracts vehicle kill context where present.
- **PARS-06**: Parser extracts commander-side and winner data where present.
- **PARS-07**: Parser represents missing winner/SteamID as explicit unknown/null states.

### Output Contract

- **OUT-01**: CLI writes a stable JSON output contract.
- **OUT-02**: Output includes raw/normalized events and aggregate summaries.
- **OUT-03**: Output includes parser contract version.
- **OUT-04**: Output includes enough source references to trace aggregates back to events.
- **OUT-05**: Parser contract changes that affect `server-2` API payloads include a cross-project compatibility note for the OpenAPI schema and `web` generated types.

### Worker Integration

- **WORK-01**: Worker consumes parse request jobs from RabbitMQ.
- **WORK-02**: Worker reads replay files from S3-compatible storage.
- **WORK-03**: Worker writes successful parse artifacts to S3 and publishes completed/failed result messages.
- **WORK-04**: Worker can run multiple instances in parallel.
- **WORK-05**: Worker has structured logs and health/readiness endpoints or probes.

### Validation

- **TEST-01**: Golden replay fixtures are derived from `~/sg_stats`.
- **TEST-02**: Existing result comparisons cover comparable fields.
- **TEST-03**: Benchmark harness reports parse throughput and old-vs-new speed.
- **TEST-04**: Parser handles malformed/partial replay files with structured failures.

## Suggested GSD Initialization Settings

- Granularity: Standard.
- Execution: Parallel where possible.
- Git tracking: Yes.
- Research: Yes.
- Plan Check: Yes.
- Verifier: Yes.
- Model profile: Balanced or Quality.

## Key Decisions

| Decision | Outcome |
|----------|---------|
| Language | Rust |
| Replay format | OCAP JSON only |
| Validation source | `~/sg_stats` as golden/test baseline |
| Performance goal | Around 10x faster than current parser |
| Runtime modes | CLI plus worker/container mode |
| Queue integration | RabbitMQ |
| File input | S3-compatible storage object |
| Replay discovery | `replays-fetcher`, not parser |
| Worker result delivery | S3 artifact reference |
| DB ownership | `server-2`, not parser |
| Reprocessing history | Server may overwrite derived results in v1 |

## Follow-Up Details for Implementation Phases

- Exact old parser command used for baseline benchmark.
- Exact old/new comparison tolerances.
- Final normalized JSON schema names and field types.
- Exact way parser contract changes flow into the `server-2` OpenAPI schema and `web` `openapi-typescript` generation.
- Exact deterministic parser artifact key format under S3 `artifacts/`.
- Exact RabbitMQ exchange/routing key naming.
