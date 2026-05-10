/* eslint-disable max-lines-per-function, no-use-before-define */
import { describe, expect, it } from "vitest";

import {
  PgRequestWorkflowApplier,
  createNoopRequestWorkflowApplier,
} from "./workflow-applier.js";

import type { ApplyRequestWorkflowInput } from "./models.js";
import type { PgStatisticsRepository } from "../../statistics/repository/repository.js";
import type { Pool, QueryResult, QueryResultRow } from "pg";

describe("createNoopRequestWorkflowApplier", () => {
  it("records no-op workflow status", async () => {
    await expect(
      createNoopRequestWorkflowApplier().applyWorkflowAction(
        input("link_steam"),
      ),
    ).resolves.toEqual({ status: "recorded" });
  });
});

describe("PgRequestWorkflowApplier", () => {
  it("applies legacy winner fixes and recalculates commander stats", async () => {
    const client = new ScriptedClient({ parserResultIds: ["parser-result-1"] }),
      statistics = statisticsDouble(),
      applier = new PgRequestWorkflowApplier(poolWith(client), statistics);

    await expect(
      applier.applyWorkflowAction(
        input("legacy_winner_fix", {
          replayId: "replay-1",
          winnerSide: "west",
        }),
      ),
    ).resolves.toEqual({
      status: "legacy_winner_applied:recalculated",
    });
    expect(statistics.recalculated).toEqual(["parser-result-1"]);
    expect(client.sql()).toContain("update parser_results");
    expect(client.sql()).toContain("commit");
  });

  it("applies Steam links", async () => {
    const client = new ScriptedClient(),
      applier = new PgRequestWorkflowApplier(
        poolWith(client),
        statisticsDouble(),
      );

    await expect(
      applier.applyWorkflowAction(
        input("link_steam", {
          playerId: "player-1",
          steamId: "steam-1",
        }),
      ),
    ).resolves.toEqual({ status: "steam_link_applied" });
    expect(client.sql()).toContain("insert into player_steam_ids");
  });

  it("applies player merges", async () => {
    const client = new ScriptedClient(),
      applier = new PgRequestWorkflowApplier(
        poolWith(client),
        statisticsDouble(),
      );

    await expect(
      applier.applyWorkflowAction(
        input("merge_players", {
          sourcePlayerId: "player-2",
          targetPlayerId: "player-1",
        }),
      ),
    ).resolves.toEqual({ status: "players_merged" });
    expect(client.sql()).toContain("update squad_memberships");
    expect(client.sql()).toContain("update commander_side_stats");
  });

  it("applies player splits with existing and newly created targets", async () => {
    const existingTargetClient = new ScriptedClient(),
      createdTargetClient = new ScriptedClient({
        insertedPlayerId: "player-created",
      });

    await expect(
      new PgRequestWorkflowApplier(
        poolWith(existingTargetClient),
        statisticsDouble(),
      ).applyWorkflowAction(
        input("split_player", {
          nicknames: ["OldName", 1],
          sourcePlayerId: "player-1",
          steamIds: ["steam-1"],
          targetPlayerId: "player-3",
        }),
      ),
    ).resolves.toEqual({ status: "player_split_applied" });
    await expect(
      new PgRequestWorkflowApplier(
        poolWith(createdTargetClient),
        statisticsDouble(),
      ).applyWorkflowAction(
        input("split_player", {
          sourcePlayerId: "player-1",
        }),
      ),
    ).resolves.toEqual({ status: "player_split_applied" });
    expect(existingTargetClient.sql()).toContain("update player_nicknames");
    expect(existingTargetClient.sql()).toContain("update player_steam_ids");
    expect(createdTargetClient.sql()).toContain(
      "insert into canonical_players",
    );
  });

  it("rolls back invalid workflow actions", async () => {
    const samePlayerClient = new ScriptedClient(),
      missingPayloadClient = new ScriptedClient(),
      missingPlayerClient = new ScriptedClient({
        missingPlayers: ["player-1"],
      }),
      missingInsertClient = new ScriptedClient({ omitInsertedPlayer: true });

    await expect(
      new PgRequestWorkflowApplier(
        poolWith(samePlayerClient),
        statisticsDouble(),
      ).applyWorkflowAction(
        input("merge_players", {
          sourcePlayerId: "player-1",
          targetPlayerId: "player-1",
        }),
      ),
    ).rejects.toThrow("must differ");
    await expect(
      new PgRequestWorkflowApplier(
        poolWith(missingPayloadClient),
        statisticsDouble(),
      ).applyWorkflowAction(input("link_steam", { playerId: "player-1" })),
    ).rejects.toThrow("steamId is required");
    await expect(
      new PgRequestWorkflowApplier(
        poolWith(missingPlayerClient),
        statisticsDouble(),
      ).applyWorkflowAction(
        input("link_steam", {
          playerId: "player-1",
          steamId: "steam-1",
        }),
      ),
    ).rejects.toThrow("player not found");
    await expect(
      new PgRequestWorkflowApplier(
        poolWith(missingInsertClient),
        statisticsDouble(),
      ).applyWorkflowAction(
        input("split_player", {
          displayName: "Created",
          sourcePlayerId: "player-1",
        }),
      ),
    ).rejects.toThrow("expected inserted row");
    expect(samePlayerClient.sql()).toContain("rollback");
    expect(missingPayloadClient.sql()).toContain("rollback");
    expect(missingPlayerClient.sql()).toContain("rollback");
    expect(missingInsertClient.sql()).toContain("rollback");
  });
});

