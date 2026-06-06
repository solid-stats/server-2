/* eslint-disable camelcase, max-lines */
import {
  kdRatio,
  killsFromVehicleCoef,
  round,
  totalScore,
  weeklyScore,
} from "../parity-formulas.js";

export {
  kdRatio,
  killsFromVehicleCoef,
  totalScore,
  weeklyScore,
} from "../parity-formulas.js";

export const LEGACY_PUBLIC_EXPORT_CONTRACT_VERSION =
  "legacy-public-export.v1" as const;

export const LEGACY_PUBLIC_EXPORT_COMMAND_VERSION = 1;

export interface LegacyPublicStatsExportRepository {
  loadExportData(): Promise<LegacyPublicStatsExportData>;
}

export interface LegacyPublicStatsExportData {
  otherPlayers: LegacyOtherPlayersInput[];
  playerGlobalStats: LegacyPlayerStatsInput[];
  rotationStats: LegacyRotationStatsInput[];
  sourceDatabase: string;
  squadStats: LegacySquadStatsInput[];
  weapons: LegacyWeaponsInput[];
  weeks: LegacyWeeksInput[];
}

export interface LegacyPlayerStatsInput {
  deathsByTeamkills: number;
  deathsTotal: number;
  id: string;
  isShow?: boolean;
  kills: number;
  killsFromVehicle: number;
  lastPlayedGameDate: string | null;
  lastSquadPrefix: string | null;
  name: string;
  teamkills: number;
  totalPlayedGames: number;
  vehicleKills: number;
}

export interface LegacySquadStatsInput {
  deathsByTeamkills: number;
  deathsTotal: number;
  id: string;
  kills: number;
  name: string;
  players: LegacyPlayerStatsInput[];
  teamkills: number;
  totalPlayedGames: number;
  totalPlayers: number;
}

export interface LegacyRotationStatsInput {
  endDate: string | null;
  id: string;
  name: string;
  players: LegacyPlayerStatsInput[];
  squads: LegacySquadStatsInput[];
  startDate: string;
  totalGames: number;
}

export interface LegacyOtherPlayersInput {
  killed: LegacyRelationshipInput[];
  killers: LegacyRelationshipInput[];
  player: LegacyPlayerReference;
  teamkilled: LegacyRelationshipInput[];
  teamkillers: LegacyRelationshipInput[];
}

export interface LegacyRelationshipInput {
  count: number;
  id: string;
  name: string;
}

export interface LegacyWeaponsInput {
  firearms: LegacyWeaponInput[];
  player: LegacyPlayerReference;
  vehicles: LegacyWeaponInput[];
}

export interface LegacyWeaponInput {
  kills: number;
  name: string;
}

export interface LegacyWeeksInput {
  player: LegacyPlayerReference;
  weeks: LegacyWeekInput[];
}

export interface LegacyWeekInput {
  deathsByTeamkills: number;
  deathsTotal: number;
  endDate: string;
  kills: number;
  killsFromVehicle: number;
  startDate: string;
  teamkills: number;
  totalPlayedGames: number;
  vehicleKills: number;
  week: string;
}

export interface LegacyPlayerReference {
  id: string;
  name: string;
}

export interface LegacyPublicStatsExportOptions {
  corpusScope: string;
  generatedAt: Date;
}

export interface LegacyPublicStatsExport {
  metadata: {
    commandVersion: number;
    contractVersion: typeof LEGACY_PUBLIC_EXPORT_CONTRACT_VERSION;
    corpusScope: string;
    generatedAt: string;
    sourceDatabase: string;
    totals: {
      otherPlayers: number;
      players: number;
      rotations: number;
      squads: number;
      weapons: number;
      weeks: number;
    };
  };
  other_players: LegacyOtherPlayersExport[];
  players: LegacyPlayerStatsExport[];
  rotations: LegacyRotationStatsExport[];
  squads: LegacySquadStatsExport[];
  weapons: LegacyWeaponsExport[];
  weeks: LegacyWeeksExport[];
}

export interface LegacyPlayerStatsExport {
  deaths: {
    byTeamkills: number;
    total: number;
  };
  id: string;
  isShow: boolean;
  kdRatio: number;
  killed: LegacyRelationshipInput[];
  killers: LegacyRelationshipInput[];
  kills: number;
  killsFromVehicle: number;
  killsFromVehicleCoef: number;
  lastPlayedGameDate: string | null;
  lastSquadPrefix: string | null;
  name: string;
  teamkilled: LegacyRelationshipInput[];
  teamkillers: LegacyRelationshipInput[];
  teamkills: number;
  totalPlayedGames: number;
  totalScore: number;
  vehicleKills: number;
}

