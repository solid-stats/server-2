/* eslint-disable camelcase, unicorn/no-null */
export type ArtifactStatus = "success" | "partial" | "skipped" | "failed";

export interface ParserArtifact {
  contract_version: string;
  destroyed_vehicles?: DestroyedVehicleRow[];
  diagnostics?: DiagnosticRow[];
  parser: Record<string, unknown>;
  players?: PlayerRow[];
  replay?: Record<string, unknown> | null;
  side_facts?: ReplaySideFacts;
  source: {
    checksum?: {
      state: "present";
      value: {
        algorithm: "sha256";
        value: string;
      };
    };
    replay_id?: string;
    source_file?: string;
  };
  status: ArtifactStatus;
  weapons?: WeaponRow[];
}

export interface PlayerRow {
  d?: number;
  eid: number;
  g?: string;
  k?: number;
  kfv?: number;
  kills?: KillRow[];
  n: string;
  nkd?: number;
  r?: string;
  s?: string;
  sid?: string;
  su?: number;
  td?: number;
  tk?: number;
  ud?: number;
  vk?: number;
}

export interface KillRow {
  av?: number;
  avc?: string;
  c: "enemy_kill" | "teamkill" | "unknown";
  v: number;
  w?: number;
}

export interface WeaponRow {
  id: number;
  n: string;
}

export interface DestroyedVehicleRow {
  a?: number;
  av?: number;
  avc?: string;
  c: string;
  dc?: string;
  de: number;
  dt?: string;
  w?: number;
}

export interface DiagnosticRow {
  code?: string;
  message?: string;
  severity?: string;
}

export interface ReplaySideFacts {
  commanders?: CommanderSideFact[];
  outcome?: OutcomeFact;
}

export interface CommanderSideFact {
  commander?: FieldPresence<EventActorReference>;
  side?: FieldPresence<string>;
}

export interface EventActorReference {
  observed_name?: FieldPresence<string>;
  source_entity_id?: FieldPresence<number>;
}

export interface OutcomeFact {
  status?: "inferred" | "known" | "unknown";
  winner_side?: FieldPresence<string>;
}

export type FieldPresence<T> =
  | {
      state: "present";
      value: T;
    }
  | {
      state: string;
      value?: T;
    };

type KillEventType = "kill" | "teamkill" | "unknown_kill";

export type NormalizedParserEvent =
  | {
      eventType: KillEventType;
      observedPlayerRef: string;
      payload: Record<string, unknown>;
      sourceRef: Record<string, unknown>;
    }
  | {
      eventType: "destroyed_vehicle";
      observedPlayerRef: string | null;
      payload: Record<string, unknown>;
      sourceRef: Record<string, unknown>;
    }
  | {
      eventType: "diagnostic";
      observedPlayerRef: null;
      payload: Record<string, unknown>;
      sourceRef: Record<string, unknown>;
    }
  | {
      eventType: "player_counter";
      observedPlayerRef: string;
      payload: Record<string, unknown>;
      sourceRef: Record<string, unknown>;
    };

export interface MappedParserArtifact {
  rawSnapshot: Record<string, unknown>;
  events: NormalizedParserEvent[];
}

export function mapParserArtifact(
  artifact: ParserArtifact,
): MappedParserArtifact {
  return {
    events: [
      ...playerCounterEvents(artifact),
      ...killEvents(artifact),
      ...destroyedVehicleEvents(artifact),
      ...diagnosticEvents(artifact),
    ],
    rawSnapshot: artifact as unknown as Record<string, unknown>,
  };
}

function playerCounterEvents(artifact: ParserArtifact): NormalizedParserEvent[] {
  return (artifact.players ?? []).flatMap((player) =>
    hasCompactCounters(player)
      ? [
          {
            eventType: "player_counter" as const,
            observedPlayerRef: String(player.eid),
            payload: {
              deaths_by_teamkills: player.td,
              deaths_total: player.d,
              kills: player.k,
              kills_from_vehicle: player.kfv,
              null_killer_deaths: player.nkd,
              player: playerSummary(player),
              suicides: player.su,
              teamkills: player.tk,
              unknown_deaths: player.ud,
              vehicle_kills: player.vk,
            },
            sourceRef: {
              player_entity_id: player.eid,
            },
          },
        ]
      : [],
  );
}

function hasCompactCounters(player: PlayerRow): boolean {
  return [
    player.d,
    player.k,
    player.kfv,
    player.nkd,
    player.su,
    player.td,
    player.tk,
    player.ud,
    player.vk,
  ].some((value) => value !== undefined);
}

function killEvents(artifact: ParserArtifact): NormalizedParserEvent[] {
  const events: NormalizedParserEvent[] = [];
  for (const player of artifact.players ?? []) {
    for (const [index, kill] of (player.kills ?? []).entries()) {
      events.push({
        eventType: killEventType(kill),
        observedPlayerRef: String(player.eid),
        payload: {
          attacker: playerSummary(player),
          classification: kill.c,
          victim_entity_id: kill.v,
          weapon_id: kill.w,
          weapon_name: weaponName(artifact.weapons ?? [], kill.w),
        },
        sourceRef: {
          player_entity_id: player.eid,
          player_kill_index: index,
        },
      });
    }
  }
  return events;
}

function destroyedVehicleEvents(
  artifact: ParserArtifact,
): NormalizedParserEvent[] {
  return (artifact.destroyed_vehicles ?? []).map((vehicle, index) => ({
    eventType: "destroyed_vehicle" as const,
    observedPlayerRef: vehicle.a === undefined ? null : String(vehicle.a),
    payload: {
      attacker_entity_id: vehicle.a,
      classification: vehicle.c,
      destroyed_class: vehicle.dc,
      destroyed_entity_id: vehicle.de,
      destroyed_type: vehicle.dt,
      weapon_id: vehicle.w,
      weapon_name: weaponName(artifact.weapons ?? [], vehicle.w),
    },
    sourceRef: {
      destroyed_vehicle_index: index,
    },
  }));
}

function diagnosticEvents(artifact: ParserArtifact): NormalizedParserEvent[] {
  return (artifact.diagnostics ?? []).map((diagnostic, index) => ({
    eventType: "diagnostic" as const,
    observedPlayerRef: null,
    payload: { ...diagnostic },
    sourceRef: {
      diagnostic_index: index,
    },
  }));
}

function killEventType(kill: KillRow): KillEventType {
  if (kill.c === "enemy_kill") {
    return "kill";
  }
  if (kill.c === "teamkill") {
    return "teamkill";
  }
  return "unknown_kill";
}

function playerSummary(player: PlayerRow): Record<string, unknown> {
  return {
    entity_id: player.eid,
    group: player.g,
    name: player.n,
    role: player.r,
    side: player.s,
    steam_id: player.sid,
  };
}

function weaponName(
  weapons: WeaponRow[],
  weaponId: number | undefined,
): string | null {
  if (weaponId === undefined) {
    return null;
  }
  return weapons.find((weapon) => weapon.id === weaponId)?.n ?? null;
}
