# Feature Research

**Domain:** Replay statistics backend and moderation API
**Researched:** 2026-05-09
**Confidence:** HIGH for brief-derived features, MEDIUM for prioritization

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Public stats API | The product is a public statistics platform. | HIGH | Must cover overview, players, squads, rotations, commander stats, bounty stats, and leaderboards. |
| Replay ingestion lifecycle | Stats are only trustworthy if replay discovery/promotion is durable. | HIGH | Staging, duplicate detection, canonical replay creation, and parse job creation are inseparable. |
| Parser job orchestration | Parsed replay output is produced by another app. | HIGH | Needs durable job state, RabbitMQ publishing, completion/failure handling, retry, and manual reparse. |
| Canonical identity model | Player names and SteamIDs change over time. | HIGH | Canonical players, nickname history, SteamID history, merge/split support, and moderated linking are required. |
| Squad and rotation history | Stats and bounty points depend on historical context. | HIGH | Membership and rotation assignment must be timestamp-aware. |
| Aggregate stat persistence | Public APIs need fast reads and consistent recalculation. | HIGH | Store raw normalized data plus derived aggregates. |
| Steam login and roles | Requests/moderation/admin features require identity and permissions. | MEDIUM | Public stats stay anonymous; write/moderation flows require login and roles. |
| Request/moderation workflow | Players need correction and identity dispute support. | HIGH | Must include comments, status, attachments, audit, and recalculation. |
| OpenAPI contract | `web` develops independently from generated types. | MEDIUM | Schema must be updated with behavior/payload changes. |
| Operations visibility | Failed parser/ingest jobs directly affect stat trust. | MEDIUM | Health, metrics, job failure visibility, retry/reparse, and backups are launch requirements. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Commander-side statistics | Domain-specific insight beyond basic player stats. | MEDIUM | Must represent unknown legacy outcomes and audited manual fixes. |
| Bounty points by rotation | Gives SolidGames-specific scoring and leaderboards. | MEDIUM | Formula can be hardcoded in v1 but must be documented and tested. |
| Duplicate conflict visibility | Prevents silent stat corruption from replay source conflicts. | HIGH | Requires staging evidence, conflict state, and admin resolution. |
| Audited correction patches | Lets community fixes improve stats without hiding manual changes. | HIGH | Preserve moderation decisions and patch source for recalculation. |
| Cross-app contract discipline | Enables independent frontend/parser/fetcher work. | MEDIUM | OpenAPI and RabbitMQ/parser contract changes need compatibility notes. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full historical production import in v1 | Makes the platform feel complete immediately. | Large data cleanup and identity ambiguity can block launch. | Use historical data as golden/test baseline; import later when pipelines are stable. |
| Versioned parse result history | Helpful for audit and parser evolution. | Expands storage/model complexity before v1 trust loop is proven. | Allow v1 overwrite of derived parser results, preserve moderation audit patches. |
| Financial bounty rewards | Makes bounty points feel consequential. | Adds policy, abuse, and accounting concerns outside core stats. | Keep bounty points as non-financial gameplay/stat scoring. |
| Supporting non-OCAP formats | Broadens replay coverage. | Requires parser ownership outside `server-2` and dilutes v1. | Keep v1 to OCAP JSON/parser contract. |
| Building admin UI inside backend | Convenient for operators. | UI ownership belongs to `web`. | Expose admin/moderation APIs and OpenAPI schema. |

## Feature Dependencies

```text
Infrastructure and config
    -> Database schema and migrations
        -> Ingest staging promotion
            -> Parse job lifecycle
                -> Parser result persistence
                    -> Aggregate recalculation
                        -> Public stats APIs

Steam auth and roles
    -> Request submission
        -> Moderation decisions
            -> Audit patches
                -> Aggregate recalculation

OpenAPI contract
    -> Web integration
    -> API compatibility checks
```

### Dependency Notes

