/* eslint-disable camelcase, id-length */
export type CommanderScenario =
  | "default"
  | "missingOutcome"
  | "nameOnly"
  | "playerNameOnly"
  | "unknownActor"
  | "unknownWinner";

export function parserResultRows(
  commanderScenario: CommanderScenario,
): unknown[] {
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

export function eventRow(
  eventType: string,
  observedPlayerReference: string | null,
  payload?: Record<string, unknown>,
): unknown {
  return {
    event_type: eventType,
    observed_player_ref: observedPlayerReference,
    parser_result_id: "result-1",
    payload: payload ?? { victim_entity_id: 202 },
    source_ref: {},
  };
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
