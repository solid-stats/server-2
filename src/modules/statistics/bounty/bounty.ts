/* eslint-disable camelcase */
const ROUND_SCALE = 100;
export type BountyEventType = "kill" | "teamkill" | "unknown_kill";

export interface BountyKillInput {
  attackerPlayerId: string;
  eventType: BountyEventType;
  replayId: string;
  victimPlayerId?: string;
  victimSquadId?: string;
}

export interface PreviousBountyStats {
  deaths: {
    total: number;
  };
  kills: number;
}

export interface BountyEffectivenessInput {
  players: Map<string, PreviousBountyStats>;
  squads: Map<string, PreviousBountyStats>;
}

export interface BountyPointRow {
  inputs: {
    base_score: 1;
    events: BountyPointEventEvidence[];
    total_points: number;
    version: 1;
  };
  playerId: string;
  points: number;
}

export type BountyPointEventEvidence =
  | {
      excluded_reason: "missing_victim" | "non_enemy_kill" | "teamkill";
      event_type: BountyEventType;
      points: 0;
      replay_id: string;
      victim_player_id?: string;
      victim_squad_id?: string;
    }
  | {
      event_type: "kill";
      player_factor: number;
      points: number;
      replay_id: string;
      squad_factor: number;
      victim_player_id: string;
      victim_squad_id?: string;
    };

export function calculateBountyPoints(
  kills: BountyKillInput[],
  previousStats: BountyEffectivenessInput,
): BountyPointRow[] {
  const rows = new Map<string, MutableBountyRow>();

  for (const kill of kills) {
    const row = bountyRow(rows, kill.attackerPlayerId),
      evidence = bountyEvidence(kill, previousStats);
    row.events.push(evidence);
    row.points += evidence.points;
  }

  return [...rows.entries()]
    .map(([playerId, row]) => ({
      inputs: {
        base_score: 1 as const,
        events: row.events,
        total_points: roundPoints(row.points),
        version: 1 as const,
      },
      playerId,
      points: roundPoints(row.points),
    }))
    .toSorted((left, right) => left.playerId.localeCompare(right.playerId));
}

interface MutableBountyRow {
  events: BountyPointEventEvidence[];
  points: number;
}

function bountyRow(
  rows: Map<string, MutableBountyRow>,
  playerId: string,
): MutableBountyRow {
  const existing = rows.get(playerId);
  if (existing !== undefined) {
    return existing;
  }
  const created = {
    events: [],
    points: 0,
  };
  rows.set(playerId, created);
  return created;
}

function bountyEvidence(
  kill: BountyKillInput,
  previousStats: BountyEffectivenessInput,
): BountyPointEventEvidence {
  if (kill.eventType === "teamkill") {
    return excludedEvidence(kill, "teamkill");
  }
  if (kill.eventType !== "kill") {
    return excludedEvidence(kill, "non_enemy_kill");
  }
  if (kill.victimPlayerId === undefined) {
    return excludedEvidence(kill, "missing_victim");
  }

  const playerFactor = effectiveness(
      previousStats.players.get(kill.victimPlayerId),
    ),
    squadFactor =
      kill.victimSquadId === undefined
        ? 0
        : effectiveness(previousStats.squads.get(kill.victimSquadId)),
    points = roundPoints(1 * (1 + playerFactor) * (1 + squadFactor));

  return {
    event_type: "kill",
    player_factor: playerFactor,
    points,
    replay_id: kill.replayId,
    squad_factor: squadFactor,
    victim_player_id: kill.victimPlayerId,
    ...(kill.victimSquadId === undefined
      ? {}
      : { victim_squad_id: kill.victimSquadId }),
  };
}

function excludedEvidence(
  kill: BountyKillInput,
  excludedReason: "missing_victim" | "non_enemy_kill" | "teamkill",
): BountyPointEventEvidence {
  return {
    event_type: kill.eventType,
    excluded_reason: excludedReason,
    points: 0,
    replay_id: kill.replayId,
    ...(kill.victimPlayerId === undefined
      ? {}
      : { victim_player_id: kill.victimPlayerId }),
    ...(kill.victimSquadId === undefined
      ? {}
      : { victim_squad_id: kill.victimSquadId }),
  };
}

function effectiveness(stats: PreviousBountyStats | undefined): number {
  if (stats === undefined) {
    return 0;
  }
  return stats.kills / Math.max(1, stats.deaths.total);
}

function roundPoints(points: number): number {
  return Math.round(points * ROUND_SCALE) / ROUND_SCALE;
}
