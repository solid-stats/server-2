# Graph Report - .  (2026-06-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1820 nodes · 3855 edges · 88 communities (82 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `144e7350`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_TEST_ZERO_NAME|TEST_ZERO_NAME]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]

## God Nodes (most connected - your core abstractions)
1. `buildApp()` - 56 edges
2. `PgPublicStatsReadModel` - 41 edges
3. `FakePublicStatsReadModel` - 41 edges
4. `PgIngestRepository` - 30 edges
5. `InMemoryPlayerRequestRepository` - 29 edges
6. `PgStatisticsRepository` - 29 edges
7. `PgPlayerRequestRepository` - 24 edges
8. `ScriptedClient` - 24 edges
9. `InMemoryAuthUserRepository` - 23 edges
10. `IngestStagingRecord` - 23 edges

## Surprising Connections (you probably didn't know these)
- `buildActionsApp()` --calls--> `buildApp()`  [EXTRACTED]
  src/modules/ingest/routes/tests/actions.test.ts → src/app.ts
- `buildRequestsApp()` --calls--> `buildApp()`  [INFERRED]
  src/modules/requests/routes/tests/fixtures.ts → src/app.ts
- `buildAdminApp()` --calls--> `buildApp()`  [INFERRED]
  src/modules/admin/routes/tests/utilities.ts → src/app.ts
- `buildAuditPatchApp()` --calls--> `buildApp()`  [INFERRED]
  src/modules/requests/routes/audit-patches/tests/utilities.ts → src/app.ts
- `buildModerationApp()` --calls--> `buildApp()`  [INFERRED]
  src/modules/requests/routes/moderation/tests/utilities.ts → src/app.ts

## Import Cycles
- 1-file cycle: `src/modules/admin/routes/models.ts -> src/modules/admin/routes/models.ts`
- 1-file cycle: `src/modules/requests/routes/models.ts -> src/modules/requests/routes/models.ts`

## Communities (88 total, 6 thin omitted)

