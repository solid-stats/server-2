/* eslint-disable max-lines, unicorn/no-null */
import {
  calculateBountyPoints,
  type BountyEffectivenessInput,
  type BountyKillInput,
  type BountyPointRow,
  type PreviousBountyStats,
} from "../bounty/bounty.js";
import {
  calculateCommanderSideAggregates,
  type CommanderReplayInput,
} from "../service/commander.js";
import {
  calculatePlayerAndSquadAggregates,
  type AggregatePlayerEvidence,
  type AggregateReplayInput,
  type PlayerAndSquadAggregateRows,
} from "../service/service.js";

import type {
  NormalizedParserEvent,
  ParserArtifact,
} from "../parser-artifact.js";
import type { Pool, PoolClient } from "pg";

export interface AggregateRecalculationResult {
  playerStats: number;
  rotationId: string | null;
  squadStats: number;
  status: "recalculated" | "missing_replay_timestamp" | "missing_rotation";
}

export interface CommanderRecalculationResult {
  commanderStats: number;
  rotationId: string | null;
  status: "recalculated" | "missing_replay_timestamp" | "missing_rotation";
}

export interface BountyRecalculationResult {
  bountyRows: number;
  rotationId: string | null;
  status: "recalculated" | "missing_replay_timestamp" | "missing_rotation";
}

export interface RotationAggregateRecalculationResult {
  playerStats: number;
  squadStats: number;
}

export interface RotationCommanderRecalculationResult {
  commanderStats: number;
}

export interface RotationBountyRecalculationResult {
  bountyRows: number;
}

export class PgStatisticsRepository {
  public constructor(protected readonly pool: Pool) {}

