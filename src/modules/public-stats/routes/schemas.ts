/* eslint-disable new-cap */
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
    startsAt: Type.String({ format: "date-time" }),
  }),
  PlayerWeaponEntry = Type.Object({
    kills: Type.Number(),
    name: Type.String(),
  }),
  PlayerWeaponsResponse = Type.Object({
    firearms: Type.Array(PlayerWeaponEntry),
    vehicles: Type.Array(PlayerWeaponEntry),
  }),
  PlayerVehiclesResponse = Type.Object({
    killsFromVehicle: Type.Number(),
    killsFromVehicleCoef: Type.Number(),
    vehicleKills: Type.Number(),
    vehicles: Type.Array(PlayerWeaponEntry),
  }),
  PlayerRelationshipEntry = Type.Object({
    count: Type.Number(),
    player: Type.Object({
      displayName: Type.String(),
      id: Type.String({ format: "uuid" }),
    }),
  }),
  PlayerRelationshipsResponse = Type.Object({
    killed: Type.Array(PlayerRelationshipEntry),
    killers: Type.Array(PlayerRelationshipEntry),
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
    stats: PlayerStatsResponse,
  }),
  PlayerProfileResponse = Type.Intersect([
    PlayerSummaryResponse,
    Type.Object({
      aliases: Type.Array(Type.String()),
      steamIds: Type.Array(Type.String()),
    }),
  ]),
  PlayerListResponse = paginated(PlayerSummaryResponse),
  SquadStatsResponse = Type.Object({
    deaths: Type.Object({
      byTeamkills: Type.Number(),
      total: Type.Number(),
    }),
    kills: Type.Number(),
    playerCount: Type.Number(),
    replayCount: Type.Number(),
    teamkills: Type.Number(),
  }),
  SquadSummaryResponse = Type.Object({
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    rotationId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
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
    }),
  ]),
  SquadListResponse = paginated(SquadSummaryResponse),
  PlayerReferenceResponse = Type.Object({
    displayName: Type.String(),
    id: Type.String({ format: "uuid" }),
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

export type PlayerWeaponsResponseType = Static<typeof PlayerWeaponsResponse>;
export type PlayerVehiclesResponseType = Static<typeof PlayerVehiclesResponse>;
export type PlayerRelationshipsResponseType = Static<
  typeof PlayerRelationshipsResponse
>;
export type PlayerWeeklyResponseType = Static<typeof PlayerWeeklyResponse>;
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
