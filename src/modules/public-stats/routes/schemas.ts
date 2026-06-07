/* eslint-disable max-lines, new-cap */
import { Type, type Static } from "@sinclair/typebox";

export const PaginationQuery = Type.Object({
    cursor: Type.Optional(Type.String()),
    limit: Type.Optional(
      Type.Integer({ default: 25, maximum: 100, minimum: 1 }),
    ),
    // `sort` stays a free String at the schema layer because each endpoint owns
    // a different whitelist; the value is validated against that whitelist in
    // the filter (resolveSort). Per-endpoint literal-union tightening for richer
    // OpenAPI enums is deferred to the Phase 19 freeze (14-RESEARCH Open Q1).
    order: Type.Optional(
      Type.Union([Type.Literal("asc"), Type.Literal("desc")], {
        default: "desc",
      }),
    ),
    sort: Type.Optional(Type.String()),
  }),
  UuidParameters = Type.Object({ id: Type.String({ format: "uuid" }) }),
  // Phase 16: accept either a UUID or a bounded slug in `:id` (T-16-06 DoS mitigation).
  SlugOrUuidParameters = Type.Object({
    id: Type.String({
      minLength: 1,
      maxLength: 128,
      pattern: "^[A-Za-z0-9-]+$",
    }),
  }),
  // Phase 16: provenance envelope for singular responses (HIST-03 — row-derived freshness, no now()).
  ProvenanceResponse = Type.Object({
    lastUpdatedAt: Type.Union([
      Type.String({ format: "date-time" }),
      Type.Null(),
    ]),
  }),
  RotationQuery = Type.Object({
    rotationId: Type.Optional(Type.String({ format: "uuid" })),
  }),
  PlayerListQuery = Type.Intersect([
    PaginationQuery,
    RotationQuery,
    Type.Object({
      search: Type.Optional(Type.String()),
    }),
  ]),
  PlayerDetailQuery = RotationQuery,
  SquadListQuery = Type.Intersect([
    PaginationQuery,
    RotationQuery,
    Type.Object({
      search: Type.Optional(Type.String()),
    }),
  ]),
  SquadDetailQuery = RotationQuery,
  BountyListQuery = Type.Intersect([PaginationQuery, RotationQuery]),
  // Phase 17: replay surface schemas.
  ReplayListQuery = Type.Intersect([
    PaginationQuery,
    RotationQuery,
    Type.Object({
      fromDate: Type.Optional(Type.String({ format: "date-time" })),
      toDate: Type.Optional(Type.String({ format: "date-time" })),
    }),
  ]),
  ReplayEventsQuery = PaginationQuery,
  ReplaySummaryResponse = Type.Object({
    id: Type.String({ format: "uuid" }),
    slug: Type.Union([Type.String(), Type.Null()]),
    rotationId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    replayTimestamp: Type.Union([
      Type.String({ format: "date-time" }),
      Type.Null(),
    ]),
    sourceSystem: Type.String(),
    sourceReplayId: Type.String(),
    status: Type.String(),
  }),
  ReplayListResponse = paginated(ReplaySummaryResponse),
  ReplayDetailRotationResponse = Type.Object({
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
  }),
  ReplayOutcomeResponse = Type.Object({
    status: Type.String(),
    winnerSide: Type.Union([Type.String(), Type.Null()]),
  }),
  ReplaySideResponse = Type.Object({
    side: Type.String(),
    outcome: ReplayOutcomeResponse,
    isWinner: Type.Union([Type.Boolean(), Type.Null()]),
    participantCount: Type.Number(),
  }),
  ReplayPlayerRef = Type.Object({
    id: Type.Union([Type.String(), Type.Null()]),
    slug: Type.Union([Type.String(), Type.Null()]),
    displayName: Type.String(),
  }),
  ReplayParticipantResponse = Type.Object({
    player: ReplayPlayerRef,
    steamId: Type.Union([Type.String(), Type.Null()]),
    kills: Type.Number(),
    deaths: Type.Number(),
    teamkills: Type.Number(),
  }),
  ReplayDetailResponse = Type.Object({
    id: Type.String({ format: "uuid" }),
    slug: Type.Union([Type.String(), Type.Null()]),
    rotation: Type.Union([ReplayDetailRotationResponse, Type.Null()]),
    replayTimestamp: Type.Union([
      Type.String({ format: "date-time" }),
      Type.Null(),
    ]),
    map: Type.Union([Type.String(), Type.Null()]),
    sides: Type.Array(ReplaySideResponse),
    participants: Type.Array(ReplayParticipantResponse),
    provenance: ProvenanceResponse,
  }),
  ReplayEventActorResponse = Type.Object({
    displayName: Type.Union([Type.String(), Type.Null()]),
    steamId: Type.Union([Type.String(), Type.Null()]),
  }),
  ReplayEventResponse = Type.Object({
    id: Type.String({ format: "uuid" }),
    eventType: Type.String(),
    occurredAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    actor: Type.Union([ReplayEventActorResponse, Type.Null()]),
    payload: Type.Record(Type.String(), Type.Unknown()),
  }),
  ReplayEventsResponse = paginated(ReplayEventResponse),
  LeaderboardQuery = Type.Intersect([
    RotationQuery,
    Type.Object({
      bountyCursor: Type.Optional(Type.String()),
      limit: Type.Optional(
        Type.Integer({ default: 10, maximum: 100, minimum: 1 }),
      ),
      playersCursor: Type.Optional(Type.String()),
      squadsCursor: Type.Optional(Type.String()),
    }),
  ]),
  RotationSummaryResponse = Type.Object({
    endsAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    // Phase 16: slug field (additive).
    slug: Type.String(),
    startsAt: Type.String({ format: "date-time" }),
  }),
  PlayerWeaponEntry = Type.Object({
    kills: Type.Number(),
    name: Type.String(),
  }),
  PlayerWeaponsResponse = Type.Object({
    firearms: Type.Array(PlayerWeaponEntry),
    // Phase 16: provenance (additive, singular parity surface).
    provenance: ProvenanceResponse,
    vehicles: Type.Array(PlayerWeaponEntry),
  }),
  PlayerVehiclesResponse = Type.Object({
    killsFromVehicle: Type.Number(),
    killsFromVehicleCoef: Type.Number(),
    // Phase 16: provenance (additive, singular parity surface).
    provenance: ProvenanceResponse,
    vehicleKills: Type.Number(),
    vehicles: Type.Array(PlayerWeaponEntry),
  }),
  PlayerRelationshipEntry = Type.Object({
    count: Type.Number(),
    // `id` is NOT constrained to `format: "uuid"`: the relationshipsSql
    // COALESCE chain (parity-sql.ts) can legitimately emit a non-canonical
    // target identifier (player name or in-replay ref) when a kill
    // victim/killer does not resolve to a canonical player. The
    // byte-identical parity invariant requires keeping these entries, so the
    // target id is an opaque player identifier, not guaranteed to be a UUID.
    player: Type.Object({
      displayName: Type.String(),
      id: Type.String(),
    }),
  }),
  PlayerRelationshipsResponse = Type.Object({
    killed: Type.Array(PlayerRelationshipEntry),
    killers: Type.Array(PlayerRelationshipEntry),
    // Phase 16: provenance (additive, singular parity surface).
    provenance: ProvenanceResponse,
    teamkilled: Type.Array(PlayerRelationshipEntry),
    teamkillers: Type.Array(PlayerRelationshipEntry),
  }),
  PlayerWeekBucket = Type.Object({
    deaths: Type.Object({
      byTeamkills: Type.Number(),
      total: Type.Number(),
    }),
    endDate: Type.String(),
    kdRatio: Type.Number(),
    killsFromVehicle: Type.Number(),
    killsFromVehicleCoef: Type.Number(),
    kills: Type.Number(),
    score: Type.Number(),
    startDate: Type.String(),
    teamkills: Type.Number(),
    totalPlayedGames: Type.Number(),
    vehicleKills: Type.Number(),
    week: Type.String(),
  }),
  PlayerWeeklyResponse = Type.Object({
    // Phase 16: provenance (additive, singular parity surface).
    provenance: ProvenanceResponse,
    weeks: Type.Array(PlayerWeekBucket),
  }),
  PlayerStatsResponse = Type.Object({
    deaths: Type.Object({
      byTeamkills: Type.Number(),
      total: Type.Number(),
    }),
    kdRatio: Type.Number(),
    kills: Type.Number(),
    replayCount: Type.Number(),
    teamkills: Type.Number(),
    totalPlayedGames: Type.Number(),
    totalScore: Type.Number(),
  }),
  PlayerSummaryResponse = Type.Object({
    displayName: Type.String(),
    id: Type.String({ format: "uuid" }),
    rotationId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    // Phase 16: slug field (additive).
    slug: Type.String(),
    stats: PlayerStatsResponse,
  }),
  PlayerProfileResponse = Type.Intersect([
    PlayerSummaryResponse,
    Type.Object({
      aliases: Type.Array(Type.String()),
      // Phase 16: provenance (additive, singular response — T-16-07 HIST-03).
      provenance: ProvenanceResponse,
      steamIds: Type.Array(Type.String()),
    }),
  ]),
  PlayerListResponse = paginated(PlayerSummaryResponse),
  // PARITY-06: Extended with kdRatio/totalScore/totalPlayedGames (byte-identical
  // to SQUAD_STATS_SQL semantics via parity-formulas).
  SquadStatsResponse = Type.Object({
    deaths: Type.Object({
      byTeamkills: Type.Number(),
      total: Type.Number(),
    }),
    kdRatio: Type.Number(),
    kills: Type.Number(),
    playerCount: Type.Number(),
    replayCount: Type.Number(),
    teamkills: Type.Number(),
    totalPlayedGames: Type.Number(),
    totalScore: Type.Number(),
  }),
  SquadSummaryResponse = Type.Object({
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    rotationId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    // Phase 16: slug field (additive).
    slug: Type.String(),
    stats: SquadStatsResponse,
  }),
  SquadProfileResponse = Type.Intersect([
    SquadSummaryResponse,
    Type.Object({
      players: Type.Array(
        Type.Object({
          displayName: Type.String(),
          id: Type.String({ format: "uuid" }),
        }),
      ),
      // Phase 16: provenance (additive, singular response — HIST-03).
      provenance: ProvenanceResponse,
    }),
  ]),
  SquadListResponse = paginated(SquadSummaryResponse),
  // PARITY-06: Squad sub-resource surfaces — deterministic member-level
  // aggregations (sum over squad members). Not byte-identical to a legacy
  // squad-level formula (none exists for these surfaces — 15-CONTEXT Q3).
  // Relationship targets carry only { id, displayName } — no Steam64 (SEC-01/02).
  SquadWeaponsResponse = Type.Object({
    firearms: Type.Array(PlayerWeaponEntry),
    // Phase 16: provenance (additive, singular parity surface).
    provenance: ProvenanceResponse,
    vehicles: Type.Array(PlayerWeaponEntry),
  }),
  SquadRelationshipEntry = Type.Object({
    count: Type.Number(),
    // See PlayerRelationshipEntry: the relationship target id is an opaque
    // player identifier (may be a non-canonical name/ref), not a UUID.
    player: Type.Object({
      displayName: Type.String(),
      id: Type.String(),
    }),
  }),
  SquadRelationshipsResponse = Type.Object({
    killed: Type.Array(SquadRelationshipEntry),
    killers: Type.Array(SquadRelationshipEntry),
    // Phase 16: provenance (additive, singular parity surface).
    provenance: ProvenanceResponse,
    teamkilled: Type.Array(SquadRelationshipEntry),
    teamkillers: Type.Array(SquadRelationshipEntry),
  }),
  SquadWeeklyResponse = Type.Object({
    // Reuses PlayerWeekBucket form: weekly buckets summed over squad members,
    // including totalPlayedGames per bucket.
    // Phase 16: provenance (additive, singular parity surface).
    provenance: ProvenanceResponse,
    weeks: Type.Array(PlayerWeekBucket),
  }),
  PlayerReferenceResponse = Type.Object({
    displayName: Type.String(),
    id: Type.String({ format: "uuid" }),
  }),
  // Phase 16: rotation detail (summary + provenance). No UuidParameters — uses SlugOrUuidParameters.
  RotationDetailResponse = Type.Intersect([
    RotationSummaryResponse,
    Type.Object({ provenance: ProvenanceResponse }),
  ]),
  // Phase 16: history counterpart refs (T-16-07 — no Steam64 in any counterpart).
  SquadReferenceResponse = Type.Object({
    id: Type.String(),
    name: Type.String(),
    slug: Type.String(),
  }),
  PlayerReferenceSlugResponse = Type.Object({
    displayName: Type.String(),
    id: Type.String(),
    slug: Type.String(),
  }),
  // Phase 16: discriminated-union history entry schemas.
  NameHistoryEntry = Type.Union([
    Type.Object({
      from: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
      kind: Type.Literal("alias"),
      nickname: Type.String(),
      sourceReplayId: Type.Union([
        Type.String({ format: "uuid" }),
        Type.Null(),
      ]),
      to: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    }),
    Type.Object({
      from: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
      kind: Type.Literal("unknown-gap"),
      to: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    }),
  ]),
  PlayerMembershipHistoryEntry = Type.Union([
    Type.Object({
      from: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
      kind: Type.Literal("membership"),
      squad: SquadReferenceResponse,
      to: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    }),
    Type.Object({
      from: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
      kind: Type.Literal("unknown-gap"),
      to: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    }),
  ]),
  SquadMembershipHistoryEntry = Type.Union([
    Type.Object({
      from: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
      kind: Type.Literal("membership"),
      player: PlayerReferenceSlugResponse,
      to: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    }),
    Type.Object({
      from: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
      kind: Type.Literal("unknown-gap"),
      to: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    }),
  ]),
  // Phase 16: history response wrappers (entries + provenance).
  NameHistoryResponse = Type.Object({
    entries: Type.Array(NameHistoryEntry),
    provenance: ProvenanceResponse,
  }),
  PlayerMembershipHistoryResponse = Type.Object({
    entries: Type.Array(PlayerMembershipHistoryEntry),
    provenance: ProvenanceResponse,
  }),
  SquadMembershipHistoryResponse = Type.Object({
    entries: Type.Array(SquadMembershipHistoryEntry),
    provenance: ProvenanceResponse,
  }),
  CommanderSideResponse = Type.Object({
    knownLosses: Type.Number(),
    knownWins: Type.Number(),
    player: Type.Union([PlayerReferenceResponse, Type.Null()]),
    rotationId: Type.String({ format: "uuid" }),
    side: Type.String(),
    unknownOutcomes: Type.Number(),
  }),
  BountySummaryResponse = Type.Object({
    player: PlayerReferenceResponse,
    points: Type.Number(),
    rotationId: Type.String({ format: "uuid" }),
  }),
  BountyListResponse = paginated(BountySummaryResponse),
  LeaderboardsResponse = Type.Object({
    bounty: paginated(BountySummaryResponse),
    playersByKills: paginated(PlayerSummaryResponse),
    rotationId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    squadsByKills: paginated(SquadSummaryResponse),
  }),
  OverviewResponse = Type.Object({
    filters: Type.Object({
      rotationId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    }),
    totals: Type.Object({
      bountyPlayers: Type.Number(),
      commanderSides: Type.Number(),
      parsedReplays: Type.Number(),
      players: Type.Number(),
      playerStatRows: Type.Number(),
      replays: Type.Number(),
      squads: Type.Number(),
      squadStatRows: Type.Number(),
    }),
  }),
  NotFoundResponse = Type.Object({ message: Type.String() });

