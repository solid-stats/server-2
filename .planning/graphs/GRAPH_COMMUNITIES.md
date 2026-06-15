# Graph Communities — server-2

_88 communities, named by member analysis (no LLM API used). Source: `.planning/graphs/graph.json`._

| # | Name | Purpose | Key files |
|---|------|---------|-----------|
| 0 | **Public Stats Routes API** | HTTP routes and schemas for public player, squad, and replay statistics endpoints. | src/modules/public-stats/routes/routes.ts<br>src/modules/public-stats/routes/schemas.ts<br>src/modules/public-stats/routes/models.ts |
| 1 | **Player Request Repository** | In-memory and database storage for player requests with CRUD operations and audit tracking. | src/modules/requests/routes/memory.ts<br>src/modules/requests/routes/postgres.ts<br>src/modules/requests/routes/models.ts |
| 2 | **Statistics Readiness Service** | Tracks player identity resolution status and readiness reporting for statistics computation. | src/modules/statistics/readiness/readiness.ts<br>src/modules/statistics/repository/readiness.ts |
| 3 | **Admin Rotation Repository** | In-memory rotation management with validation and persistent storage for administrative updates. | src/modules/admin/routes/memory.ts<br>src/modules/admin/routes/rotation-repository.ts |
| 4 | **Data Model Rows** | Database row types for players, squads, rotations, and bounty aggregation entities. | src/modules/public-stats/repository.ts<br>src/modules/statistics/bounty/bounty.ts |
| 5 | **Public Stats Read Model** | Query interface for public statistics with filtering, pagination, and leaderboard aggregation. | src/modules/public-stats/routes/empty-read-model.ts<br>src/modules/public-stats/repository.ts |
| 6 | **Application Bootstrap** | Express app factory, authentication config, metrics registry, and module route registration. | src/app.ts<br>src/infra/metrics/registry.ts |
| 7 | **Auth User Repository** | In-memory and database storage for Steam user identities and session management. | src/modules/auth/routes/memory.ts<br>src/modules/auth/routes/postgres.ts |
| 8 | **Statistics Test Fixtures** | Test data builders and database helpers for statistics integration tests. | src/modules/statistics/repository/tests/postgres.test.ts |
| 9 | **Player Stats Payload Models** | Response models for player weapons, vehicles, relationships, and weekly statistics. | src/modules/public-stats/routes/models.ts |
| 10 | **Full Run Recalculation Service** | Orchestrates full-scope statistics recalculation with coverage reporting. | src/modules/statistics/service/full-run-recalculation.ts |
| 11 | **Repository Test Utilities** | Test clients, fixtures, and assertion helpers for database repository tests. | src/modules/statistics/repository/tests/utilities.ts<br>src/modules/statistics/repository/tests/fixtures.ts |
| 12 | **Public Stats Database Queries** | PostgreSQL queries for player/squad data, replay history, and sitemap generation. | src/modules/public-stats/repository.ts |
| 13 | **Statistics Repository Core** | Parser event storage and rotation assignment for aggregation recalculation. | src/modules/statistics/repository/repository.ts |
| 14 | **Ingest Query Builder** | Dynamic SQL WHERE clause construction and record filtering for ingest operations. | src/modules/ingest/repository/repository.ts<br>src/modules/ingest/types.ts |
| 15 | **Pagination and Filtering** | Cursor-based keyset pagination, filter validation, and sort specification for list endpoints. | src/modules/public-stats/routes/pagination/cursor.ts<br>src/modules/public-stats/routes/filters.ts |
| 16 | **Player and Squad Aggregation** | Compute kill/death statistics and squad membership aggregates from replay events. | src/modules/statistics/service/service.ts |
| 17 | **Statistics Recalculation Adapter** | Delegates statistics recalculation across scopes (parser result, rotation, all-time). | src/modules/statistics/repository/repository.ts |
| 18 | **Legacy Stats Export** | Backward-compatible JSON export of player/squad/weapon/relationship statistics. | src/modules/statistics/export/legacy-public-export.ts |
| 19 | **Replay Event Mapper** | Transforms raw replay events into structured sides, participants, and map metadata. | src/modules/public-stats/replay-mapper.ts |
| 20 | **Steam Identity and Testing** | Steam OpenID authentication, test fixtures, and reference validation mocks. | src/modules/auth/routes/models.ts<br>src/modules/requests/routes/models.ts |
| 21 | **Filter and Sort Specification** | Defines allowed sort fields and filter logic for rotation, player, and commander endpoints. | src/modules/public-stats/routes/filters.ts<br>src/modules/public-stats/routes/pagination/sort.ts |
| 22 | **Legacy Database Export** | SQL queries extracting player/squad/weapon/relationship data for legacy format export. | src/modules/statistics/repository/legacy-export.ts |
| 23 | **Game Type Classification** | Classifies replays by game type and manages inclusion/exclusion list overrides. | src/modules/statistics/game-type/game-type-config.ts |
| 24 | **Parser Runtime and Messaging** | RabbitMQ queue integration and parse job lifecycle message handling. | src/infra/queue/rabbitmq.ts<br>src/modules/ingest/runtime.ts |
| 25 | **Player Slug and Pagination State** | Name-based player lookups with Cyrillic transliteration and pagination cursor state. | src/modules/public-stats/routes/slug.ts<br>src/modules/public-stats/routes/pagination/mask.ts |
| 26 | **Parse Job Publisher** | Publishes completed parse jobs to downstream consumers with status tracking. | src/modules/ingest/publisher.ts |
| 27 | **Replay Promotion Workflow** | Manages staging record deduplication and promotion to replay table with evidence tracking. | src/modules/ingest/repository/repository.ts |
| 28 | **Parser Artifact Persistence** | Persists normalized parser events and coordinates statistics recalculation. | src/modules/statistics/parser-artifact.ts |
| 29 | **Ingest Route Schemas** | OpenAPI schemas and filters for staging records and parse job list endpoints. | src/modules/ingest/routes/routes.ts |
| 30 | **Request and Action Routes** | HTTP endpoints for creating/listing player requests and ingest job actions. | src/modules/requests/routes/routes.ts<br>src/modules/ingest/routes/actions.ts |
| 31 | **Audit Patch Recalculator** | Applies audit patches to statistics after moderation actions on replay data. | src/modules/requests/routes/audit-recalculator.ts |
| 32 | **Parser Artifact Mapping** | Maps raw parser output to normalized kill/vehicle/diagnostic events and summaries. | src/modules/statistics/parser-artifact.ts |
| 33 | **Replay Promotion Service** | Handles source/checksum conflict detection and timestamp resolution for new replays. | src/modules/ingest/service.ts |
| 34 | **Ingest Database Adapter** | PostgreSQL operations for staging records, parse jobs, and history tracking. | src/modules/ingest/repository/repository.ts |
| 35 | **Admin Test Utilities** | Rotation management test helpers and admin app builders. | src/modules/admin/routes/tests/utilities.ts |
| 36 | **Parity Diff Contract** | Defines strict failure codes and known difference policies for statistics validation. | src/modules/statistics/diff/diff-contract.ts |
| 37 | **Workflow Action Application** | Applies player merge/split/link actions and legacy winner fixes to identity data. | src/modules/requests/routes/workflow-applier.ts |
| 38 | **Infrastructure Bootstrap** | Database pool creation, logging setup, server initialization and shutdown. | src/infra/db/client.ts<br>src/server.ts |
| 39 | **Database Schema and Migrations** | Schema validation, migration runner, and integration test infrastructure. | src/infra/db/migrate.ts |
| 40 | **Game Type Detection** | Extracts mission names and classifies replays by game type with override rules. | src/modules/statistics/game-type/classify-game-type.ts |
| 41 | **Parse Job Publishing** | Publishes parse completion messages to RabbitMQ with error handling. | src/infra/queue/messages.ts<br>src/modules/ingest/publisher.ts |
| 42 | **Parity Statistics SQL** | Dynamic SQL generation for player/squad/weapon/relationship statistics queries. | src/modules/statistics/repository/parity-sql.ts |
| 43 | **Authentication Routes** | Steam login/callback routes, session cookies, and role-based access control. | src/modules/auth/routes/routes.ts<br>src/modules/auth/routes/authorization.ts |
| 44 | **Workflow Applier Tests** | Test doubles and integration tests for workflow action application and recalculation. | src/modules/requests/routes/workflow-applier.test.ts |
| 45 | **Configuration and Operations** | Environment loading, statistics recalculation and readiness operations. | src/config/env.ts<br>src/operations/recalculate-statistics.ts |
| 46 | **Parser Result Status Tracking** | Query results for rotation assignment, status counts, and parser result metadata. | src/modules/statistics/repository/repository.ts |
| 47 | **Ingest Action Routes** | HTTP endpoints for parse job retry and manual reparse with role-based authorization. | src/modules/ingest/routes/actions.ts |
| 48 | **Ingest Repository Tests** | PostgreSQL test helpers for staging records and parse job operations. | src/modules/ingest/repository/tests/postgres.test.ts |
| 49 | **Legacy Export Repository** | Loads source data from database for legacy statistics export format. | src/modules/statistics/export/legacy-public-export.ts<br>src/modules/statistics/repository/legacy-export.ts |
| 50 | **Parse Job Reconciler** | Detects and reconciles stale published parse jobs with completion tracking. | src/modules/ingest/reconciler.ts |
| 51 | **Bounty Point Calculation** | Computes bounty points from kill events with effectiveness weighting. | src/modules/statistics/bounty/bounty.ts |
| 52 | **Health Checks and Operations** | System health status, storage client, and operations endpoints. | src/infra/health.ts<br>src/modules/operations/routes.ts |
| 53 | **Workflow Boundary Guards** | Validates that request workflow changes follow boundary rules and policies. | src/operations/check-app-boundary-guards.ts |
| 54 | **Full Run Statistics Repository** | Assigns rotations and classifies game types for full-scope recalculation. | src/modules/statistics/repository/full-run.ts |
| 55 | **Parity Score Formulas** | Calculates KD ratio, kill coefficients, and weekly score metrics. | src/modules/statistics/parity-formulas.ts |
| 56 | **Workflow Tests** | Test app builders and test doubles for workflow action application. | src/modules/requests/routes/workflows/tests/utilities.ts |
| 57 | **Request Moderation Routes** | HTTP endpoints for request approval/rejection and decision responses. | src/modules/requests/routes/moderation/moderation.ts |
| 58 | **Keyset Cursor Pagination** | Implements keyset-based pagination with sortable columns and state encoding. | src/modules/public-stats/routes/pagination/keyset.ts |
| 59 | **Cloud Client Factories** | Creates RabbitMQ queue and S3 storage client instances. | src/infra/queue/client.ts<br>src/infra/storage/client.ts |
| 60 | **Logging and Testing** | Logger configuration, app-level tests, and Steam ID leak detection. | src/infra/logging/logger.ts<br>src/test/app.test.ts |
| 61 | **Player Identity Indexing** | Indexes player identities with priority matching and steam ID validation. | src/modules/statistics/repository/repository.ts |
| 62 | **Request Moderation Test Suite** | Integration tests for request workflows, audit patches, and moderation. | src/modules/requests/routes/audit-patches/tests/index.test.ts<br>src/modules/requests/routes/moderation/tests/index.test.ts |
| 63 | **OpenAPI Contract Validation** | Validates OpenAPI schema for forbidden pagination keys and list schema compliance. | src/openapi/frozen-contract.test.ts |
| 64 | **Request Workflow Schemas** | OpenAPI schemas for request workflow actions and validation logic. | src/modules/requests/routes/workflows/workflows.ts |
| 65 | **Reference Validator Database** | PostgreSQL implementation of reference validation for player/squad identities. | src/modules/requests/routes/postgres.ts |
| 66 | **Interval Task Scheduler** | Periodic task execution with start/stop lifecycle and error handling. | src/infra/runtime/interval-task.ts |
| 67 | **Commander Side Aggregation** | Computes commander-specific statistics from replay events. | src/modules/statistics/service/commander.ts |
| 68 | **Audit Patch Moderation Routes** | HTTP endpoints for creating audit patches after request review. | src/modules/requests/routes/audit-patches/audit-patches.ts |
| 69 | **Overview and Commander Statistics** | Queries rotation overviews and commander side summaries. | src/modules/public-stats/repository.ts |
| 70 | **History Gap Detection** | Detects and tracks periods of missing player/squad history data. | src/modules/public-stats/routes/history-gaps.ts |
| 71 | **Replay Sitemap Generation** | Generates XML sitemaps for replay URLs with pagination support. | src/modules/public-stats/routes/sitemap.ts |
| 72 | **OpenAPI Pagination Schema** | Validates that paginated OpenAPI schemas use standard field conventions. | src/openapi/contract.test.ts |
| 73 | **Legacy Export Operation** | Orchestrates generation and export of legacy statistics format to output. | src/operations/export-legacy-public-stats.ts |
| 74 | **RabbitMQ Parser Runtime** | Consumes parser completion messages and routes to result handlers. | src/infra/queue/rabbitmq.ts |
| 75 | **Admin Role Routes** | HTTP endpoints for viewing and updating user roles. | src/modules/auth/routes/role-routes.ts |
| 76 | **Steam OpenID Client** | Steam authentication protocol implementation with signature verification. | src/modules/auth/routes/steam-openid.ts |
| 77 | **Bounty Query Repository** | Queries bounty input data and aggregates for statistics API. | src/modules/public-stats/repository.ts |
| 78 | **OpenAPI Schema Export** | Generates and exports OpenAPI schema documentation. | src/openapi/export-openapi.ts |
| 79 | **Backup Runbook Validator** | Ensures critical database backup terms exist in Docker Compose. | src/operations/check-backup-runbook.ts |
| 80 | **Rotation Summary Queries** | Queries for rotation details, summaries, and listing. | src/modules/public-stats/repository.ts |
| 81 | **Module Route Options** | Configuration interfaces for registering application modules. | src/app.ts |
| 82 | **Legacy Export Test Utilities** | Scripted database client for legacy export testing. | src/modules/statistics/repository/tests/legacy-export.test.ts |
| 83 | **RabbitMQ Topology Setup** | Tests queue and exchange topology configuration assertions. | src/infra/queue/rabbitmq.test.ts |
| 84 | **Ingest Command Handlers** | Implements retry and manual reparse commands for parse jobs. | src/modules/ingest/routes/actions.ts |
| 85 | **Action Routes Tests** | Integration tests for parse job retry and reparse endpoints. | src/modules/ingest/routes/tests/actions.test.ts |
| 86 | **Show Classification** | Computes whether a replay is from a show/tournament game. | src/modules/statistics/game-type/is-show.ts |
| 87 | **Request Attachment Storage** | Stores and manages file uploads for request moderation attachments. | src/modules/requests/routes/attachment-storage.ts |