  public async replaceParserEvents(
    parserResultId: string,
    events: NormalizedParserEvent[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await replaceParserEventsInTransaction(client, parserResultId, events);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  public async recalculatePlayerAndSquadStatsForParserResult(
    parserResultId: string,
  ): Promise<AggregateRecalculationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const rotationId = await assignReplayRotation(client, parserResultId);
      if (rotationId.status !== "assigned") {
        await client.query("commit");
        return {
          playerStats: 0,
          rotationId: null,
          squadStats: 0,
          status: rotationId.status,
        };
      }

      const aggregateRows = await loadAggregateReplayInputs(
        client,
        rotationId.rotationId,
      );
      const aggregates = calculatePlayerAndSquadAggregates(aggregateRows);
      await replaceAggregateRows(client, rotationId.rotationId, aggregates);
      await client.query("commit");
      return {
        playerStats: aggregates.playerStats.length,
        rotationId: rotationId.rotationId,
        squadStats: aggregates.squadStats.length,
        status: "recalculated",
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  public async recalculateCommanderSideStatsForParserResult(
    parserResultId: string,
  ): Promise<CommanderRecalculationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const rotationId = await assignReplayRotation(client, parserResultId);
      if (rotationId.status !== "assigned") {
        await client.query("commit");
        return {
          commanderStats: 0,
          rotationId: null,
          status: rotationId.status,
        };
      }

      const replayInputs = await loadCommanderReplayInputs(
        client,
        rotationId.rotationId,
      );
      const aggregates = calculateCommanderSideAggregates(replayInputs);
      await replaceCommanderRows(client, rotationId.rotationId, aggregates);
      await client.query("commit");
      return {
        commanderStats: aggregates.length,
        rotationId: rotationId.rotationId,
        status: "recalculated",
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  public async recalculateBountyPointsForParserResult(
    parserResultId: string,
  ): Promise<BountyRecalculationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const rotationId = await assignReplayRotation(client, parserResultId);
      if (rotationId.status !== "assigned") {
        await client.query("commit");
        return {
          bountyRows: 0,
          rotationId: null,
          status: rotationId.status,
        };
      }

      const replayInputs = await loadAggregateReplayInputs(
          client,
          rotationId.rotationId,
        ),
        previousStats = await loadPreviousBountyEffectiveness(
          client,
          rotationId.rotationId,
        ),
        bountyRows = calculateBountyPoints(
          bountyKillInputs(replayInputs),
          previousStats,
        );
      await replaceBountyRows(client, rotationId.rotationId, bountyRows);
      await client.query("commit");
      return {
        bountyRows: bountyRows.length,
        rotationId: rotationId.rotationId,
        status: "recalculated",
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  public async recalculatePlayerAndSquadStatsForRotation(
    rotationId: string,
  ): Promise<RotationAggregateRecalculationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const aggregateRows = await loadAggregateReplayInputs(client, rotationId),
        aggregates = calculatePlayerAndSquadAggregates(aggregateRows);
      await replaceAggregateRows(client, rotationId, aggregates);
      await client.query("commit");
      return {
        playerStats: aggregates.playerStats.length,
        squadStats: aggregates.squadStats.length,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  public async recalculateCommanderSideStatsForRotation(
    rotationId: string,
  ): Promise<RotationCommanderRecalculationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replayInputs = await loadCommanderReplayInputs(client, rotationId),
        aggregates = calculateCommanderSideAggregates(replayInputs);
      await replaceCommanderRows(client, rotationId, aggregates);
      await client.query("commit");
      return { commanderStats: aggregates.length };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  public async recalculateBountyPointsForRotation(
    rotationId: string,
  ): Promise<RotationBountyRecalculationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replayInputs = await loadAggregateReplayInputs(client, rotationId),
        previousStats = await loadPreviousBountyEffectiveness(
          client,
          rotationId,
        ),
        bountyRows = calculateBountyPoints(
          bountyKillInputs(replayInputs),
          previousStats,
        );
      await replaceBountyRows(client, rotationId, bountyRows);
      await client.query("commit");
      return { bountyRows: bountyRows.length };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function replaceParserEventsInTransaction(
  client: PoolClient,
  parserResultId: string,
  events: NormalizedParserEvent[],
): Promise<void> {
  await client.query("delete from parser_events where parser_result_id = $1", [
    parserResultId,
  ]);

  for (const event of events) {
    await client.query(
      `
        insert into parser_events (
          parser_result_id, event_type, observed_player_ref, payload, source_ref
        )
        values ($1, $2, $3, $4, $5)
      `,
      [
        parserResultId,
        event.eventType,
        event.observedPlayerRef,
        event.payload,
        event.sourceRef,
      ],
    );
  }
}

interface AssignRotationResult {
  rotationId: string;
  status: "assigned";
}

interface MissingRotationResult {
  status: "missing_replay_timestamp" | "missing_rotation";
}

interface ParserResultReplayRow {
  replay_id: string;
  replay_timestamp: Date | null;
}

interface RotationRow {
  id: string;
}

async function assignReplayRotation(
  client: PoolClient,
  parserResultId: string,
): Promise<AssignRotationResult | MissingRotationResult> {
  const parserResult = await client.query<ParserResultReplayRow>(
    `
      select r.id as replay_id, r.replay_timestamp
      from parser_results pr
      join replays r on r.id = pr.replay_id
      where pr.id = $1
    `,
    [parserResultId],
  );
  const [replay] = parserResult.rows;
  if (
    replay?.replay_timestamp === undefined ||
    replay.replay_timestamp === null
  ) {
    return { status: "missing_replay_timestamp" };
  }

  const rotation = await client.query<RotationRow>(
    `
      select id
      from rotations
      where starts_at <= $1
        and (ends_at is null or ends_at > $1)
      order by starts_at desc
      limit 1
    `,
    [replay.replay_timestamp],
  );
  const rotationId = rotation.rows[0]?.id;
  if (rotationId === undefined) {
    return { status: "missing_rotation" };
  }

  await client.query("update replays set rotation_id = $1 where id = $2", [
    rotationId,
    replay.replay_id,
  ]);
  return { rotationId, status: "assigned" };
}

interface RotationParserResultRow {
  id: string;
  raw_snapshot: ParserArtifact;
  replay_id: string;
  replay_timestamp: Date;
}

interface ParserEventRow {
  event_type: string;
  observed_player_ref: string | null;
  parser_result_id: string;
  payload: Record<string, unknown>;
  source_ref: Record<string, unknown>;
}

interface PlayerIdentityRow {
  display_name: string;
  nickname: string | null;
  nickname_observed_from: Date | null;
  nickname_observed_to: Date | null;
  player_id: string;
  steam_id: string | null;
}

interface SquadMembershipRow {
  player_id: string;
  squad_id: string;
}

interface PreviousRotationStatsRow {
  stats: unknown;
}

interface CommanderIdentity {
  playerId?: string;
  side: string;
}

const STEAM_ID_MATCH_PRIORITY = 3,
  ACTIVE_NICKNAME_MATCH_PRIORITY = 2,
  DISPLAY_NAME_MATCH_PRIORITY = 1;

async function loadAggregateReplayInputs(
  client: PoolClient,
  rotationId: string,
): Promise<AggregateReplayInput[]> {
  const parserResults = await client.query<RotationParserResultRow>(
    `
      select pr.id, pr.raw_snapshot, r.id as replay_id, r.replay_timestamp
      from parser_results pr
      join replays r on r.id = pr.replay_id
      where r.rotation_id = $1
        and pr.status = 'current'
      order by r.replay_timestamp, pr.created_at
    `,
    [rotationId],
  );
  const parserResultIds = parserResults.rows.map((row) => row.id);
  if (parserResultIds.length === 0) {
    return [];
  }

  const events = await loadParserEvents(client, parserResultIds),
    identities = await loadPlayerIdentities(client, parserResults.rows),
    memberships = await loadSquadMemberships(client, rotationId);

  return parserResults.rows.map((row) => ({
    events: events.get(row.id) ?? [],
    players: resolvedPlayers({
      artifact: row.raw_snapshot,
      identities,
      memberships,
      replayTimestamp: row.replay_timestamp,
    }),
    replayId: row.replay_id,
  }));
}

async function loadParserEvents(
  client: PoolClient,
  parserResultIds: string[],
): Promise<Map<string, NormalizedParserEvent[]>> {
  const events = await client.query<ParserEventRow>(
    `
      select parser_result_id, event_type, observed_player_ref, payload, source_ref
      from parser_events
      where parser_result_id = any($1::uuid[])
      order by created_at, id
    `,
    [parserResultIds],
  );
  const byResult = new Map<string, NormalizedParserEvent[]>();
  for (const row of events.rows) {
    const event = parserEventFromRow(row);
    if (event === undefined) {
      continue;
    }
    byResult.set(row.parser_result_id, [
      ...(byResult.get(row.parser_result_id) ?? []),
      event,
    ]);
  }
  return byResult;
}

function parserEventFromRow(
  row: ParserEventRow,
): NormalizedParserEvent | undefined {
  if (row.event_type === "diagnostic") {
    return {
      eventType: "diagnostic",
      observedPlayerRef: null,
      payload: row.payload,
      sourceRef: row.source_ref,
    };
  }
  if (row.event_type === "destroyed_vehicle") {
    return {
      eventType: "destroyed_vehicle",
      observedPlayerRef: row.observed_player_ref,
      payload: row.payload,
      sourceRef: row.source_ref,
    };
  }
  if (row.event_type === "player_counter") {
    if (row.observed_player_ref === null) {
      return undefined;
    }
    return {
      eventType: "player_counter",
      observedPlayerRef: row.observed_player_ref,
      payload: row.payload,
      sourceRef: row.source_ref,
    };
  }
  if (
    row.event_type === "kill" ||
    row.event_type === "teamkill" ||
    row.event_type === "unknown_kill"
  ) {
    if (row.observed_player_ref === null) {
      return undefined;
    }
    return {
      eventType: row.event_type,
      observedPlayerRef: row.observed_player_ref,
      payload: row.payload,
      sourceRef: row.source_ref,
    };
  }
  return undefined;
}

async function loadPlayerIdentities(
  client: PoolClient,
  parserResults: RotationParserResultRow[],
): Promise<PlayerIdentityRow[]> {
  await ensureNameFallbackIdentities(client, parserResults);

  const steamIds = [
      ...new Set(
        parserResults.flatMap((row) =>
          playersFromArtifact(row.raw_snapshot).flatMap((player) =>
            player.sid === undefined ? [] : [player.sid],
          ),
        ),
      ),
    ],
    names = [
      ...new Set(
        parserResults.flatMap((row) =>
          playersFromArtifact(row.raw_snapshot).map((player) => player.n),
        ),
      ),
    ];

  const identities = await client.query<PlayerIdentityRow>(
    `
      select cp.id as player_id,
             cp.display_name,
             psi.steam_id,
             pn.nickname,
             pn.observed_from as nickname_observed_from,
             pn.observed_to as nickname_observed_to
      from canonical_players cp
      left join player_steam_ids psi on psi.player_id = cp.id
      left join player_nicknames pn on pn.player_id = cp.id
      where psi.steam_id = any($1::text[])
         or lower(cp.display_name) = any($2::text[])
         or lower(pn.nickname) = any($2::text[])
    `,
    [steamIds, names.map((name) => name.toLowerCase())],
  );
  return identities.rows;
}

async function ensureNameFallbackIdentities(
  client: PoolClient,
  parserResults: RotationParserResultRow[],
): Promise<void> {
  const occurrences = uniqueNameOccurrences(parserResults);

  for (const occurrence of occurrences) {
    const existing = await client.query<{ id: string }>(
      `
        select cp.id
        from canonical_players cp
        left join player_nicknames pn on pn.player_id = cp.id
        where lower(cp.display_name) = lower($1)
           or (
             lower(pn.nickname) = lower($1)
             and (pn.observed_from is null or pn.observed_from <= $2)
             and (pn.observed_to is null or pn.observed_to >= $2)
           )
        order by cp.created_at, cp.id
        limit 1
      `,
      [occurrence.name, occurrence.replayTimestamp],
    );

    if (existing.rows[0]?.id !== undefined) {
      continue;
    }

    const player = await client.query<{ id: string }>(
      "insert into canonical_players (display_name) values ($1) returning id",
      [occurrence.name],
    );
    const playerId = player.rows[0]?.id;
    if (playerId === undefined) {
      throw new Error("canonical player fallback insert did not return id");
    }

    await client.query(
      `
        insert into player_nicknames (player_id, nickname, observed_from, evidence)
        values ($1, $2, $3, $4::jsonb)
      `,
      [
        playerId,
        occurrence.name,
        occurrence.replayTimestamp,
        JSON.stringify({ source: "parser_artifact_name_fallback" }),
      ],
    );
  }
}

function uniqueNameOccurrences(
  parserResults: RotationParserResultRow[],
): { name: string; replayTimestamp: Date }[] {
  const seen = new Set<string>(),
    occurrences: { name: string; replayTimestamp: Date }[] = [];

  for (const row of parserResults) {
    for (const player of playersFromArtifact(row.raw_snapshot)) {
      const name = player.n.trim();
      if (name.length === 0) {
        continue;
      }
      const key = `${name.toLowerCase()}\0${row.replay_timestamp.toISOString()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      occurrences.push({ name, replayTimestamp: row.replay_timestamp });
    }
  }

  return occurrences;
}

async function loadSquadMemberships(
  client: PoolClient,
  rotationId: string,
): Promise<SquadMembershipRow[]> {
  const memberships = await client.query<SquadMembershipRow>(
    `
      select distinct sm.player_id, sm.squad_id
      from squad_memberships sm
      join rotations r on r.id = $1
      where sm.valid_from < coalesce(r.ends_at, 'infinity'::timestamptz)
        and (sm.valid_to is null or sm.valid_to >= r.starts_at)
    `,
    [rotationId],
  );
  return memberships.rows;
}

function resolvedPlayers(input: {
  artifact: ParserArtifact;
  identities: PlayerIdentityRow[];
  memberships: SquadMembershipRow[];
  replayTimestamp: Date;
}): AggregatePlayerEvidence[] {
  return playersFromArtifact(input.artifact).flatMap((player) => {
    const identity = bestPlayerIdentity(
      input.identities,
      player,
      input.replayTimestamp,
    );
    if (identity === undefined) {
      return [];
    }
    const squadId = input.memberships.find(
      (membership) => membership.player_id === identity.player_id,
    )?.squad_id;
    return [
      squadId === undefined
        ? {
            entityRef: String(player.eid),
            playerId: identity.player_id,
          }
        : {
            entityRef: String(player.eid),
            playerId: identity.player_id,
            squadId,
          },
    ];
  });
}

function bestPlayerIdentity(
  identities: PlayerIdentityRow[],
  player: NonNullable<ParserArtifact["players"]>[number],
  replayTimestamp: Date,
): PlayerIdentityRow | undefined {
  return identities
    .flatMap((identity) => {
      const priority = playerIdentityMatchPriority(
        identity,
        player,
        replayTimestamp,
      );
      return priority === undefined ? [] : [{ identity, priority }];
    })
    .toSorted((left, right) => right.priority - left.priority)[0]?.identity;
}

function playerIdentityMatchPriority(
  identity: PlayerIdentityRow,
  player: NonNullable<ParserArtifact["players"]>[number],
  replayTimestamp: Date,
): number | undefined {
  if (player.sid !== undefined && identity.steam_id === player.sid) {
    return STEAM_ID_MATCH_PRIORITY;
  }

  const playerName = player.n.toLowerCase();
  if (
    identity.nickname !== null &&
    identity.nickname.toLowerCase() === playerName &&
    isNicknameActive(identity, replayTimestamp)
  ) {
    return ACTIVE_NICKNAME_MATCH_PRIORITY;
  }

  return identity.display_name.toLowerCase() === playerName
    ? DISPLAY_NAME_MATCH_PRIORITY
    : undefined;
}

function isNicknameActive(
  identity: PlayerIdentityRow,
  replayTimestamp: Date,
): boolean {
  return (
    (identity.nickname_observed_from === null ||
      identity.nickname_observed_from <= replayTimestamp) &&
    (identity.nickname_observed_to === null ||
      identity.nickname_observed_to >= replayTimestamp)
  );
}

function playersFromArtifact(
  artifact: ParserArtifact,
): NonNullable<ParserArtifact["players"]> {
  return artifact.players ?? [];
}

async function loadPreviousBountyEffectiveness(
  client: PoolClient,
  rotationId: string,
): Promise<BountyEffectivenessInput> {
  const previousRotation = await client.query<RotationRow>(
    `
      select previous.id
      from rotations current_rotation
      join rotations previous on previous.starts_at < current_rotation.starts_at
      where current_rotation.id = $1
      order by previous.starts_at desc
      limit 1
    `,
    [rotationId],
  );
  const previousRotationId = previousRotation.rows[0]?.id;
  if (previousRotationId === undefined) {
    return { players: new Map(), squads: new Map() };
  }

  const playerStats = await client.query<
      PreviousRotationStatsRow & { player_id: string }
    >(
      `
        select player_id, stats
        from player_stats
        where rotation_id = $1
      `,
      [previousRotationId],
    ),
    squadStats = await client.query<
      PreviousRotationStatsRow & { squad_id: string }
    >(
      `
        select squad_id, stats
        from squad_stats
        where rotation_id = $1
      `,
      [previousRotationId],
    );

  return {
    players: new Map(
      playerStats.rows.flatMap((row) => previousStatsEntry(row.player_id, row)),
    ),
    squads: new Map(
      squadStats.rows.flatMap((row) => previousStatsEntry(row.squad_id, row)),
    ),
  };
}

function previousStatsEntry(
  id: string,
  row: PreviousRotationStatsRow,
): [string, PreviousBountyStats][] {
  const stats = previousBountyStats(row.stats);
  return stats === undefined ? [] : [[id, stats]];
}

function previousBountyStats(stats: unknown): PreviousBountyStats | undefined {
  if (typeof stats !== "object" || stats === null) {
    return undefined;
  }
  const maybeStats = stats as {
    deaths?: { total?: unknown };
    kills?: unknown;
  };
  return typeof maybeStats.kills === "number" &&
    typeof maybeStats.deaths?.total === "number"
    ? {
        deaths: { total: maybeStats.deaths.total },
        kills: maybeStats.kills,
      }
    : undefined;
}

function bountyKillInputs(replays: AggregateReplayInput[]): BountyKillInput[] {
  return replays.flatMap((replay) => {
    const playersByEntity = new Map(
      replay.players.map((player) => [player.entityRef, player]),
    );
    return replay.events.flatMap((event) => {
      if (
        event.eventType !== "kill" &&
        event.eventType !== "teamkill" &&
        event.eventType !== "unknown_kill"
      ) {
        return [];
      }
      const attacker = playersByEntity.get(event.observedPlayerRef);
      if (attacker === undefined) {
        return [];
      }
      const victimEntityId = event.payload["victim_entity_id"],
        victim =
          typeof victimEntityId === "number"
            ? playersByEntity.get(String(victimEntityId))
            : undefined;
      return [
        victim === undefined
          ? {
              attackerPlayerId: attacker.playerId,
              eventType: event.eventType,
              replayId: replay.replayId,
            }
          : {
              attackerPlayerId: attacker.playerId,
              eventType: event.eventType,
              replayId: replay.replayId,
              victimPlayerId: victim.playerId,
              ...(victim.squadId === undefined
                ? {}
                : { victimSquadId: victim.squadId }),
            },
      ];
    });
  });
}

async function loadCommanderReplayInputs(
  client: PoolClient,
  rotationId: string,
): Promise<CommanderReplayInput[]> {
  const parserResults = await client.query<RotationParserResultRow>(
    `
      select pr.id, pr.raw_snapshot, r.id as replay_id, r.replay_timestamp
      from parser_results pr
      join replays r on r.id = pr.replay_id
      where r.rotation_id = $1
        and pr.status = 'current'
      order by r.replay_timestamp, pr.created_at
    `,
    [rotationId],
  );
  if (parserResults.rows.length === 0) {
    return [];
  }

  const identities = await loadPlayerIdentities(client, parserResults.rows);
  return parserResults.rows.map((row) => ({
    commanders: commanderIdentities(
      row.raw_snapshot,
      identities,
      row.replay_timestamp,
    ),
    outcome: outcomeEvidence(row.raw_snapshot),
    replayId: row.replay_id,
  }));
}

function commanderIdentities(
  artifact: ParserArtifact,
  identities: PlayerIdentityRow[],
  replayTimestamp: Date,
): CommanderIdentity[] {
  return (artifact.side_facts?.commanders ?? []).flatMap((commander) => {
    const side = presentValue(commander.side);
    if (side === undefined) {
      return [];
    }
    const actor = presentValue(commander.commander),
      sourceEntityId =
        actor?.source_entity_id?.state === "present"
          ? actor.source_entity_id.value
          : undefined,
      observedName =
        actor?.observed_name?.state === "present"
          ? actor.observed_name.value
          : undefined,
      player = playersFromArtifact(artifact).find(
        (candidate) =>
          candidate.eid === sourceEntityId || candidate.n === observedName,
      ),
      identity =
        player === undefined
          ? undefined
          : bestPlayerIdentity(identities, player, replayTimestamp);

    return [
      identity === undefined
        ? { side }
        : {
            playerId: identity.player_id,
            side,
          },
    ];
  });
}

function outcomeEvidence(
  artifact: ParserArtifact,
): CommanderReplayInput["outcome"] {
  const outcome = artifact.side_facts?.outcome,
    status = outcome?.status ?? "unknown",
    winnerSide = presentValue(outcome?.winner_side);
  return winnerSide === undefined ? { status } : { status, winnerSide };
}

function presentValue<T>(
  presence: { state: string; value?: T } | undefined,
): T | undefined {
  return presence?.state === "present" ? presence.value : undefined;
}

async function replaceAggregateRows(
  client: PoolClient,
  rotationId: string,
  aggregates: PlayerAndSquadAggregateRows,
): Promise<void> {
  await client.query("delete from player_stats where rotation_id = $1", [
    rotationId,
  ]);
  await client.query("delete from squad_stats where rotation_id = $1", [
    rotationId,
  ]);

  for (const row of aggregates.playerStats) {
    await client.query(
      `
        insert into player_stats (rotation_id, player_id, stats)
        values ($1, $2, $3)
      `,
      [rotationId, row.playerId, row.stats],
    );
  }
  for (const row of aggregates.squadStats) {
    await client.query(
      `
        insert into squad_stats (rotation_id, squad_id, stats)
        values ($1, $2, $3)
      `,
      [rotationId, row.squadId, row.stats],
    );
  }
}

async function replaceCommanderRows(
  client: PoolClient,
  rotationId: string,
  aggregates: ReturnType<typeof calculateCommanderSideAggregates>,
): Promise<void> {
  await client.query(
    "delete from commander_side_stats where rotation_id = $1",
    [rotationId],
  );

  for (const row of aggregates) {
    await client.query(
      `
        insert into commander_side_stats (
          rotation_id, player_id, side, known_wins, known_losses,
          unknown_outcomes
        )
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        rotationId,
        row.playerId,
        row.side,
        row.knownWins,
        row.knownLosses,
        row.unknownOutcomes,
      ],
    );
  }
}

async function replaceBountyRows(
  client: PoolClient,
  rotationId: string,
  bountyRows: BountyPointRow[],
): Promise<void> {
  await client.query("delete from bounty_points where rotation_id = $1", [
    rotationId,
  ]);

  for (const row of bountyRows) {
    await client.query(
      `
        insert into bounty_points (rotation_id, player_id, points, inputs)
        values ($1, $2, $3, $4)
      `,
      [rotationId, row.playerId, row.points, row.inputs],
    );
  }
}
