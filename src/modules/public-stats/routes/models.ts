/* eslint-disable max-lines */

// ---------------------------------------------------------------------------
// Phase 17: Replay surface types
// ---------------------------------------------------------------------------

export interface ReplayListFilters {
  rotationId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface ReplaySummary {
  id: string;
  slug: string | null;
  rotationId: string | null;
  replayTimestamp: string | null;
  sourceSystem: string;
  sourceReplayId: string;
  status: string;
}

export interface ReplaySideSummary {
  side: string;
  outcome: { status: string; winnerSide: string | null };
  isWinner: boolean | null;
  participantCount: number;
}

export interface ReplayParticipant {
  player: { id: null; slug: null; displayName: string } | { id: string; slug: string; displayName: string };
  steamId: string | null;
  kills: number;
  deaths: number;
  teamkills: number;
}

export interface ReplayDetail {
  id: string;
  slug: string | null;
  rotation: { id: string; slug: string; name: string } | null;
  replayTimestamp: string | null;
  map: string | null;
  sides: ReplaySideSummary[];
  participants: ReplayParticipant[];
  provenance: { lastUpdatedAt: string | null };
}

/**
 * Actor derived from the event payload — steam id is always the masked
 * `...NNNN` form, never a full Steam64.
 */
export interface ReplayEventActor {
  displayName: string | null;
  steamId: string | null;
}

export interface ReplayEvent {
  id: string;
  eventType: string;
  occurredAt: string | null;
  actor: ReplayEventActor | null;
  payload: Record<string, unknown>;
}

export interface PublicStatsReadModel {
  getLeaderboards(filters: LeaderboardFilters): Promise<PublicLeaderboards>;
  getOverview(filters: OverviewFilters): Promise<StatsOverview>;
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
  // Phase 16: history sub-resources.
  getPlayerNameHistory(id: string): Promise<NameHistoryPayload | null>;
  getPlayerMembershipHistory(
    id: string,
  ): Promise<PlayerMembershipHistoryPayload | null>;
  // Phase 16: rotation detail (slug-or-uuid resolved by repository).
  getRotation(id: string): Promise<RotationDetail | null>;
  getSquad(id: string, filters: RotationFilters): Promise<SquadProfile | null>;
  // PARITY-06: Squad sub-resource surfaces — member-level aggregations.
  getSquadRelationships(id: string): Promise<SquadRelationshipsPayload | null>;
  // Phase 16: history sub-resources (continued).
  getSquadMembershipHistory(
    id: string,
  ): Promise<SquadMembershipHistoryPayload | null>;
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
  // Phase 17: replay list + detail + events.
  listReplays(
    filters: ReplayListFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<ReplaySummary>>;
  getReplay(id: string): Promise<ReplayDetail | null>;
  /**
   * Returns null when the replay does not resolve (→ 404); a resolved replay
   * with zero events returns an empty page.
   */
  getReplayEvents(
    id: string,
    page: PageQuery,
  ): Promise<PaginatedResult<ReplayEvent> | null>;
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
  // Phase 16: slug field (additive).
  slug: string;
  startsAt: string;
}

// Phase 16: rotation detail — summary + provenance envelope (HIST-03).
export interface RotationDetail extends RotationSummary {
  provenance: { lastUpdatedAt: string | null };
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
  // Phase 16: provenance (additive, singular parity surface).
  provenance: { lastUpdatedAt: string | null };
  vehicles: PlayerWeaponEntry[];
}

export interface PlayerVehiclesPayload {
  killsFromVehicle: number;
  killsFromVehicleCoef: number;
  // Phase 16: provenance (additive, singular parity surface).
  provenance: { lastUpdatedAt: string | null };
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
  // Phase 16: provenance (additive, singular parity surface).
  provenance: { lastUpdatedAt: string | null };
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
  // Phase 16: provenance (additive, singular parity surface).
  provenance: { lastUpdatedAt: string | null };
  weeks: PlayerWeekBucket[];
}

export interface PlayerSummary {
  displayName: string;
  id: string;
  rotationId: string | null;
  // Phase 16: slug field (additive).
  slug: string;
  stats: PlayerStatsPayload;
}

export interface PlayerProfile extends PlayerSummary {
  aliases: string[];
  // Phase 16: provenance envelope (HIST-03).
  provenance: { lastUpdatedAt: string | null };
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
  // Phase 16: provenance (additive, singular parity surface).
  provenance: { lastUpdatedAt: string | null };
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
  // Phase 16: provenance (additive, singular parity surface).
  provenance: { lastUpdatedAt: string | null };
  teamkilled: SquadRelationshipEntry[];
  teamkillers: SquadRelationshipEntry[];
}

export interface SquadWeeklyPayload {
  // Reuses PlayerWeekBucket form for weekly buckets summed over squad members.
  // Phase 16: provenance (additive, singular parity surface).
  provenance: { lastUpdatedAt: string | null };
  weeks: PlayerWeekBucket[];
}

export interface SquadSummary {
  id: string;
  name: string;
  rotationId: string | null;
  // Phase 16: slug field (additive).
  slug: string;
  stats: SquadStatsPayload;
}

export interface SquadProfile extends SquadSummary {
  players: {
    displayName: string;
    id: string;
  }[];
  // Phase 16: provenance envelope (HIST-03).
  provenance: { lastUpdatedAt: string | null };
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

// Phase 16: history counterpart types (T-16-07 — no Steam64 in any counterpart).
export interface SquadReference {
  id: string;
  name: string;
  slug: string;
}

export interface PlayerReferenceSlug {
  displayName: string;
  id: string;
  slug: string;
}

// Phase 16: discriminated-union history entry types (mirror of TypeBox schemas).
export type NameHistoryEntry =
  | {
      from: string | null;
      kind: "alias";
      nickname: string;
      sourceReplayId: string | null;
      to: string | null;
    }
  | { from: string | null; kind: "unknown-gap"; to: string | null };

export type PlayerMembershipHistoryEntry =
  | {
      from: string | null;
      kind: "membership";
      squad: SquadReference;
      to: string | null;
    }
  | { from: string | null; kind: "unknown-gap"; to: string | null };

export type SquadMembershipHistoryEntry =
  | {
      from: string | null;
      kind: "membership";
      player: PlayerReferenceSlug;
      to: string | null;
    }
  | { from: string | null; kind: "unknown-gap"; to: string | null };

// Phase 16: history payload wrappers.
export interface NameHistoryPayload {
  entries: NameHistoryEntry[];
  provenance: { lastUpdatedAt: string | null };
}

export interface PlayerMembershipHistoryPayload {
  entries: PlayerMembershipHistoryEntry[];
  provenance: { lastUpdatedAt: string | null };
}

export interface SquadMembershipHistoryPayload {
  entries: SquadMembershipHistoryEntry[];
  provenance: { lastUpdatedAt: string | null };
}

export interface PublicLeaderboards {
  bounty: PaginatedResult<BountySummary>;
  playersByKills: PaginatedResult<PlayerSummary>;
  rotationId: string | null;
  squadsByKills: PaginatedResult<SquadSummary>;
}
