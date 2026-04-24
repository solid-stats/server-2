# replays-parser-2 - GSD New Project Brief

**Created:** 2026-04-24  
**Intended command:** `$gsd-new-project --auto @gsd-briefs/replays-parser-2.md`  
**Application:** `replays-parser-2`

This document initializes the Rust replay parsing application only. It is one part of the Solid Stats product alongside `server-2` and `web`.

## Product Context

Solid Stats is a public SolidGames statistics platform that replaces the current replay-parser/statistics workflow. The product needs fast, trustworthy replay parsing, public player/squad/rotation/commander-side statistics, player-submitted correction requests, and bounty points based on player and squad effectiveness.

`replays-parser-2` owns the parsing engine and parsing result contract. It does not own the public website, Steam OAuth, moderation UI, request workflow, or main PostgreSQL schema. Those belong to `server-2` and `web`.

## Core Value

Parse OCAP JSON replays quickly and deterministically into normalized raw events plus aggregate outputs that `server-2` can persist, audit, compare against golden data, and use for public statistics.

## Existing Reference Data

- Current reference data lives at `~/sg_stats`.
- `~/sg_stats/raw_replays` contains around 3,938 OCAP JSON replay files.
- `~/sg_stats/results` contains existing calculated results.
- `~/sg_stats/lists/replaysList.json` contains replay list metadata.
- The archive is for tests/golden validation only, not production import.
- Example weekly result fields seen in existing data: `kills`, `killsFromVehicle`, `vehicleKills`, `teamkills`, `deaths`, `kdRatio`, `killsFromVehicleCoef`, `score`, `totalPlayedGames`, `week`, `startDate`, `endDate`.
- Example OCAP top-level keys: `EditorMarkers`, `Markers`, `captureDelay`, `endFrame`, `entities`, `events`, `missionAuthor`, `missionName`, `playersCount`, `worldName`.

## v1 Scope

### Must-Haves

- Rust parser for OCAP JSON only.
- CLI that can parse a local OCAP JSON file and write normalized result JSON.
- Worker/container mode that can be used by `server-2` through RabbitMQ/S3 integration.
- Deterministic normalized event output.
- Aggregate output for stats that exist today and new stats needed by Solid Stats.
- Golden tests using `~/sg_stats`.
- Benchmark harness comparing old/current results against new parser behavior.
- Target performance: around 10x faster than the current parser, measured through a baseline benchmark.
- Structured parse errors tied to replay file/job identifiers.
- Output schema versioning at the contract level, even though v1 may overwrite derived server results.

### Out of Scope

- Public website and UI.
- Steam OAuth.
- User roles, moderation, and request workflow.
- PostgreSQL persistence as the primary source of truth.
- Direct editing/correction of stats.
- Supporting replay formats other than OCAP JSON.
- Production Kubernetes deployment.
- Financial rewards or payout logic.

## Parsing Responsibilities

`replays-parser-2` should extract enough data for:

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

1. `server-2` stores replay file in S3-compatible storage.
2. `server-2` publishes a RabbitMQ parse request containing:
   - `job_id`
   - `replay_id`
   - `object_key`
   - `checksum`
   - `parser_contract_version`
3. `replays-parser-2` worker downloads the file from S3-compatible storage.
4. Parser emits either:
   - `parse.completed` with normalized parse artifact reference or payload.
   - `parse.failed` with structured error data.
5. `server-2` owns persistence into PostgreSQL and aggregate publication.

Parser should not directly mutate `server-2` business tables in v1. This keeps the app independently testable and makes the contract explicit.

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

### Worker Integration

- **WORK-01**: Worker consumes parse request jobs from RabbitMQ.
- **WORK-02**: Worker reads replay files from S3-compatible storage.
- **WORK-03**: Worker publishes completed/failed result messages.
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
| DB ownership | `server-2`, not parser |
| Reprocessing history | Server may overwrite derived results in v1 |

## Follow-Up Details for Implementation Phases

- Exact old parser command used for baseline benchmark.
- Exact old/new comparison tolerances.
- Final normalized JSON schema names and field types.
- Whether parse result payload is sent directly over RabbitMQ or stored as an artifact in S3.
- Exact RabbitMQ exchange/routing key naming.

