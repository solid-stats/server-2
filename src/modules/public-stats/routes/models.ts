export interface PublicStatsReadModel {
  getLeaderboards(filters: LeaderboardFilters): Promise<PublicLeaderboards>;
  getPlayer(
    id: string,
    filters: RotationFilters,
  ): Promise<PlayerProfile | null>;
  getOverview(filters: OverviewFilters): Promise<StatsOverview>;
  getSquad(id: string, filters: RotationFilters): Promise<SquadProfile | null>;
  listBounty(
    filters: RotationFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<BountySummary>>;
  listCommanderSides(filters: RotationFilters): Promise<CommanderSideSummary[]>;
  listPlayers(
    filters: PlayerListFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<PlayerSummary>>;
  listRotations(): Promise<RotationSummary[]>;
  listSquads(
    filters: SquadListFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<SquadSummary>>;
}

export interface PublicStatsRouteOptions {
  readModel: PublicStatsReadModel;
}

export interface OverviewFilters {
  rotationId?: string;
}

export interface RotationFilters {
  rotationId?: string;
}

export interface PlayerListFilters extends RotationFilters {
  search?: string;
}

export interface SquadListFilters extends RotationFilters {
  search?: string;
}

export interface LeaderboardFilters extends RotationFilters {
  limit: number;
}

export interface StatsOverview {
  filters: {
    rotationId: string | null;
  };
  totals: {
    bountyPlayers: number;
    commanderSides: number;
    parsedReplays: number;
    players: number;
    playerStatRows: number;
    replays: number;
    squads: number;
    squadStatRows: number;
  };
}

export interface PageQuery {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> extends PageQuery {
  items: T[];
  total: number;
}

export interface RotationSummary {
  endsAt: string | null;
  id: string;
  name: string;
  startsAt: string;
}

export interface PlayerStatsPayload {
  deaths: {
    byTeamkills: number;
    total: number;
  };
  kills: number;
  replayCount: number;
  teamkills: number;
}

export interface PlayerSummary {
  displayName: string;
  id: string;
  rotationId: string | null;
  stats: PlayerStatsPayload;
}

export interface PlayerProfile extends PlayerSummary {
  aliases: string[];
  steamIds: string[];
}

export interface SquadStatsPayload {
  deaths: {
    byTeamkills: number;
    total: number;
  };
  kills: number;
  playerCount: number;
  replayCount: number;
  teamkills: number;
}

export interface SquadSummary {
  id: string;
  name: string;
  rotationId: string | null;
  stats: SquadStatsPayload;
}

export interface SquadProfile extends SquadSummary {
  players: {
    displayName: string;
    id: string;
  }[];
}

export interface PublicPlayerReference {
  displayName: string;
  id: string;
}

export interface CommanderSideSummary {
  knownLosses: number;
  knownWins: number;
  player: PublicPlayerReference | null;
  rotationId: string;
  side: string;
  unknownOutcomes: number;
}

export interface BountySummary {
  player: PublicPlayerReference;
  points: number;
  rotationId: string;
}

export interface PublicLeaderboards {
  bounty: BountySummary[];
  playersByKills: PlayerSummary[];
  rotationId: string | null;
  squadsByKills: SquadSummary[];
}
