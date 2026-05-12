/* eslint-disable camelcase */
import {
  mapParserArtifact,
  type NormalizedParserEvent,
  type ParserArtifact,
} from "../parser-artifact.js";

export interface StatisticsRepository {
  replaceParserEvents(
    parserResultId: string,
    events: NormalizedParserEvent[],
  ): Promise<void>;
}

export interface AggregatePlayerEvidence {
  entityRef: string;
  playerId: string;
  squadId?: string;
}

export interface AggregateReplayInput {
  events: NormalizedParserEvent[];
  players: AggregatePlayerEvidence[];
  replayId: string;
}

export interface PlayerAggregateRow {
  playerId: string;
  stats: {
    deaths: DeathStats;
    kills: number;
    replay_count: number;
    teamkills: number;
    version: 1;
  };
}

export interface SquadAggregateRow {
  squadId: string;
  stats: {
    deaths: DeathStats;
    kills: number;
    player_count: number;
    replay_count: number;
    teamkills: number;
    version: 1;
  };
}

export interface PlayerAndSquadAggregateRows {
  playerStats: PlayerAggregateRow[];
  squadStats: SquadAggregateRow[];
}

export interface DeathStats {
  by_teamkills: number;
  total: number;
}

export class ParserArtifactPersistenceService {
  public constructor(private readonly repository: StatisticsRepository) {}

  public async persistParserArtifact(
    parserResultId: string,
    artifact: ParserArtifact,
  ): Promise<number> {
    const mapped = mapParserArtifact(artifact);
    await this.repository.replaceParserEvents(parserResultId, mapped.events);
    return mapped.events.length;
  }
}

export function calculatePlayerAndSquadAggregates(
  replays: AggregateReplayInput[],
): PlayerAndSquadAggregateRows {
  const playerAggregates = new Map<string, MutablePlayerAggregate>(),
    squadAggregates = new Map<string, MutableSquadAggregate>();

  for (const replay of replays) {
    const playersByEntity = new Map(
        replay.players.map((player) => [player.entityRef, player]),
      ),
      counterDeathRefs = new Set(
        replay.events.flatMap((event) =>
          event.eventType === "player_counter" &&
          counterDeaths(event.payload) !== undefined
            ? [event.observedPlayerRef]
            : [],
        ),
      );

    for (const player of replay.players) {
      const aggregate = playerAggregate(playerAggregates, player.playerId);
      aggregate.replayIds.add(replay.replayId);

      if (player.squadId !== undefined) {
        const squad = squadAggregate(squadAggregates, player.squadId);
        squad.playerIds.add(player.playerId);
        squad.replayIds.add(replay.replayId);
      }
    }

    for (const event of replay.events) {
      if (event.eventType === "diagnostic") {
        continue;
      }
      if (event.eventType === "player_counter") {
        applyCounterEvent(event, playersByEntity, playerAggregates);
        applySquadCounterEvent(event, playersByEntity, squadAggregates);
        continue;
      }
      applyAttackerEvent(event, playersByEntity, playerAggregates);
      applyVictimDeath(
        event,
        playersByEntity,
        playerAggregates,
        counterDeathRefs,
      );
      applySquadEvent(
        event,
        playersByEntity,
        squadAggregates,
        counterDeathRefs,
      );
    }
  }

  return {
    playerStats: [...playerAggregates.entries()]
      .map(([playerId, aggregate]) => ({
        playerId,
        stats: {
          deaths: aggregate.deaths,
          kills: aggregate.kills,
          replay_count: aggregate.replayIds.size,
          teamkills: aggregate.teamkills,
          version: 1 as const,
        },
      }))
      .toSorted((left, right) => left.playerId.localeCompare(right.playerId)),
    squadStats: [...squadAggregates.entries()]
      .map(([squadId, aggregate]) => ({
        squadId,
        stats: {
          deaths: aggregate.deaths,
          kills: aggregate.kills,
          player_count: aggregate.playerIds.size,
          replay_count: aggregate.replayIds.size,
          teamkills: aggregate.teamkills,
          version: 1 as const,
        },
      }))
      .toSorted((left, right) => left.squadId.localeCompare(right.squadId)),
  };
}

interface MutablePlayerAggregate {
  deaths: DeathStats;
  kills: number;
  replayIds: Set<string>;
  teamkills: number;
}

interface MutableSquadAggregate extends MutablePlayerAggregate {
  playerIds: Set<string>;
}

function playerAggregate(
  aggregates: Map<string, MutablePlayerAggregate>,
  playerId: string,
): MutablePlayerAggregate {
  const existing = aggregates.get(playerId);
  if (existing !== undefined) {
    return existing;
  }
  const created = {
    deaths: emptyDeaths(),
    kills: 0,
    replayIds: new Set<string>(),
    teamkills: 0,
  };
  aggregates.set(playerId, created);
  return created;
}

function squadAggregate(
  aggregates: Map<string, MutableSquadAggregate>,
  squadId: string,
): MutableSquadAggregate {
  const existing = aggregates.get(squadId);
  if (existing !== undefined) {
    return existing;
  }
  const created = {
    deaths: emptyDeaths(),
    kills: 0,
    playerIds: new Set<string>(),
    replayIds: new Set<string>(),
    teamkills: 0,
  };
  aggregates.set(squadId, created);
  return created;
}

