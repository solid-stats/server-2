/* eslint-disable max-lines */
import type {
  ApplyRequestWorkflowInput,
  RequestWorkflowApplier,
} from "./models.js";
import type { PgStatisticsRepository } from "../../statistics/repository/repository.js";
import type { Pool, PoolClient } from "pg";

interface ParserResultIdRow {
  id: string;
}

interface IdRow {
  id: string;
}

interface WorkflowResult {
  parserResultIds: string[];
  status: string;
}

export function createNoopRequestWorkflowApplier(): RequestWorkflowApplier {
  return {
    async applyWorkflowAction(input: ApplyRequestWorkflowInput) {
      void input;
      return { status: "recorded" };
    },
  };
}

export class PgRequestWorkflowApplier implements RequestWorkflowApplier {
  public constructor(
    private readonly pool: Pool,
    private readonly statistics: PgStatisticsRepository,
  ) {}

  public async applyWorkflowAction(
    input: ApplyRequestWorkflowInput,
  ): Promise<{ status: string }> {
    const result = await this.withClient(async (client) => {
      if (input.action === "legacy_winner_fix") {
        return applyLegacyWinnerFix(client, input);
      }
      if (input.action === "link_steam") {
        return applySteamLink(client, input);
      }
      if (input.action === "merge_players") {
        return applyPlayerMerge(client, input);
      }
      return applyPlayerSplit(client, input);
    });

    const recalculationStatuses = await Promise.all(
      result.parserResultIds.map((parserResultId) =>
        this.recalculateParserResult(parserResultId),
      ),
    );
    return {
      status:
        recalculationStatuses.length === 0
          ? result.status
          : `${result.status}:${recalculationStatuses.join("|")}`,
    };
  }

  private async recalculateParserResult(
    parserResultId: string,
  ): Promise<string> {
    const commander =
      await this.statistics.recalculateCommanderSideStatsForParserResult(
        parserResultId,
      );
    return commander.status;
  }

