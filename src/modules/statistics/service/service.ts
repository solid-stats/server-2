/* eslint-disable camelcase, max-lines */
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

type PlayerCounterEvent = Extract<
  NormalizedParserEvent,
  { eventType: "player_counter" }
>;

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
      // Per-replay death tallies. Solid Games are one-life: a player can die at
      // most once per game, so death evidence is summed within the replay here
      // and then folded into the cross-replay aggregate as a capped (<=1)
      // contribution. This keeps incap/revive artifacts and duplicate kill rows
      // from inflating a player's death count beyond games-died-in semantics.
      //
      // Both the counter path (player_counter -> deaths_total/by_teamkills) and
      // the victim kill-row path tally into these maps without cross-path
      // suppression: the per-replay cap in `foldCappedDeaths` collapses any
      // double-count to a single death, so letting whichever path resolves the
      // entity record the death avoids the F13a leak where a present-but-
      // non-contributing counter (e.g. an explicit-zero deaths_total) suppressed
      // a real victim death that the counter path then failed to credit.
      replayPlayerDeaths = new Map<string, DeathStats>(),
      replaySquadDeaths = new Map<string, DeathStats>(),
      eventContext = {
        playersByEntity,
        replayPlayerDeaths,
        replaySquadDeaths,
      };

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
        applyCounterEvent(event, eventContext);
        applySquadCounterEvent(event, eventContext);
        continue;
      }
      applyAttackerEvent(event, playersByEntity, playerAggregates);
      applyVictimDeath(event, eventContext);
      applySquadEvent(event, eventContext, squadAggregates);
    }

    foldCappedDeaths(replayPlayerDeaths, playerAggregates, playerAggregate);
    foldCappedDeaths(replaySquadDeaths, squadAggregates, squadAggregate);
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

interface ReplayEventContext {
  playersByEntity: Map<string, AggregatePlayerEvidence>;
  // Per-replay, uncapped death tallies keyed by playerId / squadId. Folded into
  // the cross-replay aggregate as a capped (<=1) contribution after the replay's
  // events are processed (one-life model — see calculatePlayerAndSquadAggregates).
  replayPlayerDeaths: Map<string, DeathStats>;
  replaySquadDeaths: Map<string, DeathStats>;
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
  context: ReplayEventContext,
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
  const victim = context.playersByEntity.get(String(victimEntityId));
  if (victim === undefined) {
    return;
  }
  incrementDeaths(
    replayDeaths(context.replayPlayerDeaths, victim.playerId),
    event.eventType,
  );
}

function applySquadEvent(
  event: NormalizedParserEvent,
  context: ReplayEventContext,
  aggregates: Map<string, MutableSquadAggregate>,
): void {
  if (
    event.eventType !== "kill" &&
    event.eventType !== "teamkill" &&
    event.eventType !== "unknown_kill"
  ) {
    return;
  }

  const attacker = context.playersByEntity.get(event.observedPlayerRef);
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
  const victim = context.playersByEntity.get(String(victimEntityId));
  if (victim?.squadId !== undefined) {
    incrementDeaths(
      replayDeaths(context.replaySquadDeaths, victim.squadId),
      event.eventType,
    );
  }
}

function applyCounterEvent(
  event: PlayerCounterEvent,
  context: ReplayEventContext,
): void {
  const player = context.playersByEntity.get(event.observedPlayerRef),
    deaths = counterDeaths(event.payload);
  if (player === undefined || deaths === undefined) {
    return;
  }
  incrementDeathsByCounter(
    replayDeaths(context.replayPlayerDeaths, player.playerId),
    deaths,
  );
}

function applySquadCounterEvent(
  event: PlayerCounterEvent,
  context: ReplayEventContext,
): void {
  const player = context.playersByEntity.get(event.observedPlayerRef),
    deaths = counterDeaths(event.payload);
  if (player?.squadId === undefined || deaths === undefined) {
    return;
  }
  incrementDeathsByCounter(
    replayDeaths(context.replaySquadDeaths, player.squadId),
    deaths,
  );
}

function emptyDeaths(): DeathStats {
  return { by_teamkills: 0, total: 0 };
}

function replayDeaths(
  deaths: Map<string, DeathStats>,
  key: string,
): DeathStats {
  const existing = deaths.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = emptyDeaths();
  deaths.set(key, created);
  return created;
}

/**
 * Folds a replay's per-player (or per-squad) uncapped death tally into the
 * cross-replay aggregate as a capped contribution. Solid Games are one-life, so
 * each replay adds at most one death and at most one teamkill death; capping both
 * consistently keeps `by_teamkills` from ever exceeding `total`. Summed across
 * the replays an entity appears in, `total` equals the count of games it died in
 * (legacy "games-died-in" semantics).
 */
function foldCappedDeaths<T extends MutablePlayerAggregate>(
  replayDeathsByKey: Map<string, DeathStats>,
  aggregates: Map<string, T>,
  resolve: (aggregates: Map<string, T>, key: string) => T,
): void {
  for (const [key, deaths] of replayDeathsByKey) {
    const aggregate = resolve(aggregates, key);
    if (deaths.total > 0) {
      aggregate.deaths.total += 1;
    }
    if (deaths.by_teamkills > 0) {
      aggregate.deaths.by_teamkills += 1;
    }
  }
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

function incrementDeathsByCounter(
  deaths: DeathStats,
  counter: DeathStats,
): void {
  deaths.total += counter.total;
  deaths.by_teamkills += counter.by_teamkills;
}

function counterDeaths(
  payload: Record<string, unknown>,
): DeathStats | undefined {
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
