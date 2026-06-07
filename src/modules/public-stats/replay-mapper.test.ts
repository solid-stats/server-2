/* eslint-disable no-magic-numbers, unicorn/no-null */
import { describe, expect, it } from "vitest";

import {
  extractMapName,
  mapReplayDetail,
  mapReplayEvent,
  scrubActor,
  scrubPayload,
} from "./replay-mapper.js";

// ---------------------------------------------------------------------------
// extractMapName
// ---------------------------------------------------------------------------

describe("extractMapName", () => {
  it("returns null for null input", () => {
    expect(extractMapName(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(extractMapName(undefined)).toBeNull();
  });

  it("returns null for empty object", () => {
    expect(extractMapName({})).toBeNull();
  });

  it("reads 'mission' key first", () => {
    expect(extractMapName({ mission: "Altis" })).toBe("Altis");
  });

  it("falls through to 'missionName'", () => {
    expect(extractMapName({ missionName: "Everon" })).toBe("Everon");
  });

  it("falls through to 'world'", () => {
    expect(extractMapName({ world: "Stratis" })).toBe("Stratis");
  });

  it("falls through to 'worldName'", () => {
    expect(extractMapName({ worldName: "Tanoa" })).toBe("Tanoa");
  });

  it("falls through to 'map'", () => {
    expect(extractMapName({ map: "Chernarus" })).toBe("Chernarus");
  });

  it("falls through to 'mapName'", () => {
    expect(extractMapName({ mapName: "Sahrani" })).toBe("Sahrani");
  });

  it("returns the first matching key in priority order", () => {
    expect(
      extractMapName({ map: "Chernarus", mission: "Altis", world: "Stratis" }),
    ).toBe("Altis");
  });

  it("returns null when the matching key has a non-string value", () => {
    expect(extractMapName({ mission: 42 })).toBeNull();
  });

  it("returns null when the matching key has a null value", () => {
    expect(extractMapName({ mission: null })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// scrubPayload
// ---------------------------------------------------------------------------

const STEAM64 = "76561198012347890";

describe("scrubPayload", () => {
  it("passes through non-steam fields unchanged", () => {
    const input = { tick: 1000, weapon: "Rifle", position: [1, 2, 3] };
    const result = scrubPayload(input);
    expect(result["tick"]).toBe(1000);
    expect(result["weapon"]).toBe("Rifle");
    expect(result["position"]).toEqual([1, 2, 3]);
  });

  it("drops keys matching /steam_?id|sid|steam64/i at the top level", () => {
    const result = scrubPayload({ steam_id: STEAM64, name: "Alpha" });
    expect(Object.keys(result)).not.toContain("steam_id");
    expect(result["name"]).toBe("Alpha");
  });

  it("drops 'sid' key", () => {
    const result = scrubPayload({ sid: STEAM64 });
    expect(Object.keys(result)).not.toContain("sid");
  });

  it("drops 'steam64' key", () => {
    const result = scrubPayload({ steam64: STEAM64 });
    expect(Object.keys(result)).not.toContain("steam64");
  });

  it("drops 'steamId' key (camelCase, case-insensitive)", () => {
    const result = scrubPayload({ steamId: STEAM64 });
    expect(Object.keys(result)).not.toContain("steamId");
  });

  it("masks a Steam64 string value in a non-steam-named key", () => {
    const result = scrubPayload({ attacker_id: STEAM64 });
    // The Steam64 pattern in a value gets masked even if the key name is not steam-related
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/7656119\d{10}/);
  });

  it("deep-walks nested objects", () => {
    const input = {
      player: { name: "Alpha", steam_id: STEAM64, rank: 5 },
    };
    const result = scrubPayload(input);
    const player = result["player"] as Record<string, unknown>;
    expect(Object.keys(player)).not.toContain("steam_id");
    expect(player["name"]).toBe("Alpha");
    expect(player["rank"]).toBe(5);
  });

  it("deep-walks arrays", () => {
    const input = {
      crew: [
        { name: "Alpha", steam_id: STEAM64 },
        { name: "Bravo", steam_id: STEAM64 },
      ],
    };
    const result = scrubPayload(input);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/7656119\d{10}/);
    const crew = result["crew"] as Array<Record<string, unknown>>;
    expect(crew[0]?.["name"]).toBe("Alpha");
    expect(crew[1]?.["name"]).toBe("Bravo");
  });
});

// ---------------------------------------------------------------------------
// scrubActor
// ---------------------------------------------------------------------------

describe("scrubActor", () => {
  it("returns null for null input", () => {
    expect(scrubActor(null)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(scrubActor("string")).toBeNull();
    expect(scrubActor(42)).toBeNull();
  });

  it("extracts displayName from player block 'name' key", () => {
    const actor = scrubActor({ name: "Alpha" });
    expect(actor?.displayName).toBe("Alpha");
  });

  it("masks the steam id through maskSteamId choke point", () => {
    const actor = scrubActor({ name: "Alpha", steam_id: STEAM64 });
    expect(actor?.steamId).not.toBe(STEAM64);
    expect(actor?.steamId).toMatch(/^\.\.\./);
    // Full Steam64 must not appear
    expect(actor?.steamId).not.toMatch(/7656119\d{10}/);
  });

  it("returns steamId null when no steam_id key in player block", () => {
    const actor = scrubActor({ name: "Alpha" });
    expect(actor?.steamId).toBeNull();
  });

  it("returns null steamId when steam_id is not a string", () => {
    const actor = scrubActor({ name: "Alpha", steam_id: 12_345 });
    expect(actor?.steamId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mapReplayEvent — B-1 control (CRITICAL: no full Steam64 in output)
// ---------------------------------------------------------------------------

describe("mapReplayEvent B-1 control — Steam64 scrubbing", () => {
  it("masks Steam64 in payload.player.steam_id AND payload.attacker.steam_id AND deeply nested payload.context.crew[2].steam_id", () => {
    const payload = {
      attacker: { name: "Attacker", steam_id: STEAM64 },
      context: {
        crew: [
          { name: "CrewA", steam_id: STEAM64 },
          { name: "CrewB", steam_id: STEAM64 },
          { name: "CrewC", steam_id: STEAM64 },
        ],
      },
      player: { name: "Alpha", steam_id: STEAM64 },
      tick: 500,
      weapon: "Rifle",
    };

    const event = mapReplayEvent({
      event_type: "kill",
      id: "00000000-0000-4000-8000-000000000001",
      occurred_at: new Date("2026-05-02T12:00:00.000Z"),
      payload,
    });

    const serialized = JSON.stringify(event);

    // Zero full Steam64 occurrences anywhere in the serialized output
    const matches = serialized.match(/7656119\d{10}/g);
    expect(matches).toBeNull();

    // Non-steam fields must survive
    expect(event.payload["tick"]).toBe(500);
    expect(event.payload["weapon"]).toBe("Rifle");
  });

  it("derives actor from payload.player with masked steamId, never raw", () => {
    const event = mapReplayEvent({
      event_type: "player_counter",
      id: "00000000-0000-4000-8000-000000000002",
      occurred_at: null,
      payload: { player: { name: "Alpha", steam_id: STEAM64 } },
    });

    expect(event.actor?.displayName).toBe("Alpha");
    expect(event.actor?.steamId).not.toBe(STEAM64);
    expect(event.actor?.steamId).toMatch(/^\.\.\./);
  });

  it("returns actor null when no player block in payload", () => {
    const event = mapReplayEvent({
      event_type: "diagnostic",
      id: "00000000-0000-4000-8000-000000000003",
      occurred_at: null,
      payload: { message: "Something happened" },
    });

    expect(event.actor).toBeNull();
  });

  it("returns occurredAt as ISO string when occurred_at is a Date", () => {
    const ts = new Date("2026-05-02T12:00:00.000Z");
    const event = mapReplayEvent({
      event_type: "kill",
      id: "00000000-0000-4000-8000-000000000004",
      occurred_at: ts,
      payload: {},
    });

    expect(event.occurredAt).toBe("2026-05-02T12:00:00.000Z");
  });

  it("returns occurredAt null when occurred_at is null", () => {
    const event = mapReplayEvent({
      event_type: "kill",
      id: "00000000-0000-4000-8000-000000000005",
      occurred_at: null,
      payload: {},
    });

    expect(event.occurredAt).toBeNull();
  });

  it("prefers payload.event_type over the event_type column for eventType", () => {
    const event = mapReplayEvent({
      event_type: "kill",
      id: "00000000-0000-4000-8000-000000000006",
      occurred_at: null,
      payload: { event_type: "player_counter" },
    });

    expect(event.eventType).toBe("player_counter");
  });

  it("falls back to the event_type column when payload has no event_type", () => {
    const event = mapReplayEvent({
      event_type: "destroyed_vehicle",
      id: "00000000-0000-4000-8000-000000000007",
      occurred_at: null,
      payload: { tick: 100 },
    });

    expect(event.eventType).toBe("destroyed_vehicle");
  });
});

// ---------------------------------------------------------------------------
// mapReplayDetail
// ---------------------------------------------------------------------------

const MASKED_PREFIX = "...";

/** Minimal raw_snapshot object for mapReplayDetail tests */
function makeSnapshot(overrides: Record<string, unknown> = {}): {
  artifact: Record<string, unknown>;
  replayRow: Parameters<typeof mapReplayDetail>[0];
} {
  const replayRow = {
    created_at: new Date("2026-05-01T00:00:00.000Z"),
    id: "00000000-0000-4000-8000-000000000011",
    pr_created_at: new Date("2026-05-02T12:00:00.000Z"),
    raw_snapshot: {
      players: [
        { eid: 1, k: 3, d: 1, n: "Alpha", s: "west", sid: STEAM64, tk: 0 },
        { eid: 2, k: 1, d: 3, n: "Bravo", s: "east", tk: 0 },
      ],
      replay: { mission: "Altis" },
      side_facts: {
        outcome: { status: "known", winner_side: { state: "present", value: "west" } },
      },
      ...overrides,
    } as Record<string, unknown>,
    replay_timestamp: new Date("2026-05-02T10:00:00.000Z"),
    rotation_id: "00000000-0000-4000-8000-000000000501",
    rotation_name: "Rotation 1",
    rotation_slug: "rotation-1",
    slug: "solidgames-replay-1",
  };
  return { artifact: replayRow.raw_snapshot, replayRow };
}

describe("mapReplayDetail", () => {
  it("extracts map name from raw_snapshot.replay.mission", () => {
    const { replayRow } = makeSnapshot();
    const detail = mapReplayDetail(replayRow);
    expect(detail.map).toBe("Altis");
  });

  it("returns map null when no replay key in snapshot", () => {
    const { replayRow } = makeSnapshot({ replay: null });
    const detail = mapReplayDetail(replayRow);
    expect(detail.map).toBeNull();
  });

  it("masks participant Steam64 — never returns the full Steam64", () => {
    const { replayRow } = makeSnapshot();
    const detail = mapReplayDetail(replayRow);
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toMatch(/7656119\d{10}/);
    const alpha = detail.participants.find((p) => p.player.displayName === "Alpha");
    expect(alpha?.steamId).toMatch(new RegExp(`^${MASKED_PREFIX}`));
  });

  it("returns steamId null for participants without sid", () => {
    const { replayRow } = makeSnapshot();
    const detail = mapReplayDetail(replayRow);
    const bravo = detail.participants.find((p) => p.player.displayName === "Bravo");
    expect(bravo?.steamId).toBeNull();
  });

  it("groups players by side into sides array", () => {
    const { replayRow } = makeSnapshot();
    const detail = mapReplayDetail(replayRow);
    const west = detail.sides.find((s) => s.side === "west");
    const east = detail.sides.find((s) => s.side === "east");
    expect(west?.participantCount).toBe(1);
    expect(east?.participantCount).toBe(1);
  });

  it("reads winner_side from FieldPresence (state=present)", () => {
    const { replayRow } = makeSnapshot();
    const detail = mapReplayDetail(replayRow);
    const west = detail.sides.find((s) => s.side === "west");
    expect(west?.isWinner).toBe(true);
    const east = detail.sides.find((s) => s.side === "east");
    expect(east?.isWinner).toBe(false);
  });

  it("computes provenance from maxTimestamp over pr_created_at / replay_timestamp / created_at", () => {
    const { replayRow } = makeSnapshot();
    const detail = mapReplayDetail(replayRow);
    // pr_created_at (2026-05-02T12:00) is the latest
    expect(detail.provenance.lastUpdatedAt).toBe("2026-05-02T12:00:00.000Z");
  });

  it("provenance does not use now() — lastUpdatedAt is derived from row timestamps only", () => {
    const { replayRow } = makeSnapshot();
    replayRow.pr_created_at = null as unknown as Date;
    replayRow.replay_timestamp = null as unknown as Date;
    const detail = mapReplayDetail(replayRow);
    // Only created_at (2026-05-01) is available
    expect(detail.provenance.lastUpdatedAt).toBe("2026-05-01T00:00:00.000Z");
  });
});
