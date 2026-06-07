export interface PublicStatsReadModel {
  getLeaderboards(filters: LeaderboardFilters): Promise<PublicLeaderboards>;
  getPlayer(
    id: string,
    filters: RotationFilters,
  ): Promise<PlayerProfile | null>;
  getPlayerRelationships(
    id: string,
  ): Promise<PlayerRelationshipsPayload | null>;
  getPlayerVehicles(id: string): Promise<PlayerVehiclesPayload | null>;
  getPlayerWeapons(id: string): Promise<PlayerWeaponsPayload | null>;
  getPlayerWeekly(id: string): Promise<PlayerWeeklyPayload | null>;
  getOverview(filters: OverviewFilters): Promise<StatsOverview>;
  getSquad(id: string, filters: RotationFilters): Promise<SquadProfile | null>;
  // PARITY-06: Squad sub-resource surfaces — member-level aggregations.
  getSquadRelationships(id: string): Promise<SquadRelationshipsPayload | null>;
  getSquadWeapons(id: string): Promise<SquadWeaponsPayload | null>;
  getSquadWeekly(id: string): Promise<SquadWeeklyPayload | null>;
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
  bountyAfter?: PageCursorState;
  playersAfter?: PageCursorState;
  squadsAfter?: PageCursorState;
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

export interface PageCursorState {
  value: number | string | null;
  id: string;
}

export interface PageQuery {
  sort: string;
  order: "asc" | "desc";
  limit: number;
  after?: PageCursorState;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
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
  kdRatio: number;
  kills: number;
  replayCount: number;
  teamkills: number;
  totalPlayedGames: number;
  totalScore: number;
}

export interface PlayerWeaponEntry {
  kills: number;
  name: string;
}

export interface PlayerWeaponsPayload {
  firearms: PlayerWeaponEntry[];
  vehicles: PlayerWeaponEntry[];
}

export interface PlayerVehiclesPayload {
  killsFromVehicle: number;
  killsFromVehicleCoef: number;
  vehicleKills: number;
  vehicles: PlayerWeaponEntry[];
}

export interface PlayerRelationshipEntry {
  count: number;
  player: {
    displayName: string;
    id: string;
  };
}

export interface PlayerRelationshipsPayload {
  killed: PlayerRelationshipEntry[];
  killers: PlayerRelationshipEntry[];
  teamkilled: PlayerRelationshipEntry[];
  teamkillers: PlayerRelationshipEntry[];
}

export interface PlayerWeekBucket {
  deaths: {
    byTeamkills: number;
    total: number;
  };
  endDate: string;
  kdRatio: number;
  killsFromVehicle: number;
  killsFromVehicleCoef: number;
  kills: number;
  score: number;
  startDate: string;
  teamkills: number;
  totalPlayedGames: number;
  vehicleKills: number;
  week: string;
}

export interface PlayerWeeklyPayload {
  weeks: PlayerWeekBucket[];
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

// PARITY-06: Extended with kdRatio/totalScore/totalPlayedGames, byte-identical
// to SQUAD_STATS_SQL semantics computed via parity-formulas.
export interface SquadStatsPayload {
  deaths: {
    byTeamkills: number;
    total: number;
  };
  kdRatio: number;
  kills: number;
  playerCount: number;
  replayCount: number;
  teamkills: number;
  totalPlayedGames: number;
  totalScore: number;
}

// PARITY-06: Squad sub-resource payload shapes. Relationship targets carry only
// { id, displayName } — no Steam64 (SEC-01/02).
export interface SquadWeaponEntry {
  kills: number;
  name: string;
}

export interface SquadWeaponsPayload {
  firearms: SquadWeaponEntry[];
  vehicles: SquadWeaponEntry[];
}

export interface SquadRelationshipEntry {
  count: number;
  player: {
    displayName: string;
    id: string;
  };
}

export interface SquadRelationshipsPayload {
  killed: SquadRelationshipEntry[];
  killers: SquadRelationshipEntry[];
  teamkilled: SquadRelationshipEntry[];
  teamkillers: SquadRelationshipEntry[];
}

export interface SquadWeeklyPayload {
  // Reuses PlayerWeekBucket form for weekly buckets summed over squad members.
  weeks: PlayerWeekBucket[];
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
  bounty: PaginatedResult<BountySummary>;
  playersByKills: PaginatedResult<PlayerSummary>;
  rotationId: string | null;
  squadsByKills: PaginatedResult<SquadSummary>;
}