// Phase 17: new schema Static<> exports.
export type ReplayListQueryType = Static<typeof ReplayListQuery>;
export type ReplayEventsQueryType = Static<typeof ReplayEventsQuery>;
export type ReplaySummaryResponseType = Static<typeof ReplaySummaryResponse>;
export type ReplayListResponseType = Static<typeof ReplayListResponse>;
export type ReplayDetailResponseType = Static<typeof ReplayDetailResponse>;
export type ReplayEventResponseType = Static<typeof ReplayEventResponse>;
export type ReplayEventsResponseType = Static<typeof ReplayEventsResponse>;

// Phase 16: new schema Static<> exports.
export type SlugOrUuidParametersType = Static<typeof SlugOrUuidParameters>;
export type RotationDetailResponseType = Static<typeof RotationDetailResponse>;
export type NameHistoryResponseType = Static<typeof NameHistoryResponse>;
export type PlayerMembershipHistoryResponseType = Static<
  typeof PlayerMembershipHistoryResponse
>;
export type SquadMembershipHistoryResponseType = Static<
  typeof SquadMembershipHistoryResponse
>;
export type PlayerWeaponsResponseType = Static<typeof PlayerWeaponsResponse>;
export type PlayerVehiclesResponseType = Static<typeof PlayerVehiclesResponse>;
export type PlayerRelationshipsResponseType = Static<
  typeof PlayerRelationshipsResponse
>;
export type PlayerWeeklyResponseType = Static<typeof PlayerWeeklyResponse>;
export type SquadWeaponsResponseType = Static<typeof SquadWeaponsResponse>;
export type SquadRelationshipsResponseType = Static<
  typeof SquadRelationshipsResponse
>;
export type SquadWeeklyResponseType = Static<typeof SquadWeeklyResponse>;
export type UuidParametersType = Static<typeof UuidParameters>;
export type PlayerDetailQueryType = Static<typeof PlayerDetailQuery>;
export type PlayerListQueryType = Static<typeof PlayerListQuery>;
export type SquadDetailQueryType = Static<typeof SquadDetailQuery>;
export type SquadListQueryType = Static<typeof SquadListQuery>;
export type BountyListQueryType = Static<typeof BountyListQuery>;
export type LeaderboardQueryType = Static<typeof LeaderboardQuery>;
export type OverviewQueryType = Static<typeof RotationQuery>;

export function paginated<T extends ReturnType<typeof Type.Object>>(item: T) {
  return Type.Object({
    hasMore: Type.Boolean(),
    items: Type.Array(item),
    nextCursor: Type.Union([Type.String(), Type.Null()]),
  });
}
