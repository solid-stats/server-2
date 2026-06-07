/* eslint-disable unicorn/no-null */
import { maskSteamId } from "./routes/pagination/mask.js";
import { maxTimestamp } from "./routes/provenance.js";

import type {
  ReplayDetail,
  ReplayEvent,
  ReplayEventActor,
  ReplayParticipant,
  ReplaySideSummary,
} from "./routes/models.js";
import type { FieldPresence, PlayerRow, ReplaySideFacts } from "../statistics/parser-artifact.js";

// ---------------------------------------------------------------------------
// extractMapName
// ---------------------------------------------------------------------------

const MAP_CANDIDATE_KEYS = [
  "mission",
  "missionName",
  "world",
  "worldName",
  "map",
  "mapName",
] as const;

/**
 * Extract the map name from a raw_snapshot `replay` block by scanning the
 * candidate keys in priority order. Returns the first string value found,
 * or null when the input is absent/empty/non-string.
 */
export function extractMapName(
  replay: Record<string, unknown> | null | undefined,
): string | null {
  if (replay == null) {
    return null;
  }
  for (const key of MAP_CANDIDATE_KEYS) {
    const value = replay[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// scrubPayload — B-1 control: Steam64 deep-walk scrubber
// ---------------------------------------------------------------------------

/** Pattern matching a full Steam64 id (`7656119` + 10 digits = 17 digits total). */
const STEAM64_PATTERN = /7656119\d{10}/;

/** Keys whose names contain a steam id reference (case-insensitive). */
const STEAM_KEY_PATTERN = /steam_?id|sid|steam64/i;

/**
 * Deep-walk a jsonb payload value and, at every depth/array index:
 * - Drop any object key whose name matches STEAM_KEY_PATTERN.
 * - Mask any string value matching STEAM64_PATTERN through maskSteamId.
 *
 * This is the B-1 control: no full Steam64 may appear anywhere in the mapped
 * event payload. mapReplayEvent builds its payload exclusively via this
 * function and never returns the raw payload directly.
 */
export function scrubPayload(payload: unknown): Record<string, unknown> {
  return scrubObject(payload);
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    // Mask any string value that is itself a Steam64
    return STEAM64_PATTERN.test(value) ? maskSteamId(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((element) => scrubValue(element));
  }
  if (value !== null && typeof value === "object") {
    return scrubObject(value);
  }
  return value;
}

function scrubObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    // Drop any key that names a steam id field
    if (STEAM_KEY_PATTERN.test(key)) {
      continue;
    }
    result[key] = scrubValue(val);
  }
  return result;
}

// ---------------------------------------------------------------------------
// scrubActor — derive the masked actor ref from a player block
// ---------------------------------------------------------------------------

/**
 * Derive a masked actor reference from a `payload.player` or
 * `payload.observed_player_ref` block. The steam id — if present — is routed
 * through the `maskSteamId` choke point; the full Steam64 is never returned.
 * Returns null when the input is absent or not an object.
 */
export function scrubActor(playerBlock: unknown): ReplayEventActor | null {
  if (
    playerBlock === null ||
    playerBlock === undefined ||
    typeof playerBlock !== "object" ||
    Array.isArray(playerBlock)
  ) {
    return null;
  }
  const block = playerBlock as Record<string, unknown>;
  const displayName =
    typeof block["name"] === "string" ? block["name"] : null;
  const rawSid = block["steam_id"] ?? block["sid"] ?? block["steamId"];
  const steamId =
    typeof rawSid === "string" ? maskSteamId(rawSid) : null;
  return { displayName, steamId };
}

// ---------------------------------------------------------------------------
// Row shapes consumed by the mapper
// ---------------------------------------------------------------------------

/**
 * The database row returned by getReplay (includes raw_snapshot + replay join
 * cols + optional rotation). The repository shapes this before calling here.
 */
export interface ReplayDetailRow {
  id: string;
  slug: string | null;
  replay_timestamp: Date | null;
  created_at: Date;
  rotation_id: string | null;
  rotation_name: string | null;
  rotation_slug: string | null;
  /** pr.created_at — the current parser_result's timestamp for provenance. */
  pr_created_at: Date | null;
  raw_snapshot: Record<string, unknown> | null;
}

/**
 * The database row returned by getReplayEvents.
 */
export interface ReplayEventRow {
  id: string;
  event_type: string;
  occurred_at: Date | null;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// mapReplayDetail
// ---------------------------------------------------------------------------

/**
 * Map a raw replay + parser_result row into the ReplayDetail shape.
 * Every `sid` in players[] is routed through maskSteamId — the full Steam64
 * never appears in the output.
 */
export function mapReplayDetail(row: ReplayDetailRow): ReplayDetail {
  const snapshot = row.raw_snapshot ?? {};
  const rawReplay = snapshot["replay"];
  const replayBlock =
    rawReplay !== null && typeof rawReplay === "object" && !Array.isArray(rawReplay)
      ? (rawReplay as Record<string, unknown>)
      : null;

  const players = extractPlayers(snapshot);
  const sideFacts = extractSideFacts(snapshot);

  const sides = buildSides(players, sideFacts);
  const participants = buildParticipants(players);

  const rotation =
    row.rotation_id !== null && row.rotation_name !== null && row.rotation_slug !== null
      ? {
          id: row.rotation_id,
          name: row.rotation_name,
          slug: row.rotation_slug,
        }
      : null;

  return {
    id: row.id,
    map: extractMapName(replayBlock),
    participants,
    provenance: {
      lastUpdatedAt: maxTimestamp([row.pr_created_at, row.replay_timestamp, row.created_at]),
    },
    replayTimestamp:
      row.replay_timestamp === null ? null : row.replay_timestamp.toISOString(),
    rotation,
    sides,
    slug: row.slug,
  };
}

function extractPlayers(snapshot: Record<string, unknown>): PlayerRow[] {
  const raw = snapshot["players"];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (p): p is PlayerRow =>
      p !== null && typeof p === "object" && "eid" in p && "n" in p,
  );
}

function extractSideFacts(snapshot: Record<string, unknown>): ReplaySideFacts | null {
  const raw = snapshot["side_facts"];
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  return raw as ReplaySideFacts;
}

function resolveWinnerSide(sideFacts: ReplaySideFacts | null): string | null {
  const winnerSide = sideFacts?.outcome?.winner_side;
  if (winnerSide === undefined) {
    return null;
  }
  return winnerSide.state === "present" && typeof winnerSide.value === "string"
    ? winnerSide.value
    : null;
}

function resolveOutcomeStatus(sideFacts: ReplaySideFacts | null): string {
  return sideFacts?.outcome?.status ?? "unknown";
}

function buildSides(
  players: PlayerRow[],
  sideFacts: ReplaySideFacts | null,
): ReplaySideSummary[] {
  const winnerSide = resolveWinnerSide(sideFacts);
  const outcomeStatus = resolveOutcomeStatus(sideFacts);

  // Group players by side
  const sideMap = new Map<string, number>();
  for (const player of players) {
    const side = player.s ?? "unknown";
    sideMap.set(side, (sideMap.get(side) ?? 0) + 1);
  }

  return [...sideMap.entries()].map(([side, participantCount]) => {
    const isWinner = winnerSide === null ? null : side === winnerSide;
    return {
      isWinner,
      outcome: { status: outcomeStatus, winnerSide },
      participantCount,
      side,
    };
  });
}

function buildParticipants(players: PlayerRow[]): ReplayParticipant[] {
  return players.map((player) => {
    const steamId =
      typeof player.sid === "string" ? maskSteamId(player.sid) : null;
    return {
      deaths: player.d ?? 0,
      kills: player.k ?? 0,
      player: { displayName: player.n, id: null, slug: null },
      steamId,
      teamkills: player.tk ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// mapReplayEvent
// ---------------------------------------------------------------------------

/**
 * Map a raw parser_events row into the ReplayEvent shape.
 *
 * B-1 control: The payload is NEVER returned raw. It passes through
 * `scrubPayload`, which deep-walks and drops/masks every steam id at any
 * depth. The actor is derived via `scrubActor`, which also masks through
 * `maskSteamId`. The full Steam64 never appears in the mapped output.
 */
export function mapReplayEvent(row: ReplayEventRow): ReplayEvent {
  const scrubbedPayload = scrubPayload(row.payload);

  // eventType: prefer payload.event_type over the column value
  const rawPayloadEventType = row.payload["event_type"];
  const eventType =
    typeof rawPayloadEventType === "string" ? rawPayloadEventType : row.event_type;

  // Actor: derived from payload.player or payload.observed_player_ref
  const playerBlock = row.payload["player"] ?? row.payload["observed_player_ref"] ?? null;
  const actor = scrubActor(playerBlock);

  return {
    actor,
    eventType,
    id: row.id,
    occurredAt: row.occurred_at === null ? null : row.occurred_at.toISOString(),
    payload: scrubbedPayload,
  };
}

// Re-export the FieldPresence alias to avoid direct import in tests
export type { FieldPresence };