- **Stats APIs require aggregates:** Public reads should not parse raw event data on demand.
- **Aggregates require stable identity/rotation assignment:** Player, squad, and rotation histories shape every derived stat.
- **Moderation requires audit before recalculation:** Approved fixes must be explainable after aggregates change.
- **OpenAPI should start early:** If schema generation is bolted on late, route payloads and frontend types will drift.
- **Operations visibility must arrive with jobs:** Retry/failure UI can be thin, but job state must exist from the first parser integration.

## MVP Definition

### Launch With (v1)

- [ ] Typed Fastify API service with PostgreSQL/RabbitMQ/S3 configuration.
- [ ] Docker Compose local development stack.
- [ ] Core schema for users, roles, canonical players, nicknames, SteamIDs, squads, rotations, replays, ingest staging, parse jobs, parse results, events, aggregates, requests, attachments, and audit.
- [ ] Ingest staging promotion from `replays-fetcher` evidence into canonical replay and parse job records.
- [ ] RabbitMQ parse request publishing and parser completion/failure consumption.
- [ ] Parser result persistence and aggregate recalculation.
- [ ] Public stats endpoints for overview, player/squad search/profile, rotation, commander, bounty, and leaderboards.
- [ ] Steam login, bootstrap admin, role enforcement, and role management APIs.
- [ ] Correction/identity request creation, attachments, moderation decisions, audit, and recalculation.
- [ ] Admin operations endpoints for ingest conflicts, parse failures, retries, reparses, health, and metrics.
- [ ] OpenAPI 3.x schema that `web` can consume with `openapi-typescript`.
- [ ] Backup/restore documentation for PostgreSQL and S3-compatible storage.

### Add After Validation (v1.x)

- [ ] More sophisticated aggregate caching/materialization if public traffic demands it.
- [ ] Bulk admin workflows for common moderation fixes.
- [ ] More detailed operator dashboards once real failure modes are known.
- [ ] Parser contract version migration helpers.

### Future Consideration (v2+)

- [ ] Annual/yearly nomination statistics.
- [ ] Versioned parse result history.
- [ ] Full historical production import from `~/sg_stats`.
- [ ] Additional replay formats.
- [ ] Kubernetes production deployment and horizontal worker autoscaling.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Core infrastructure/config | HIGH | MEDIUM | P1 |
| Schema and migrations | HIGH | HIGH | P1 |
| Ingest staging promotion | HIGH | HIGH | P1 |
| Parse job lifecycle | HIGH | HIGH | P1 |
| Parser result persistence | HIGH | HIGH | P1 |
| Aggregate calculations | HIGH | HIGH | P1 |
| Public stats APIs | HIGH | HIGH | P1 |
| Steam auth and roles | MEDIUM | MEDIUM | P1 |
| Requests and moderation | HIGH | HIGH | P1 |
| OpenAPI schema | HIGH | MEDIUM | P1 |
| Operations visibility | HIGH | MEDIUM | P1 |
| Yearly nomination stats | LOW | MEDIUM | P3 |
| Versioned parse history | MEDIUM | HIGH | P3 |

## Competitor Feature Analysis

No direct competitor audit was available in the brief. For roadmap purposes, the more relevant comparison is between system responsibilities:

| Feature | Generic stats site | Solid Stats Approach |
|---------|--------------------|----------------------|
| Player stats | Usually flat profile/leaderboards. | Canonical identity, nickname history, SteamID history, and moderated correction support. |
| Replay ingestion | Often upload-only or manual import. | Cross-app fetcher staging, canonical promotion, duplicate conflict review, parser jobs. |
| Corrections | Often admin-only manual edits. | Player-submitted requests, attachments, moderator decisions, audit patches, recalculation. |
| API typing | Often undocumented JSON. | OpenAPI source of truth consumed by frontend code generation. |

## Sources

- `gsd-briefs/server-2.md` - primary product brief and feature list.
- `.planning/PROJECT.md` - synthesized project context.
- Official stack sources listed in `.planning/research/STACK.md`.

---
*Feature research for: replay statistics backend and moderation API*
*Researched: 2026-05-09*