export interface LegacySquadStatsExport {
  averageKills: number;
  averagePlayersCount: number;
  averageTeamkills: number;
  deaths: {
    byTeamkills: number;
    total: number;
  };
  id: string;
  kills: number;
  name: string;
  players: LegacyPlayerStatsExport[];
  score: number;
  teamkills: number;
}

export interface LegacyRotationStatsExport {
  endDate: string | null;
  id: string;
  name: string;
  players: LegacyPlayerStatsExport[];
  squads: LegacySquadStatsExport[];
  startDate: string;
  totalGames: number;
}

export type LegacyOtherPlayersExport = LegacyOtherPlayersInput;

export type LegacyWeaponsExport = LegacyWeaponsInput;

export interface LegacyWeeksExport {
  player: LegacyPlayerReference;
  weeks: LegacyWeekExport[];
}

export interface LegacyWeekExport {
  deaths: {
    byTeamkills: number;
    total: number;
  };
  endDate: string;
  kdRatio: number;
  kills: number;
  killsFromVehicle: number;
  killsFromVehicleCoef: number;
  score: number;
  startDate: string;
  teamkills: number;
  totalPlayedGames: number;
  vehicleKills: number;
  week: string;
}

export class LegacyPublicStatsExportService {
  public constructor(
    private readonly repository: LegacyPublicStatsExportRepository,
  ) {}

  public async export(
    options: LegacyPublicStatsExportOptions,
  ): Promise<LegacyPublicStatsExport> {
    const data = await this.repository.loadExportData(),
      otherPlayers = sortOtherPlayers(data.otherPlayers),
      weapons = sortWeapons(data.weapons),
      weeks = sortWeeks(data.weeks),
      players = sortPlayers(data.playerGlobalStats).map((player) =>
        playerExport(player, relationshipsForPlayer(otherPlayers, player.id)),
      ),
      squads = sortSquads(data.squadStats).map((squad) =>
        squadExport(squad, otherPlayers),
      ),
      rotations = sortRotations(data.rotationStats).map((rotation) =>
        rotationExport(rotation, otherPlayers),
      );

    return {
      metadata: {
        commandVersion: LEGACY_PUBLIC_EXPORT_COMMAND_VERSION,
        contractVersion: LEGACY_PUBLIC_EXPORT_CONTRACT_VERSION,
        corpusScope: options.corpusScope,
        generatedAt: options.generatedAt.toISOString(),
        sourceDatabase: data.sourceDatabase,
        totals: {
          otherPlayers: otherPlayers.length,
          players: players.length,
          rotations: rotations.length,
          squads: squads.length,
          weapons: weapons.length,
          weeks: weeks.length,
        },
      },
      other_players: otherPlayers,
      players,
      rotations,
      squads,
      weapons,
      weeks,
    };
  }
}

function playerExport(
  input: LegacyPlayerStatsInput,
  relationships: LegacyOtherPlayersInput | undefined,
): LegacyPlayerStatsExport {
  return {
    deaths: deaths(input),
    id: input.id,
    isShow: input.isShow ?? true,
    kdRatio: kdRatio(input.kills, input.deathsTotal),
    killed: sortRelationships(relationships?.killed ?? []),
    killers: sortRelationships(relationships?.killers ?? []),
    kills: input.kills,
    killsFromVehicle: input.killsFromVehicle,
    killsFromVehicleCoef: killsFromVehicleCoef(
      input.killsFromVehicle,
      input.kills,
    ),
    lastPlayedGameDate: input.lastPlayedGameDate,
    lastSquadPrefix: input.lastSquadPrefix,
    name: input.name,
    teamkilled: sortRelationships(relationships?.teamkilled ?? []),
    teamkillers: sortRelationships(relationships?.teamkillers ?? []),
    teamkills: input.teamkills,
    totalPlayedGames: input.totalPlayedGames,
    totalScore: totalScore(input.kills, input.teamkills),
    vehicleKills: input.vehicleKills,
  };
}

function squadExport(
  input: LegacySquadStatsInput,
  otherPlayers: LegacyOtherPlayersInput[],
): LegacySquadStatsExport {
  return {
    averageKills: perGame(input.kills, input.totalPlayedGames),
    averagePlayersCount: perGame(input.totalPlayers, input.totalPlayedGames),
    averageTeamkills:
      input.kills === 0 ? 0 : round(input.teamkills / input.kills),
    deaths: deaths(input),
    id: input.id,
    kills: input.kills,
    name: input.name,
    players: sortPlayers(input.players).map((player) =>
      playerExport(player, relationshipsForPlayer(otherPlayers, player.id)),
    ),
    score: perGame(
      totalScore(input.kills, input.teamkills),
      input.totalPlayedGames,
    ),
    teamkills: input.teamkills,
  };
}

