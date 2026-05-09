/* eslint-disable unicorn/no-null */
export interface CommanderReplayInput {
  commanders: CommanderEvidence[];
  outcome: CommanderOutcomeEvidence;
  replayId: string;
}

export interface CommanderEvidence {
  playerId?: string;
  side: string;
}

export interface CommanderOutcomeEvidence {
  status: "inferred" | "known" | "unknown";
  winnerSide?: string;
}

export interface CommanderSideAggregateRow {
  knownLosses: number;
  knownWins: number;
  playerId: string | null;
  side: string;
  unknownOutcomes: number;
}

export function calculateCommanderSideAggregates(
  replays: CommanderReplayInput[],
): CommanderSideAggregateRow[] {
  const aggregates = new Map<string, MutableCommanderAggregate>();

  for (const replay of replays) {
    for (const commander of replay.commanders) {
      const aggregate = commanderAggregate(aggregates, commander);
      if (
        replay.outcome.status === "unknown" ||
        replay.outcome.winnerSide === undefined
      ) {
        aggregate.unknownOutcomes += 1;
        continue;
      }
      if (
        normalizedSide(commander.side) ===
        normalizedSide(replay.outcome.winnerSide)
      ) {
        aggregate.knownWins += 1;
      } else {
        aggregate.knownLosses += 1;
      }
    }
  }

  return [...aggregates.values()]
    .toSorted((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map((aggregate) => ({
      knownLosses: aggregate.knownLosses,
      knownWins: aggregate.knownWins,
      playerId: aggregate.playerId,
      side: aggregate.side,
      unknownOutcomes: aggregate.unknownOutcomes,
    }));
}

interface MutableCommanderAggregate {
  knownLosses: number;
  knownWins: number;
  playerId: string | null;
  side: string;
  sortKey: string;
  unknownOutcomes: number;
}

function commanderAggregate(
  aggregates: Map<string, MutableCommanderAggregate>,
  commander: CommanderEvidence,
): MutableCommanderAggregate {
  const key = `${normalizedSide(commander.side)}:${commander.playerId ?? ""}`,
    existing = aggregates.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = {
    knownLosses: 0,
    knownWins: 0,
    playerId: commander.playerId ?? null,
    side: normalizedSide(commander.side),
    sortKey: key,
    unknownOutcomes: 0,
  };
  aggregates.set(key, created);
  return created;
}

function normalizedSide(side: string): string {
  return side.toLowerCase();
}
