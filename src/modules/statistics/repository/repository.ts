/* eslint-disable max-lines, unicorn/no-null */
import {
  calculateBountyPoints,
  type BountyEffectivenessInput,
  type BountyKillInput,
  type BountyPointRow,
  type PreviousBountyStats,
} from "../bounty/bounty.js";
import { computeIsShow } from "../game-type/is-show.js";
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

import type { GameType } from "../game-type/game-type-config.js";
import type {
  NormalizedParserEvent,
  ParserArtifact,
} from "../parser-artifact.js";
import type { Pool, PoolClient } from "pg";

/**
 * The scope an aggregate write targets (CONTEXT D1). A `rotation` scope writes
 * per-rotation rows for one game type (only `sg` is driven per-rotation); an
 * `allTime` scope writes `rotation_id IS NULL` rows for one game type (`sg`,
 * `mace`, or `sm`). `gameType` may be `null` only for the single-replay audit
 * path, whose triggering replay is not classified there — it preserves the
 * pre-phase single-bucket behavior by writing the `(rotation_id, NULL)` row.
 */
export type AggregateScope =
  | { gameType: GameType | null; kind: "rotation"; rotationId: string }
  | { gameType: GameType; kind: "allTime" };

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

      const gameType = await replayGameType(client, parserResultId),
        scopes = auditScopes(gameType, rotationId.rotationId);
      let playerStats = 0,
        squadStats = 0;
      for (const scope of scopes) {
        const aggregateRows = await loadScopedAggregateReplayInputs(
            client,
            scope,
          ),
          aggregates = calculatePlayerAndSquadAggregates(aggregateRows);
        await replaceAggregateRows(client, scope, {
          aggregates,
          scopeGames: scopeGameCount(aggregateRows),
        });
        playerStats += aggregates.playerStats.length;
        squadStats += aggregates.squadStats.length;
      }
      await client.query("commit");
      return {
        playerStats,
        rotationId: rotationId.rotationId,
        squadStats,
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

      const gameType = await replayGameType(client, parserResultId),
        scopes = auditScopes(gameType, rotationId.rotationId);
      let commanderStats = 0;
      for (const scope of scopes) {
        const replayInputs = await loadScopedCommanderReplayInputs(
            client,
            scope,
          ),
          aggregates = calculateCommanderSideAggregates(replayInputs);
        await replaceCommanderRows(client, scope, aggregates);
        commanderStats += aggregates.length;
      }
      await client.query("commit");
      return {
        commanderStats,
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

      const gameType = await replayGameType(client, parserResultId),
        scopes = auditScopes(gameType, rotationId.rotationId);
      let bountyRows = 0;
      for (const scope of scopes) {
        const replayInputs = await loadScopedAggregateReplayInputs(
            client,
            scope,
          ),
          previousStats = await loadPreviousBountyEffectiveness(
            client,
            scope.kind === "rotation" ? scope.rotationId : null,
            scope.gameType,
          ),
          rows = calculateBountyPoints(
            bountyKillInputs(replayInputs),
            previousStats,
          );
        await replaceBountyRows(client, scope, rows);
        bountyRows += rows.length;
      }
      await client.query("commit");
      return {
        bountyRows,
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
    gameType: GameType | null = null,
  ): Promise<RotationAggregateRecalculationResult> {
    return this.recalculatePlayerAndSquadStatsForScope({
      gameType,
      kind: "rotation",
      rotationId,
    });
  }

  public async recalculateCommanderSideStatsForRotation(
    rotationId: string,
    gameType: GameType | null = null,
  ): Promise<RotationCommanderRecalculationResult> {
    return this.recalculateCommanderSideStatsForScope({
      gameType,
      kind: "rotation",
      rotationId,
    });
  }

  public async recalculateBountyPointsForRotation(
    rotationId: string,
    gameType: GameType | null = null,
  ): Promise<RotationBountyRecalculationResult> {
    return this.recalculateBountyPointsForScope({
      gameType,
      kind: "rotation",
      rotationId,
    });
  }

  /**
   * Recalculates player/squad aggregates for one scope (CONTEXT D1). For a
   * `rotation` scope with a non-null game type only that type's replays in the
   * rotation are aggregated; an `allTime` scope aggregates every current replay
   * of the game type across all rotations into the `rotation_id IS NULL` bucket.
   * Excluded (`game_type IS NULL`) replays are never selected (D2).
   */
  public async recalculatePlayerAndSquadStatsForScope(
    scope: AggregateScope,
  ): Promise<RotationAggregateRecalculationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const aggregateRows = await loadScopedAggregateReplayInputs(
          client,
          scope,
        ),
        aggregates = calculatePlayerAndSquadAggregates(aggregateRows);
      await replaceAggregateRows(client, scope, {
        aggregates,
        scopeGames: scopeGameCount(aggregateRows),
      });
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

  public async recalculateCommanderSideStatsForScope(
    scope: AggregateScope,
  ): Promise<RotationCommanderRecalculationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replayInputs = await loadScopedCommanderReplayInputs(client, scope),
        aggregates = calculateCommanderSideAggregates(replayInputs);
      await replaceCommanderRows(client, scope, aggregates);
      await client.query("commit");
      return { commanderStats: aggregates.length };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  public async recalculateBountyPointsForScope(
    scope: AggregateScope,
  ): Promise<RotationBountyRecalculationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replayInputs = await loadScopedAggregateReplayInputs(client, scope),
        previousStats = await loadPreviousBountyEffectiveness(
          client,
          scope.kind === "rotation" ? scope.rotationId : null,
          scope.gameType,
        ),
        bountyRows = calculateBountyPoints(
          bountyKillInputs(replayInputs),
          previousStats,
        );
      await replaceBountyRows(client, scope, bountyRows);
      await client.query("commit");
      return { bountyRows: bountyRows.length };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  public async recalculatePlayerAndSquadStatsForAllTime(
    gameType: GameType,
  ): Promise<RotationAggregateRecalculationResult> {
    return this.recalculatePlayerAndSquadStatsForScope({
      gameType,
      kind: "allTime",
    });
  }

  public async recalculateCommanderSideStatsForAllTime(
    gameType: GameType,
  ): Promise<RotationCommanderRecalculationResult> {
    return this.recalculateCommanderSideStatsForScope({
      gameType,
      kind: "allTime",
    });
  }

  public async recalculateBountyPointsForAllTime(
    gameType: GameType,
  ): Promise<RotationBountyRecalculationResult> {
    return this.recalculateBountyPointsForScope({ gameType, kind: "allTime" });
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

/**
 * Scoped aggregate loader (CONTEXT D1/D2). Filters current parser results by the
 * scope's game type, and for a `rotation` scope additionally by the rotation.
 * Excluded replays (`r.game_type IS NULL`) are never selected. The squad
 * membership window is the rotation for a `rotation` scope and the full corpus
 * for an `allTime` scope.
 */
async function loadScopedAggregateReplayInputs(
  client: PoolClient,
  scope: AggregateScope,
): Promise<AggregateReplayInput[]> {
  const parserResults = await client.query<RotationParserResultRow>(
    scopedCurrentResultsSql(scope),
    scopedCurrentResultsParameters(scope),
  );
  return aggregateInputsFromRows(
    client,
    parserResults.rows,
    scope.kind === "rotation" ? scope.rotationId : null,
  );
}

async function aggregateInputsFromRows(
  client: PoolClient,
  rows: RotationParserResultRow[],
  membershipRotation: string | null,
): Promise<AggregateReplayInput[]> {
  if (rows.length === 0) {
    return [];
  }

  const events = await loadParserEvents(
      client,
      rows.map((row) => row.id),
    ),
    identities = await loadPlayerIdentities(client, rows),
    memberships = await loadSquadMemberships(client, membershipRotation);

  return rows.map((row) => ({
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

/**
 * Builds the `current parser_results` SELECT for a scope. The `game_type`
 * predicate uses `IS NOT DISTINCT FROM` so a `null` audit-path game type matches
 * the legacy single-bucket rows, while a concrete type matches exactly and never
 * picks up excluded (`NULL`) replays.
 */
function scopedCurrentResultsSql(scope: AggregateScope): string {
  const rotationPredicate =
    scope.kind === "rotation" ? "and r.rotation_id = $2" : "";
  return `
    select pr.id, pr.raw_snapshot, r.id as replay_id, r.replay_timestamp
    from parser_results pr
    join replays r on r.id = pr.replay_id
    where pr.status = 'current'
      and r.game_type is not distinct from $1
      ${rotationPredicate}
    order by r.replay_timestamp, pr.created_at
  `;
}

function scopedCurrentResultsParameters(
  scope: AggregateScope,
): (string | null)[] {
  return scope.kind === "rotation"
    ? [scope.gameType, scope.rotationId]
    : [scope.gameType];
}

/**
 * Distinct replays contributing to a scope — the legacy `gamesCount` used as the
 * is_show threshold scope (RESEARCH C). Derived from the loaded inputs so it is
 * computed once at recalc, not at export (D3).
 */
function scopeGameCount(inputs: AggregateReplayInput[]): number {
  return new Set(inputs.map((input) => input.replayId)).size;
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
  if (occurrences.length === 0) {
    return;
  }

  // Step 1: one batch resolve against the PRE-INSERT snapshot. `with ordinality`
  // is 1-based; map idx back to the 0-based occurrence array via `idx - 1`.
  const matched = await client.query<{ idx: string }>(
    `
      select occ.idx
      from unnest($1::text[], $2::timestamptz[]) with ordinality as occ(name, ts, idx)
      where exists (
        select 1
        from canonical_players cp
        left join player_nicknames pn on pn.player_id = cp.id
        where lower(cp.display_name) = lower(occ.name)
           or (
             lower(pn.nickname) = lower(occ.name)
             and (pn.observed_from is null or pn.observed_from <= occ.ts)
             and (pn.observed_to is null or pn.observed_to >= occ.ts)
           )
      )
    `,
    [
      occurrences.map((occurrence) => occurrence.name),
      occurrences.map((occurrence) => occurrence.replayTimestamp),
    ],
  );
  const matchedIndices = new Set(
    matched.rows.map((row) => Number(row.idx) - 1),
  );

  // Step 2: ordered in-memory replay. A fallback CP created earlier this run
  // matches every later occurrence of the same lower(name) via display_name
  // (timestamp-independent), so the createdLowerNames guard replicates the
  // original loop's later-occurrence behavior without touching the DB here.
  const createdLowerNames = new Set<string>(),
    toCreate: { name: string; replayTimestamp: Date }[] = [];
  for (const [index, occurrence] of occurrences.entries()) {
    if (matchedIndices.has(index)) {
      continue;
    }
    const lowerName = occurrence.name.toLowerCase();
    if (createdLowerNames.has(lowerName)) {
      continue;
    }
    createdLowerNames.add(lowerName);
    toCreate.push(occurrence);
  }

  if (toCreate.length === 0) {
    return;
  }

  // Step 3: two multi-row inserts. The canonical insert returns display_name
  // alongside id so the nicknames link by display_name, NOT by zipping the
  // `RETURNING` output positionally — Postgres does not guarantee
  // `INSERT ... RETURNING` row order, so a positional zip could attach a nickname
  // to the wrong player. `toCreate` names are unique by lower(name)
  // (createdLowerNames guard), so the display_name -> id map is unambiguous.
  const created = await client.query<{ id: string; display_name: string }>(
    `
      insert into canonical_players (display_name)
      select * from unnest($1::text[])
      returning id, display_name
    `,
    [toCreate.map((occurrence) => occurrence.name)],
  );
  const idByDisplayName = new Map(
    created.rows.map((row) => [row.display_name, row.id]),
  );

  await client.query(
    `
      insert into player_nicknames (player_id, nickname, observed_from, evidence)
      select * from unnest($1::uuid[], $2::text[], $3::timestamptz[], $4::jsonb[])
    `,
    [
      toCreate.map((occurrence) => {
        const playerId = idByDisplayName.get(occurrence.name);
        if (playerId === undefined) {
          throw new Error("canonical player fallback insert did not return id");
        }
        return playerId;
      }),
      toCreate.map((occurrence) => occurrence.name),
      toCreate.map((occurrence) => occurrence.replayTimestamp),
      toCreate.map(() =>
        JSON.stringify({ source: "parser_artifact_name_fallback" }),
      ),
    ],
  );
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

/**
 * Squad memberships overlapping a scope. A `rotation` scope (non-null id) bounds
 * memberships to the rotation window, as before; an `allTime` scope (`null`)
 * takes every membership across the whole corpus.
 */
async function loadSquadMemberships(
  client: PoolClient,
  rotationId: string | null,
): Promise<SquadMembershipRow[]> {
  if (rotationId === null) {
    const memberships = await client.query<SquadMembershipRow>(
      "select distinct player_id, squad_id from squad_memberships",
    );
    return memberships.rows;
  }
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

/**
 * Previous-rotation effectiveness used by bounty (cross-rotation read). An
 * all-time scope (`rotationId === null`) has no "previous rotation" — bounty is
 * computed over the whole corpus with no carry-in — so it returns empty. The
 * previous-rotation read is filtered by the SAME game type as the target scope
 * so per-type bounty stays type-isolated; the audit-path `null` game type reads
 * the legacy single-bucket rows via `IS NOT DISTINCT FROM`.
 */
async function loadPreviousBountyEffectiveness(
  client: PoolClient,
  rotationId: string | null,
  gameType: GameType | null,
): Promise<BountyEffectivenessInput> {
  if (rotationId === null) {
    return { players: new Map(), squads: new Map() };
  }
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
          and game_type is not distinct from $2
      `,
      [previousRotationId, gameType],
    ),
    squadStats = await client.query<
      PreviousRotationStatsRow & { squad_id: string }
    >(
      `
        select squad_id, stats
        from squad_stats
        where rotation_id = $1
          and game_type is not distinct from $2
      `,
      [previousRotationId, gameType],
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

async function loadScopedCommanderReplayInputs(
  client: PoolClient,
  scope: AggregateScope,
): Promise<CommanderReplayInput[]> {
  const parserResults = await client.query<RotationParserResultRow>(
    scopedCurrentResultsSql(scope),
    scopedCurrentResultsParameters(scope),
  );
  return commanderInputsFromRows(client, parserResults.rows);
}

async function commanderInputsFromRows(
  client: PoolClient,
  rows: RotationParserResultRow[],
): Promise<CommanderReplayInput[]> {
  if (rows.length === 0) {
    return [];
  }

  const identities = await loadPlayerIdentities(client, rows);
  return rows.map((row) => ({
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

/**
 * Reads the canonical, persisted `game_type` of a parser result's replay (D2).
 * The audit path is not classified here (classification is the full-run
 * service's job), so this is whatever is currently on the replay — `null` for an
 * excluded replay (no prefix / sgs / mace<10 / sm<2023 / excludeReplays).
 */
async function replayGameType(
  client: PoolClient,
  parserResultId: string,
): Promise<GameType | null> {
  const result = await client.query<{ game_type: GameType | null }>(
    `
      select r.game_type
      from parser_results pr
      join replays r on r.id = pr.replay_id
      where pr.id = $1
    `,
    [parserResultId],
  );
  return result.rows[0]?.game_type ?? null;
}

/**
 * The aggregate scopes a single-replay audit recompute must rebuild so the
 * loaded inputs MATCH the write scope (BLOCKER 1). The triggering replay's
 * persisted `game_type` decides which type-filtered buckets it belongs to:
 *   - `null` (excluded): contributes to NO bucket → rebuild nothing (no-op),
 *     preserving the pre-phase behavior of not corrupting any bucket.
 *   - `sg`: rebuild the sg per-rotation bucket for its rotation AND the sg
 *     all-time bucket (D1 — sg gets both), each loaded sg-only.
 *   - `mace`/`sm`: rebuild ONLY that type's all-time bucket (D1 — mace/sm have
 *     no per-rotation rows), loaded type-filtered.
 * Every returned scope is type-filtered via `loadScopedAggregateReplayInputs`,
 * so the inputs and the write key always agree and `is_show` uses the scoped
 * game count, never the all-types rotation count.
 */
function auditScopes(
  gameType: GameType | null,
  rotationId: string,
): AggregateScope[] {
  if (gameType === null) {
    return [];
  }
  if (gameType === "sg") {
    return [
      { gameType, kind: "rotation", rotationId },
      { gameType, kind: "allTime" },
    ];
  }
  return [{ gameType, kind: "allTime" }];
}

/** Resolves the `rotation_id` value written/deleted for a scope. */
function scopeRotationId(scope: AggregateScope): string | null {
  return scope.kind === "rotation" ? scope.rotationId : null;
}

/**
 * Scope-keyed delete predicate: only ever the `(rotation_id, game_type)` bucket
 * of ONE aggregate table. `IS NOT DISTINCT FROM` makes the all-time
 * (`rotation_id IS NULL`) and excluded-audit (`game_type IS NULL`) buckets match
 * by value. The moderation `audit_patches` / `moderation_actions` tables are
 * NEVER referenced here (threat T-01-07) — the recompute rewrites derived rows
 * only.
 */
async function replaceAggregateRows(
  client: PoolClient,
  scope: AggregateScope,
  write: { aggregates: PlayerAndSquadAggregateRows; scopeGames: number },
): Promise<void> {
  const { aggregates, scopeGames: games } = write,
    rotationId = scopeRotationId(scope);
  await client.query(
    `delete from player_stats
     where rotation_id is not distinct from $1
       and game_type is not distinct from $2`,
    [rotationId, scope.gameType],
  );
  await client.query(
    `delete from squad_stats
     where rotation_id is not distinct from $1
       and game_type is not distinct from $2`,
    [rotationId, scope.gameType],
  );

  for (const row of aggregates.playerStats) {
    await client.query(
      `
        insert into player_stats (rotation_id, player_id, stats, game_type, is_show)
        values ($1, $2, $3, $4, $5)
      `,
      [
        rotationId,
        row.playerId,
        row.stats,
        scope.gameType,
        computeIsShow(row.stats.replay_count, games),
      ],
    );
  }
  for (const row of aggregates.squadStats) {
    await client.query(
      `
        insert into squad_stats (rotation_id, squad_id, stats, game_type)
        values ($1, $2, $3, $4)
      `,
      [rotationId, row.squadId, row.stats, scope.gameType],
    );
  }
}

async function replaceCommanderRows(
  client: PoolClient,
  scope: AggregateScope,
  aggregates: ReturnType<typeof calculateCommanderSideAggregates>,
): Promise<void> {
  const rotationId = scopeRotationId(scope);
  await client.query(
    `delete from commander_side_stats
     where rotation_id is not distinct from $1
       and game_type is not distinct from $2`,
    [rotationId, scope.gameType],
  );

  for (const row of aggregates) {
    await client.query(
      `
        insert into commander_side_stats (
          rotation_id, player_id, side, known_wins, known_losses,
          unknown_outcomes, game_type
        )
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        rotationId,
        row.playerId,
        row.side,
        row.knownWins,
        row.knownLosses,
        row.unknownOutcomes,
        scope.gameType,
      ],
    );
  }
}

async function replaceBountyRows(
  client: PoolClient,
  scope: AggregateScope,
  bountyRows: BountyPointRow[],
): Promise<void> {
  const rotationId = scopeRotationId(scope);
  await client.query(
    `delete from bounty_points
     where rotation_id is not distinct from $1
       and game_type is not distinct from $2`,
    [rotationId, scope.gameType],
  );

  for (const row of bountyRows) {
    await client.query(
      `
        insert into bounty_points (rotation_id, player_id, points, inputs, game_type)
        values ($1, $2, $3, $4, $5)
      `,
      [rotationId, row.playerId, row.points, row.inputs, scope.gameType],
    );
  }
}