function rotationExport(
  input: LegacyRotationStatsInput,
  otherPlayers: LegacyOtherPlayersInput[],
): LegacyRotationStatsExport {
  return {
    endDate: input.endDate,
    id: input.id,
    name: input.name,
    players: sortPlayers(input.players).map((player) =>
      playerExport(player, relationshipsForPlayer(otherPlayers, player.id)),
    ),
    squads: sortSquads(input.squads).map((squad) =>
      squadExport(squad, otherPlayers),
    ),
    startDate: input.startDate,
    totalGames: input.totalGames,
  };
}

export function weekExport(input: LegacyWeekInput): LegacyWeekExport {
  return {
    deaths: {
      byTeamkills: input.deathsByTeamkills,
      total: input.deathsTotal,
    },
    endDate: input.endDate,
    kdRatio: kdRatio(input.kills, input.deathsTotal),
    kills: input.kills,
    killsFromVehicle: input.killsFromVehicle,
    killsFromVehicleCoef: killsFromVehicleCoef(
      input.killsFromVehicle,
      input.kills,
    ),
    score: weeklyScore(input.kills, input.teamkills, input.totalPlayedGames),
    startDate: input.startDate,
    teamkills: input.teamkills,
    totalPlayedGames: input.totalPlayedGames,
    vehicleKills: input.vehicleKills,
    week: input.week,
  };
}

function sortPlayers<T extends LegacyPlayerStatsInput>(players: T[]): T[] {
  return players.toSorted(
    (left, right) =>
      compareNumbers(right.kills, left.kills) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  );
}

function sortSquads<T extends LegacySquadStatsInput>(squads: T[]): T[] {
  return squads.toSorted(
    (left, right) =>
      compareNumbers(right.kills, left.kills) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  );
}

function sortRotations(
  rotations: LegacyRotationStatsInput[],
): LegacyRotationStatsInput[] {
  return rotations.toSorted(
    (left, right) =>
      left.startDate.localeCompare(right.startDate) ||
      left.id.localeCompare(right.id),
  );
}

function sortOtherPlayers(
  otherPlayers: LegacyOtherPlayersInput[],
): LegacyOtherPlayersExport[] {
  return otherPlayers
    .toSorted((left, right) =>
      comparePlayerReferences(left.player, right.player),
    )
    .map((entry) => ({
      killed: sortRelationships(entry.killed),
      killers: sortRelationships(entry.killers),
      player: entry.player,
      teamkilled: sortRelationships(entry.teamkilled),
      teamkillers: sortRelationships(entry.teamkillers),
    }));
}

export function sortRelationships(
  relationships: LegacyRelationshipInput[],
): LegacyRelationshipInput[] {
  return relationships.toSorted(
    (left, right) =>
      compareNumbers(right.count, left.count) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  );
}

export function sortWeapons(
  weapons: LegacyWeaponsInput[],
): LegacyWeaponsExport[] {
  return weapons
    .toSorted((left, right) =>
      comparePlayerReferences(left.player, right.player),
    )
    .map((entry) => ({
      firearms: sortWeaponInputs(entry.firearms),
      player: entry.player,
      vehicles: sortWeaponInputs(entry.vehicles),
    }));
}

function sortWeaponInputs(weapons: LegacyWeaponInput[]): LegacyWeaponInput[] {
  return weapons.toSorted(
    (left, right) =>
      compareNumbers(right.kills, left.kills) ||
      left.name.localeCompare(right.name),
  );
}

export function sortWeeks(weeks: LegacyWeeksInput[]): LegacyWeeksExport[] {
  return weeks
    .toSorted((left, right) =>
      comparePlayerReferences(left.player, right.player),
    )
    .map((entry) => ({
      player: entry.player,
      weeks: entry.weeks
        .toSorted((left, right) => right.week.localeCompare(left.week))
        .map((week) => weekExport(week)),
    }));
}

function relationshipsForPlayer(
  otherPlayers: LegacyOtherPlayersInput[],
  playerId: string,
): LegacyOtherPlayersInput | undefined {
  return otherPlayers.find((entry) => entry.player.id === playerId);
}

function deaths(input: {
  deathsByTeamkills: number;
  deathsTotal: number;
}): LegacyPlayerStatsExport["deaths"] {
  return {
    byTeamkills: input.deathsByTeamkills,
    total: input.deathsTotal,
  };
}

function comparePlayerReferences(
  left: LegacyPlayerReference,
  right: LegacyPlayerReference,
): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function compareNumbers(left: number, right: number): number {
  return left === right ? 0 : left - right;
}

function perGame(value: number, games: number): number {
  if (games === 0) {
    return 0;
  }
  return round(value / games);
}
