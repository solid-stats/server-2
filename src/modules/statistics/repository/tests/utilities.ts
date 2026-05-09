/* eslint-disable camelcase, unicorn/no-null */
import {
  eventRow,
  parserResultRows,
  type CommanderScenario,
} from "./fixtures.js";

import type { Pool, PoolClient } from "pg";

export class ScriptedClient {
  public readonly queries: string[] = [];

  public readonly parameters: unknown[][] = [];

  public released = false;

  public constructor(
    private readonly options: {
      commanderScenario?: CommanderScenario;
      emptyParserResults?: boolean;
      failOn?: string;
      invalidPreviousStats?: boolean;
      missingReplayTimestamp?: boolean;
      missingRotation?: boolean;
      missingPreviousRotation?: boolean;
      missingVictimPayload?: boolean;
      nullKillAttacker?: boolean;
      unknownAttackerRef?: boolean;
      withBountyMemberships?: boolean;
      withMembership?: boolean;
      withVictimIdentity?: boolean;
    } = {},
  ) {}

  public query(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<{ rows: unknown[] }> {
    const normalizedSql = sql.trim();
    this.queries.push(normalizedSql);
    this.parameters.push(parameters);
    if (
      this.options.failOn !== undefined &&
      normalizedSql.startsWith(this.options.failOn)
    ) {
      return Promise.reject(new Error("scripted failure"));
    }
    return Promise.resolve({ rows: this.rowsFor(normalizedSql) });
  }

  public release(): void {
    this.released = true;
  }

  private rowsFor(sql: string): unknown[] {
    if (sql.startsWith("select r.id as replay_id")) {
      return this.parserResultReplayRows();
    }
    if (sql.startsWith("select id")) {
      return this.rotationRows();
    }
    if (sql.startsWith("select previous.id")) {
      return this.previousRotationRows();
    }
    if (sql.startsWith("select pr.id")) {
      if (this.options.emptyParserResults === true) {
        return [];
      }
      return parserResultRows(this.options.commanderScenario ?? "default");
    }
    if (sql.startsWith("select parser_result_id")) {
      return [
        eventRow("diagnostic", null),
        eventRow("destroyed_vehicle", null),
        eventRow("kill", this.killAttackerReference(), this.killPayload()),
        eventRow("unsupported", "101"),
        eventRow(
          "teamkill",
          this.options.unknownAttackerRef === true ? "999" : "101",
        ),
      ];
    }
    if (sql.startsWith("select cp.id as player_id")) {
      return this.identityRows();
    }
    if (sql.startsWith("select distinct sm.player_id")) {
      return this.membershipRows();
    }
    if (sql.startsWith("select player_id, stats")) {
      return this.previousPlayerStatRows();
    }
    if (sql.startsWith("select squad_id, stats")) {
      return this.previousSquadStatRows();
    }
    return [];
  }

  private parserResultReplayRows(): unknown[] {
    return [
      {
        replay_id: "replay-1",
        replay_timestamp:
          this.options.missingReplayTimestamp === true ? null : new Date(0),
      },
    ];
  }

  private rotationRows(): unknown[] {
    return this.options.missingRotation === true ? [] : [{ id: "rotation-1" }];
  }

  private previousRotationRows(): unknown[] {
    return this.options.missingPreviousRotation === true
      ? []
      : [{ id: "rotation-0" }];
  }

  private identityRows(): unknown[] {
    return [
      {
        display_name: "Known",
        player_id: "player-1",
        steam_id: "steam-1",
      },
      ...(this.options.withVictimIdentity === true
        ? [
            {
              display_name: "Unknown",
              player_id: "player-2",
              steam_id: null,
            },
          ]
        : []),
    ];
  }

  private membershipRows(): unknown[] {
    if (this.options.withBountyMemberships === true) {
      return [
        { player_id: "player-1", squad_id: "squad-1" },
        { player_id: "player-2", squad_id: "squad-2" },
      ];
    }
    return this.options.withMembership === true
      ? [{ player_id: "player-1", squad_id: "squad-1" }]
      : [];
  }

  private previousPlayerStatRows(): unknown[] {
    return this.options.invalidPreviousStats === true
      ? [
          { player_id: "player-2", stats: null },
          { player_id: "player-3", stats: { deaths: {}, kills: 1 } },
        ]
      : [
          {
            player_id: "player-2",
            stats: { deaths: { total: 2 }, kills: 4 },
          },
        ];
  }

  private previousSquadStatRows(): unknown[] {
    return this.options.invalidPreviousStats === true
      ? [{ squad_id: "squad-2", stats: { deaths: { total: 1 } } }]
      : [
          {
            squad_id: "squad-2",
            stats: { deaths: { total: 3 }, kills: 6 },
          },
        ];
  }

  private killAttackerReference(): string | null {
    if (this.options.nullKillAttacker === true) {
      return null;
    }
    return this.options.unknownAttackerRef === true ? "999" : "101";
  }

  private killPayload(): Record<string, unknown> {
    return this.options.missingVictimPayload === true
      ? {}
      : { victim_entity_id: 202 };
  }
}

export function poolFor(client: ScriptedClient): Pool {
  return {
    connect: () => Promise.resolve(client as unknown as PoolClient),
  } as unknown as Pool;
}

export function commanderInsertParameters(client: ScriptedClient): unknown[][] {
  return client.parameters.filter((_parameters, index) =>
    client.queries[index]?.startsWith("insert into commander_side_stats"),
  );
}

export function bountyInsertParameters(client: ScriptedClient): unknown[][] {
  return client.parameters.filter((_parameters, index) =>
    client.queries[index]?.startsWith("insert into bounty_points"),
  );
}
