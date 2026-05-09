/* eslint-disable camelcase, id-length, unicorn/no-null */
import type { Pool, PoolClient } from "pg";

type CommanderScenario =
  | "default"
  | "missingOutcome"
  | "nameOnly"
  | "playerNameOnly"
  | "unknownActor"
  | "unknownWinner";

export class ScriptedClient {
  public readonly queries: string[] = [];

  public readonly parameters: unknown[][] = [];

  public released = false;

  public constructor(
    private readonly options: {
      commanderScenario?: CommanderScenario;
      emptyParserResults?: boolean;
      failOn?: string;
      missingReplayTimestamp?: boolean;
      missingRotation?: boolean;
      withMembership?: boolean;
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
      return [
        {
          replay_id: "replay-1",
          replay_timestamp:
            this.options.missingReplayTimestamp === true ? null : new Date(0),
        },
      ];
    }
    if (sql.startsWith("select id")) {
      if (this.options.missingRotation === true) {
        return [];
      }
      return [{ id: "rotation-1" }];
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
        eventRow("kill", null),
        eventRow("unsupported", "101"),
        eventRow("teamkill", "101"),
      ];
    }
    if (sql.startsWith("select cp.id as player_id")) {
      return [
        {
          display_name: "Known",
          player_id: "player-1",
          steam_id: "steam-1",
        },
      ];
    }
    if (
      sql.startsWith("select distinct sm.player_id") &&
      this.options.withMembership === true
    ) {
      return [{ player_id: "player-1", squad_id: "squad-1" }];
    }
    return [];
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

function parserResultRows(commanderScenario: CommanderScenario): unknown[] {
  return [
    {
      id: "result-1",
      raw_snapshot: parserArtifact(commanderScenario),
      replay_id: "replay-1",
      replay_timestamp: new Date(0),
    },
    {
      id: "result-2",
      raw_snapshot: {
        contract_version: "3.0.0",
        parser: {},
        source: {},
        status: "success",
      },
      replay_id: "replay-2",
      replay_timestamp: new Date(0),
    },
  ];
}

function parserArtifact(commanderScenario: CommanderScenario): unknown {
  return {
    contract_version: "3.0.0",
    parser: {},
    players: [player(commanderScenario), { eid: 202, n: "Unknown" }],
    side_facts: sideFacts(commanderScenario),
    source: {},
    status: "success",
  };
}

function player(commanderScenario: CommanderScenario): unknown {
  if (commanderScenario === "playerNameOnly") {
    return { eid: 101, n: "Known" };
  }
  return { eid: 101, n: "Known", sid: "steam-1" };
}

function sideFacts(commanderScenario: CommanderScenario): unknown {
  const commandFacts = {
    commanders: commanders(commanderScenario),
  };
  if (commanderScenario === "missingOutcome") {
    return commandFacts;
  }
  return {
    ...commandFacts,
    outcome:
      commanderScenario === "unknownWinner"
        ? {
            status: "known",
            winner_side: { state: "unknown" },
          }
        : {
            status: "known",
            winner_side: { state: "present", value: "west" },
          },
  };
}

function commanders(commanderScenario: CommanderScenario): unknown[] {
  if (commanderScenario === "unknownActor") {
    return [
      {
        commander: { state: "unknown" },
        side: { state: "present", value: "west" },
      },
    ];
  }
  return [
    {
      commander: {
        state: "present",
        value:
          commanderScenario === "nameOnly"
            ? {
                observed_name: { state: "present", value: "Known" },
              }
            : {
                observed_name: { state: "present", value: "Known" },
                source_entity_id: { state: "present", value: 101 },
              },
      },
      side: { state: "present", value: "west" },
    },
    {
      commander: { state: "unknown" },
      side: { state: "unknown" },
    },
  ];
}

function eventRow(
  eventType: string,
  observedPlayerReference: string | null,
): unknown {
  return {
    event_type: eventType,
    observed_player_ref: observedPlayerReference,
    parser_result_id: "result-1",
    payload: { victim_entity_id: 202 },
    source_ref: {},
  };
}