### Community 0 - "TEST_ZERO_NAME"
Cohesion: 0.03
Nodes (84): PublicStatsRouteOptions, BountyListQuery, BountyListQueryType, BountyListResponse, BountySummaryResponse, CommanderSideQuery, CommanderSideResponse, LeaderboardQuery (+76 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (37): InMemoryPlayerRequestRepository, isAttachmentInput(), AuditPatch, AuditPatchRepository, CreatePlayerRequestInput, CreateRequestAttachmentInput, CreateRequestWorkflowActionInput, DecideRequestInput (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (30): classifyNoSteamPlayer(), classifyNoSteamPlayers(), identityItem(), IdentityReference, IdentityResolutionStatus, matchingIdentityReferences(), NicknameConflictItem, nicknameConflictItems() (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (30): InMemoryAdminRotationRepository, invalidRange(), slugBase(), AdminRotationRepository, AdminRotationRow, CreateRotationInput, CreateRotationResult, DeleteRotationResult (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (47): BountyPointEventEvidence, addToRelationshipMap(), aggregateRelationshipEntries(), aggregateWeaponEntries(), aggregateWeekEntries(), BountyInputsRow, buildReplayWhere(), CommanderSideRow (+39 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (28): composeBountyWhere(), keysetResult(), KeysetSeek, emptyLeaderboards(), emptySurface(), BountySummary, LeaderboardFilters, PageQuery (+20 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (28): createMetricsRegistry(), OperationalMetrics, registerOperationalMetrics(), registerRequestModerationRoutes(), registerOpenApi(), registerOperationsRoutes(), createEmptyIngestCommandModel(), createEmptyPublicStatsReadModel() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (18): InMemoryAuthUserRepository, InMemorySessionStore, AuthSession, AuthUser, AuthUserRepository, SessionStore, AuthSessionRow, AuthUserRow (+10 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (30): config, env, pool, repository, aggregateScopePredicate(), aggregateSnapshot(), ClassifiableReplaySeed, CorpusReplayPlayer (+22 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (26): BountyBreakdown, NameHistoryEntry, NameHistoryPayload, PlayerMembershipHistoryEntry, PlayerMembershipHistoryPayload, PlayerReferenceSlug, PlayerRelationshipEntry, PlayerRelationshipsPayload (+18 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (27): ALL_TIME_GAME_TYPES, classifyTarget(), countReason(), failedItem(), FullRunAggregateRows, FullRunAllTimeAggregateRows, FullRunCoverageItem, FullRunCoverageReport (+19 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (13): commanders(), CommanderScenario, eventRow(), parserArtifact(), parserResultRows(), player(), sideFacts(), bountyInsertRows() (+5 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (9): sortRelationships(), sortWeapons(), sortWeeks(), PgPublicStatsReadModel, mapRelationships(), mapWeapons(), mapWeeks(), maxTimestamp() (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (33): aggregateInputsFromRows(), AggregateRecalculationResult, AggregateScope, AssignRotationResult, BountyRecalculationResult, buildPlayerIdentityIndex(), CommanderIdentity, commanderInputsFromRows() (+25 more)

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (24): IngestStatus, PageQuery, PageResult, ParseJobFilters, ParseJobHistoryAction, ParseJobHistoryEntry, ParseJobStatus, PromotionStatus (+16 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (23): CursorPayload, decodeCursor(), encodeCursor(), isPrimitiveSortValue(), parseCursorJson(), ALLOWED_SORTS, BadCursorError, BountySortField (+15 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (27): AggregatePlayerEvidence, AggregateReplayInput, applyAttackerEvent(), applyCounterEvent(), applySquadCounterEvent(), applySquadEvent(), applyVictimDeath(), artifactCounterDeaths() (+19 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (14): assignReplayRotation(), auditScopes(), bountyKillInputs(), loadPreviousBountyEffectiveness(), loadScopedAggregateReplayInputs(), loadScopedCommanderReplayInputs(), PgStatisticsRepository, replaceBountyRows() (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (22): deaths(), LEGACY_PUBLIC_EXPORT_CONTRACT_VERSION, LegacyOtherPlayersExport, LegacyPlayerStatsExport, LegacyPublicStatsExport, LegacyPublicStatsExportOptions, LegacyPublicStatsExportService, LegacyRelationshipInput (+14 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (24): maskSteamId(), buildParticipants(), buildSides(), extractMapName(), extractPlayers(), extractSideFacts(), MAP_CANDIDATE_KEYS, mapReplayDetail() (+16 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (12): ReferenceValidator, SteamIdentity, SteamLoginUrlInput, SteamOpenIdAdapter, createRequest(), buildRequestsApp(), FakeSteamOpenIdAdapter, loginCookie() (+4 more)

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (25): SortDescriptor, assertCursorValueType(), commanderSideFilters(), decodeAfter(), DecodeAfterOptions, decodeFixedCursor(), emptyPage(), leaderboardFilters() (+17 more)

### Community 22 - "Community 22"
Cohesion: 0.11
Nodes (24): LegacyOtherPlayersInput, LegacyPlayerReference, LegacyPlayerStatsInput, LegacyRotationStatsInput, LegacySquadStatsInput, LegacyWeaponsInput, LegacyWeekInput, LegacyWeeksInput (+16 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (7): GameType, FullRunLifecycleCounts, ParserResultRecalculationTarget, ScopedRecalculationResult, FakeFullRunRepository, generatedAt, lifecycle

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (18): createIngestRuntime(), IngestRuntime, IngestRuntimeOptions, ParserArtifactLoader, ParserResultRecalculator, completedMessage, failedMessage, parserArtifact (+10 more)

### Community 25 - "Community 25"
Cohesion: 0.10
Nodes (15): PageCursorState, CYRILLIC_TRANSLITERATION, shortSuffix(), slugify(), config, env, pool, ALL_SORTS (+7 more)

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (7): ParseJobRepository, FakeParseJobRepository, FakePublisherLogger, FakePublisherObserver, parseJob, ParseJobRecord, FakeReadModel

### Community 27 - "Community 27"
Cohesion: 0.13
Nodes (8): FakePromotionRepository, IngestStagingRecord, ReplayRecord, firstParserResultId(), mapReplayRow(), recordEvidence(), requiredRow(), StagingRow

### Community 28 - "Community 28"
Cohesion: 0.13
Nodes (9): FullRunRecalculationRepository, ParserResultRecalculationService, ParserResultRecalculationSummary, StatisticsRecalculationRepository, ParserArtifactPersistenceService, StatisticsRepository, NormalizedParserEvent, FakeStatisticsRepository (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.10
Nodes (19): assignDefined(), JsonObject, MessageResponse, page(), PaginationQuery, parseJobFilters(), ParseJobHistoryListResponse, ParseJobHistoryResponse (+11 more)

### Community 30 - "Community 30"
Cohesion: 0.12
Nodes (20): requireActorUserId(), currentUser(), PlayerRequestType, ReferencedEntityType, AttachmentResponse, AttachmentUploadResponse, CreateAttachmentBody, CreateAttachmentBodyType (+12 more)

### Community 31 - "Community 31"
Cohesion: 0.27
Nodes (5): NoopAuditPatchRecalculator, PgAuditPatchRecalculator, AuditPatchRecalculator, CreateAuditPatchInput, FakeAuditPatchRecalculator

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (18): ArtifactStatus, CommanderSideFact, destroyedVehicleEvents(), DestroyedVehicleRow, diagnosticEvents(), DiagnosticRow, EventActorReference, killEvents() (+10 more)

### Community 33 - "Community 33"
Cohesion: 0.19
Nodes (10): deriveReplayTimestampFromSourceId(), resolveReplayTimestamp(), conflictDetails(), IngestPromotionService, PromotionRepository, replayRecord, stagingRecord, withResolvedReplayTimestamp() (+2 more)

### Community 34 - "Community 34"
Cohesion: 0.15
Nodes (5): mapParseJobRow(), mapStagingRow(), PgIngestRepository, recordParseJobHistory(), updateStagingStatus()

### Community 35 - "Community 35"
Cohesion: 0.43
Nodes (4): LoginInput, buildAdminApp(), createRotationId(), validBody()

### Community 36 - "Community 36"
Cohesion: 0.16
Nodes (16): createDiffReport(), defaultKnownDifferencePolicy(), DIFF_CONTRACT_VERSION, DiffCorpusScope, DiffInputMetadata, DiffSnapshotMetadata, DiffSummaryCounts, isDefaultKnownDifferenceCode() (+8 more)

### Community 37 - "Community 37"
Cohesion: 0.20
Nodes (18): applyLegacyWinnerFix(), applyPlayerMerge(), applyPlayerSplit(), applySteamLink(), assertPlayerExists(), firstId(), IdRow, LEGACY_WINNER_SIDES (+10 more)

### Community 38 - "Community 38"
Cohesion: 0.14
Nodes (13): createDatabaseHealthCheck(), createDatabasePool(), createDbClient(), auth, checks, config, databasePool, ingestRepository (+5 more)

### Community 39 - "Community 39"
Cohesion: 0.13
Nodes (14): MigrationRecord, migrationsDir, runMigrations(), aggregateTables, ColumnInfo, config, env, pool (+6 more)

### Community 40 - "Community 40"
Cohesion: 0.20
Nodes (13): applyIncludeOverride(), classifyGameType(), ClassifyGameTypeInput, extractMissionName(), isSmDateEligible(), MISSION_CANDIDATE_KEYS, unwrapMissionField(), assertExcludeListInvariant() (+5 more)

### Community 41 - "Community 41"
Cohesion: 0.16
Nodes (13): noopLogger, noopObserver, parseJobLogBindings(), ParseJobPublisher, ParseJobPublisherLogger, ParseJobPublisherObserver, ParseJobPublisherOptions, ParseJobPublisherRuntimeOptions (+5 more)

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (16): bucketPlaceholder(), bucketValues(), isShowSelect(), ParitySqlBucket, ParitySqlQuery, ParitySqlScope, playerStatsSql(), predicate() (+8 more)

### Community 43 - "Community 43"
Cohesion: 0.15
Nodes (14): RequiredRole, expiredSessionCookie(), readCookie(), sessionCookie(), SessionCookieOptions, authCallbackUrl(), CallbackQuery, CallbackQueryType (+6 more)

### Community 44 - "Community 44"
Cohesion: 0.12
Nodes (5): PgRequestWorkflowApplier, queryResult(), ScriptedCall, ScriptedClient, ScriptedClientOptions

### Community 45 - "Community 45"
Cohesion: 0.21
Nodes (10): AppEnvironment, loadConfig(), redactConfigForLogs(), redactUrl(), redactValue(), baseEnvironment, runStatisticsRecalculationOperation(), mocks (+2 more)

### Community 46 - "Community 46"
Cohesion: 0.16
Nodes (14): AssignedRotationRow, ClassificationInputRow, classifyReplay(), CurrentParserResultRow, distinctPlayerCount(), isStale(), mapCurrentParserResultRow(), PARSE_JOB_STATUSES (+6 more)

### Community 47 - "Community 47"
Cohesion: 0.16
Nodes (14): JsonObject, ManualReparseBody, ManualReparseBodyType, MessageResponse, ParseJobResponse, registerIngestActionRoutes(), registerManualReparseRoute(), registerRetryRoute() (+6 more)

### Community 48 - "Community 48"
Cohesion: 0.14
Nodes (10): config, env, pool, repository, checksumA, checksumB, checksumC, insertStaging() (+2 more)

### Community 49 - "Community 49"
Cohesion: 0.22
Nodes (4): LegacyPublicStatsExportData, LegacyPublicStatsExportRepository, PgLegacyPublicStatsExportRepository, FakeLegacyExportRepository

### Community 50 - "Community 50"
Cohesion: 0.17
Nodes (9): noopLogger, noopObserver, parseJobLogBindings(), ParseJobReconciler, ParseJobReconcilerLogger, ParseJobReconcilerObserver, ParseJobReconcilerOptions, ParseJobReconcilerRepository (+1 more)

### Community 51 - "Community 51"
Cohesion: 0.21
Nodes (12): BountyEffectivenessInput, BountyEventType, bountyEvidence(), BountyKillInput, BountyPointRow, bountyRow(), calculateBountyPoints(), effectiveness() (+4 more)

### Community 52 - "Community 52"
Cohesion: 0.19
Nodes (10): checkAll(), HealthCheckable, HealthCheckResult, HealthStatus, HealthSummary, HealthCheckResultSchema, LiveResponse, OperationsRouteOptions (+2 more)

### Community 53 - "Community 53"
Cohesion: 0.22
Nodes (10): checkAppWorkflowBoundary(), ForbiddenWorkflowRule, forbiddenWorkflowRules, isMissingDirectoryError(), isWorkflowFile(), readDirectoryEntries(), runAppWorkflowBoundaryGuardOperation(), temporaryDirectories (+2 more)

### Community 54 - "Community 54"
Cohesion: 0.15
Nodes (6): countStatuses(), PgFullRunStatisticsRepository, FullRunTargetRow, ScriptedFullRunPool, StatusRow, statusTable()

### Community 55 - "Community 55"
Cohesion: 0.32
Nodes (9): playerExport(), weekExport(), playerStats(), squadStats(), kdRatio(), killsFromVehicleCoef(), totalScore(), weeklyScore() (+1 more)

### Community 56 - "Community 56"
Cohesion: 0.23
Nodes (10): ApplyRequestWorkflowInput, RequestWorkflowApplier, MoveSelectedIdentityRowsInput, login(), LoginInput, requireCookie(), approveRequest(), buildWorkflowApp() (+2 more)

### Community 57 - "Community 57"
Cohesion: 0.17
Nodes (10): DecisionBody, DecisionBodyType, DecisionResponse, DetailResponse, ErrorResponse, ModerationActionResponse, RequestIdParameters, RequestIdParametersType (+2 more)

### Community 58 - "Community 58"
Cohesion: 0.23
Nodes (9): buildKeysetPredicate(), KeysetCursorState, KeysetDescriptor, KeysetOptions, KeysetPredicate, orderBy(), KILLS, NAME (+1 more)

### Community 59 - "Community 59"
Cohesion: 0.27
Nodes (6): AppConfig, env, createQueueClient(), createStorageClient(), awsMocks, config

### Community 60 - "Community 60"
Cohesion: 0.22
Nodes (6): createStaticHealthCheck(), PUBLIC_DETAIL_ROUTES, PUBLIC_LIST_ROUTES, WriteSweepHarness, WriteSweepSession, createLoggerOptions()

### Community 61 - "Community 61"
Cohesion: 0.20
Nodes (9): bestPlayerIdentityIndexed(), isNicknameActive(), playerIdentityMatchPriority(), PlayerIdentityRow, ArtifactPlayer, bestPlayerIdentityScan(), IDENTITIES, PLAYERS (+1 more)

### Community 62 - "Community 62"
Cohesion: 0.15
Nodes (14): buildWriteSweepApp(), EmptyReferenceValidator, createNoopRequestWorkflowApplier(), createDefaultRequestOptions(), loginAs(), LoginAsInput, requireCookie(), loginAs() (+6 more)

### Community 63 - "Community 63"
Cohesion: 0.40
Nodes (8): asJson(), collectListSchemas(), findPaginationOffenders(), FORBIDDEN_PAGINATION_KEYS, getJsonResponseSchema(), isListSchema(), Json, listOffenderKeys()

### Community 64 - "Community 64"
Cohesion: 0.22
Nodes (8): RequestWorkflowActionType, ErrorResponse, RequestIdParameters, RequestIdParametersType, WorkflowActionSchema, WorkflowBody, WorkflowBodyType, WorkflowResponse

### Community 65 - "Community 65"
Cohesion: 0.20
Nodes (6): PgReferenceValidator, config, env, pool, repository, references

### Community 67 - "Community 67"
Cohesion: 0.29
Nodes (8): calculateCommanderSideAggregates(), commanderAggregate(), CommanderEvidence, CommanderOutcomeEvidence, CommanderReplayInput, CommanderSideAggregateRow, MutableCommanderAggregate, normalizedSide()

### Community 68 - "Community 68"
Cohesion: 0.25
Nodes (8): AuditPatchBody, AuditPatchBodyType, AuditPatchResponse, ErrorResponse, registerAuditPatchRoutes(), RequestIdParameters, RequestIdParametersType, requireAnyRole()

### Community 69 - "Community 69"
Cohesion: 0.25
Nodes (5): rotationWhere(), CommanderSideSummary, OverviewFilters, StatsOverview, commanderSideSummary()

### Community 70 - "Community 70"
Cohesion: 0.33
Nodes (5): gapExists(), makeKnown(), TestWindow, UnknownGapEntry, withGaps()

### Community 71 - "Community 71"
Cohesion: 0.42
Nodes (6): childSitemapEntry(), escapeXml(), replayUrlEntry(), ReplaySitemapRouteOptions, sitemapIndexXml(), urlsetXml()

### Community 72 - "Community 72"
Cohesion: 0.25
Nodes (5): document, paginatedSchemas, REMOVED_OFFSET_FIELDS, SchemaObject, schemaObjects

### Community 73 - "Community 73"
Cohesion: 0.46
Nodes (6): argumentValue(), generatedAt(), LegacyExportOperationOptions, parseOperationArguments(), runLegacyPublicStatsExportOperation(), mocks

### Community 75 - "Community 75"
Cohesion: 0.25
Nodes (7): AuthErrorResponse, NotFoundResponse, RolesBody, RolesBodyType, UserIdParameters, UserIdParametersType, UserResponse

### Community 77 - "Community 77"
Cohesion: 0.38
Nodes (6): BountyRow, bountyRowWithInputs(), bountyRowWithRawInputs(), captureCommanderSidesSql(), CapturedQuery, readModelWithCapture()

### Community 78 - "Community 78"
Cohesion: 0.47
Nodes (3): outputPath, createOpenApiSchema(), schemaPath

### Community 79 - "Community 79"
Cohesion: 0.33
Nodes (4): missing, requiredComposeTerms, requiredEnvironmentTerms, requiredRunbookTerms

### Community 80 - "Community 80"
Cohesion: 0.33
Nodes (3): RotationDetail, RotationSummary, rotationSummary()

### Community 81 - "Community 81"
Cohesion: 0.53
Nodes (6): IngestCommandModel, AdminRouteOptions, AuthRouteOptions, RequestRouteOptions, IngestRouteOptions, BuildAppOptions

### Community 84 - "Community 84"
Cohesion: 0.60
Nodes (3): ManualReparseResult, RetryParseJobResult, FakeCommands

### Community 85 - "Community 85"
Cohesion: 0.50
Nodes (4): buildActionsApp(), job, loginCookie(), requireCookie()

### Community 87 - "Community 87"
Cohesion: 0.38
Nodes (6): InMemoryRequestAttachmentStorage, safeFileName(), CreateRequestAttachmentUploadInput, RequestAttachmentStorage, RequestAttachmentUpload, FakeRequestAttachmentStorage

## Knowledge Gaps
- **427 isolated node(s):** `DefaultAuthConfig`, `baseEnvironment`, `AppEnvironment`, `MigrationRecord`, `migrationsDir` (+422 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PgStatisticsRepository` connect `Community 17` to `Community 37`, `Community 38`, `Community 8`, `Community 11`, `Community 44`, `Community 13`, `Community 46`, `Community 54`, `Community 31`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **Why does `buildApp()` connect `Community 6` to `Community 35`, `Community 68`, `Community 38`, `Community 39`, `Community 78`, `Community 15`, `Community 20`, `Community 85`, `Community 30`, `Community 56`, `Community 60`, `Community 62`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `PgIngestRepository` connect `Community 34` to `Community 38`, `Community 14`, `Community 48`, `Community 24`, `Community 26`, `Community 27`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `buildApp()` (e.g. with `buildRequestsApp()` and `buildAdminApp()`) actually correct?**
  _`buildApp()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `DefaultAuthConfig`, `baseEnvironment`, `AppEnvironment` to the rest of the system?**
  _427 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `TEST_ZERO_NAME` be split into smaller, more focused modules?**
  _Cohesion score 0.033957553058676655 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06553128470936691 - nodes in this community are weakly interconnected._