function applyAttackerEvent(
  event: NormalizedParserEvent,
  playersByEntity: Map<string, AggregatePlayerEvidence>,
  aggregates: Map<string, MutablePlayerAggregate>,
): void {
  if (
    event.eventType !== "kill" &&
    event.eventType !== "teamkill" &&
    event.eventType !== "unknown_kill"
  ) {
    return;
  }
  const attacker = playersByEntity.get(event.observedPlayerRef);
  if (attacker === undefined) {
    return;
  }
  const aggregate = playerAggregate(aggregates, attacker.playerId);
  if (event.eventType === "kill") {
    aggregate.kills += 1;
  }
  if (event.eventType === "teamkill") {
    aggregate.teamkills += 1;
  }
}

function applyVictimDeath(
  event: NormalizedParserEvent,
  playersByEntity: Map<string, AggregatePlayerEvidence>,
  aggregates: Map<string, MutablePlayerAggregate>,
  counterDeathRefs: Set<string>,
): void {
  if (
    event.eventType !== "kill" &&
    event.eventType !== "teamkill" &&
    event.eventType !== "unknown_kill"
  ) {
    return;
  }
  const victimEntityId = event.payload["victim_entity_id"];
  if (typeof victimEntityId !== "number") {
    return;
  }
  if (counterDeathRefs.has(String(victimEntityId))) {
    return;
  }
  const victim = playersByEntity.get(String(victimEntityId));
  if (victim === undefined) {
    return;
  }
  incrementDeaths(
    playerAggregate(aggregates, victim.playerId).deaths,
    event.eventType,
  );
}

function applySquadEvent(
  event: NormalizedParserEvent,
  playersByEntity: Map<string, AggregatePlayerEvidence>,
  aggregates: Map<string, MutableSquadAggregate>,
  counterDeathRefs: Set<string>,
): void {
  if (
    event.eventType !== "kill" &&
    event.eventType !== "teamkill" &&
    event.eventType !== "unknown_kill"
  ) {
    return;
  }

  const attacker = playersByEntity.get(event.observedPlayerRef);
  if (attacker?.squadId !== undefined) {
    const aggregate = squadAggregate(aggregates, attacker.squadId);
    if (event.eventType === "kill") {
      aggregate.kills += 1;
    }
    if (event.eventType === "teamkill") {
      aggregate.teamkills += 1;
    }
  }

  const victimEntityId = event.payload["victim_entity_id"];
  if (typeof victimEntityId !== "number") {
    return;
  }
  if (counterDeathRefs.has(String(victimEntityId))) {
    return;
  }
  const victim = playersByEntity.get(String(victimEntityId));
  if (victim?.squadId !== undefined) {
    incrementDeaths(
      squadAggregate(aggregates, victim.squadId).deaths,
      event.eventType,
    );
  }
}

function applyCounterEvent(
  event: NormalizedParserEvent,
  playersByEntity: Map<string, AggregatePlayerEvidence>,
  aggregates: Map<string, MutablePlayerAggregate>,
): void {
  if (event.eventType !== "player_counter") {
    return;
  }
  const player = playersByEntity.get(event.observedPlayerRef),
    deaths = counterDeaths(event.payload);
  if (player === undefined || deaths === undefined) {
    return;
  }
  incrementDeathsByCounter(playerAggregate(aggregates, player.playerId).deaths, deaths);
}

function applySquadCounterEvent(
  event: NormalizedParserEvent,
  playersByEntity: Map<string, AggregatePlayerEvidence>,
  aggregates: Map<string, MutableSquadAggregate>,
): void {
  if (event.eventType !== "player_counter") {
    return;
  }
  const player = playersByEntity.get(event.observedPlayerRef),
    deaths = counterDeaths(event.payload);
  if (player?.squadId === undefined || deaths === undefined) {
    return;
  }
  incrementDeathsByCounter(squadAggregate(aggregates, player.squadId).deaths, deaths);
}

function emptyDeaths(): DeathStats {
  return { by_teamkills: 0, total: 0 };
}

function incrementDeaths(
  deaths: DeathStats,
  eventType: "kill" | "teamkill" | "unknown_kill",
): void {
  deaths.total += 1;
  if (eventType === "teamkill") {
    deaths.by_teamkills += 1;
  }
}

function incrementDeathsByCounter(deaths: DeathStats, counter: DeathStats): void {
  deaths.total += counter.total;
  deaths.by_teamkills += counter.by_teamkills;
}

function counterDeaths(payload: Record<string, unknown>): DeathStats | undefined {
  const total = nonNegativeCounter(payload["deaths_total"]),
    byTeamkills = nonNegativeCounter(payload["deaths_by_teamkills"]);
  if (total === undefined && byTeamkills === undefined) {
    return undefined;
  }
  return {
    by_teamkills: byTeamkills ?? 0,
    total: Math.max(total ?? 0, byTeamkills ?? 0),
  };
}

function nonNegativeCounter(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}
