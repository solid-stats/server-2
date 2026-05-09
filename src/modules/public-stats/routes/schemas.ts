/* eslint-disable new-cap */
import { Type, type Static } from "@sinclair/typebox";

export const PaginationQuery = Type.Object({
    page: Type.Optional(Type.Integer({ default: 1, minimum: 1 })),
    pageSize: Type.Optional(
      Type.Integer({ default: 25, maximum: 100, minimum: 1 }),
    ),
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
      limit: Type.Optional(
        Type.Integer({ default: 10, maximum: 100, minimum: 1 }),
      ),
    }),
  ]),
  RotationSummaryResponse = Type.Object({
    endsAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    startsAt: Type.String({ format: "date-time" }),
  }),
  PlayerStatsResponse = Type.Object({
    deaths: Type.Object({
      byTeamkills: Type.Number(),
      total: Type.Number(),
    }),
    kills: Type.Number(),
    replayCount: Type.Number(),
    teamkills: Type.Number(),
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
    bounty: Type.Array(BountySummaryResponse),
    playersByKills: Type.Array(PlayerSummaryResponse),
    rotationId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    squadsByKills: Type.Array(SquadSummaryResponse),
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
    items: Type.Array(item),
    page: Type.Number(),
    pageSize: Type.Number(),
    total: Type.Number(),
  });
}