  private async withClient<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await callback(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function applyLegacyWinnerFix(
  client: PoolClient,
  input: ApplyRequestWorkflowInput,
): Promise<WorkflowResult> {
  const replayId = requiredString(input.payload, "replayId"),
    winnerSide = requiredString(input.payload, "winnerSide"),
    winnerSideJson = {
      state: "present",
      value: winnerSide,
    };
  const result = await client.query<ParserResultIdRow>(
    `
      update parser_results
      set raw_snapshot = jsonb_set(
        jsonb_set(raw_snapshot, '{side_facts,outcome,status}', '"known"', true),
        '{side_facts,outcome,winner_side}',
        $2::jsonb,
        true
      )
      where replay_id = $1 and status = 'current'
      returning id::text
    `,
    [replayId, JSON.stringify(winnerSideJson)],
  );
  return {
    parserResultIds: result.rows.map((row) => row.id),
    status: "legacy_winner_applied",
  };
}

async function applySteamLink(
  client: PoolClient,
  input: ApplyRequestWorkflowInput,
): Promise<WorkflowResult> {
  const playerId = requiredString(input.payload, "playerId"),
    steamId = requiredString(input.payload, "steamId");
  await assertPlayerExists(client, playerId);
  await client.query(
    `
      insert into player_steam_ids (
        player_id, steam_id, observed_from, source, evidence
      )
      select $1, $2, now(), 'moderation', $3::jsonb
      where not exists (
        select 1 from player_steam_ids where player_id = $1 and steam_id = $2
      )
    `,
    [playerId, steamId, workflowEvidence(input)],
  );
  return { parserResultIds: [], status: "steam_link_applied" };
}

async function applyPlayerMerge(
  client: PoolClient,
  input: ApplyRequestWorkflowInput,
): Promise<WorkflowResult> {
  const sourcePlayerId = requiredString(input.payload, "sourcePlayerId"),
    targetPlayerId = requiredString(input.payload, "targetPlayerId");
  if (sourcePlayerId === targetPlayerId) {
    throw new Error("sourcePlayerId and targetPlayerId must differ");
  }
  await assertPlayerExists(client, sourcePlayerId);
  await assertPlayerExists(client, targetPlayerId);
  await moveIdentityRows(client, sourcePlayerId, targetPlayerId);
  await moveAggregateRows(client, sourcePlayerId, targetPlayerId);
  await client.query(
    `
      update canonical_players
      set updated_at = now()
      where id in ($1, $2)
    `,
    [sourcePlayerId, targetPlayerId],
  );
  return { parserResultIds: [], status: "players_merged" };
}

async function applyPlayerSplit(
  client: PoolClient,
  input: ApplyRequestWorkflowInput,
): Promise<WorkflowResult> {
  const sourcePlayerId = requiredString(input.payload, "sourcePlayerId"),
    targetPlayerId = await targetPlayerForSplit(client, input);
  await assertPlayerExists(client, sourcePlayerId);
  await moveSelectedIdentityRows(client, {
    input,
    sourcePlayerId,
    targetPlayerId,
  });
  return { parserResultIds: [], status: "player_split_applied" };
}

async function targetPlayerForSplit(
  client: PoolClient,
  input: ApplyRequestWorkflowInput,
): Promise<string> {
  const targetPlayerId = optionalString(input.payload, "targetPlayerId");
  if (targetPlayerId !== undefined) {
    await assertPlayerExists(client, targetPlayerId);
    return targetPlayerId;
  }
  const displayName =
      optionalString(input.payload, "displayName") ?? "Split player",
    result = await client.query<IdRow>(
      `
        insert into canonical_players (display_name)
        values ($1)
        returning id::text
      `,
      [displayName],
    );
  return firstId(result.rows);
}

async function moveIdentityRows(
  client: PoolClient,
  sourcePlayerId: string,
  targetPlayerId: string,
): Promise<void> {
  await client.query(
    "update player_nicknames set player_id = $2 where player_id = $1",
    [sourcePlayerId, targetPlayerId],
  );
  await client.query(
    "update player_steam_ids set player_id = $2 where player_id = $1",
    [sourcePlayerId, targetPlayerId],
  );
  await client.query(
    "update squad_memberships set player_id = $2 where player_id = $1",
    [sourcePlayerId, targetPlayerId],
  );
}

interface MoveSelectedIdentityRowsInput {
  input: ApplyRequestWorkflowInput;
  sourcePlayerId: string;
  targetPlayerId: string;
}

async function moveSelectedIdentityRows(
  client: PoolClient,
  options: MoveSelectedIdentityRowsInput,
): Promise<void> {
  const { input, sourcePlayerId, targetPlayerId } = options;
  const nicknames = stringArray(input.payload, "nicknames"),
    steamIds = stringArray(input.payload, "steamIds");
  if (nicknames.length > 0) {
    await client.query(
      `
        update player_nicknames
        set player_id = $3
        where player_id = $1 and nickname = any($2::text[])
      `,
      [sourcePlayerId, nicknames, targetPlayerId],
    );
  }
  if (steamIds.length > 0) {
    await client.query(
      `
        update player_steam_ids
        set player_id = $3
        where player_id = $1 and steam_id = any($2::text[])
      `,
      [sourcePlayerId, steamIds, targetPlayerId],
    );
  }
}

async function moveAggregateRows(
  client: PoolClient,
  sourcePlayerId: string,
  targetPlayerId: string,
): Promise<void> {
  await client.query(
    `
      delete from player_stats source_stats
      where source_stats.player_id = $1
        and exists (
          select 1 from player_stats target_stats
          where target_stats.rotation_id = source_stats.rotation_id
            and target_stats.player_id = $2
        )
    `,
    [sourcePlayerId, targetPlayerId],
  );
  await client.query(
    "update player_stats set player_id = $2 where player_id = $1",
    [sourcePlayerId, targetPlayerId],
  );
  await client.query(
    `
      delete from bounty_points source_points
      where source_points.player_id = $1
        and exists (
          select 1 from bounty_points target_points
          where target_points.rotation_id = source_points.rotation_id
            and target_points.player_id = $2
        )
    `,
    [sourcePlayerId, targetPlayerId],
  );
  await client.query(
    "update bounty_points set player_id = $2 where player_id = $1",
    [sourcePlayerId, targetPlayerId],
  );
  await client.query(
    "update commander_side_stats set player_id = $2 where player_id = $1",
    [sourcePlayerId, targetPlayerId],
  );
}

async function assertPlayerExists(
  client: PoolClient,
  playerId: string,
): Promise<void> {
  const result = await client.query<IdRow>(
    "select id::text from canonical_players where id = $1",
    [playerId],
  );
  if (result.rowCount !== 1) {
    throw new Error("player not found");
  }
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = optionalString(payload, key);
  if (value === undefined) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function workflowEvidence(input: ApplyRequestWorkflowInput): string {
  return JSON.stringify({
    action: input.action,
    moderatorUserId: input.moderatorUserId,
    requestId: input.requestId,
  });
}

function firstId(rows: IdRow[]): string {
  const [row] = rows;
  if (row === undefined) {
    throw new Error("expected inserted row");
  }
  return row.id;
}