function input(
  action: ApplyRequestWorkflowInput["action"],
  payload: Record<string, unknown> = {},
): ApplyRequestWorkflowInput {
  return {
    action,
    moderatorUserId: "moderator-1",
    payload,
    requestId: "request-1",
  };
}

function statisticsDouble(): PgStatisticsRepository & {
  recalculated: string[];
} {
  const recalculated: string[] = [];
  return {
    recalculated,
    async recalculateCommanderSideStatsForParserResult(parserResultId: string) {
      recalculated.push(parserResultId);
      return {
        commanderStats: 1,
        rotationId: "rotation-1",
        status: "recalculated" as const,
      };
    },
  } as unknown as PgStatisticsRepository & { recalculated: string[] };
}

function poolWith(client: ScriptedClient): Pool {
  return {
    async connect() {
      return client;
    },
  } as unknown as Pool;
}

interface ScriptedClientOptions {
  insertedPlayerId?: string | null;
  missingPlayers?: string[];
  omitInsertedPlayer?: boolean;
  parserResultIds?: string[];
}

class ScriptedClient {
  private readonly queries: string[] = [];

  public constructor(private readonly options: ScriptedClientOptions = {}) {}

  public async query<T extends QueryResultRow>(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<QueryResult<T>> {
    this.queries.push(sql.trim());
    if (sql.includes("select id::text from canonical_players")) {
      const [playerId] = parameters;
      return queryResult(
        this.options.missingPlayers?.includes(String(playerId)) === true
          ? []
          : ([{ id: playerId }] as unknown as T[]),
      );
    }
    if (sql.includes("insert into canonical_players")) {
      return queryResult(
        this.options.omitInsertedPlayer === true
          ? []
          : ([
              { id: this.options.insertedPlayerId ?? "player-new" },
            ] as unknown as T[]),
      );
    }
    if (sql.includes("update parser_results")) {
      return queryResult(
        (this.options.parserResultIds ?? []).map(
          (id) => ({ id }) as unknown as T,
        ),
      );
    }
    return queryResult([]);
  }

  public release(): void {
    this.queries.push("release");
  }

  public sql(): string {
    return this.queries.join("\n");
  }
}

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: "",
    fields: [],
    oid: 0,
    rowCount: rows.length,
    rows,
  };
}
