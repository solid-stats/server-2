/* eslint-disable camelcase, id-length, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { mapParserArtifact, type ParserArtifact } from "./parser-artifact.js";

const artifact: ParserArtifact = {
  contract_version: "3.0.0",
  destroyed_vehicles: [
    {
      a: 101,
      c: "enemy",
      dc: "rhs_btr80",
      de: 601,
      dt: "vehicle",
      w: 1,
    },
    {
      c: "unknown",
      de: 602,
    },
    {
      c: "enemy",
      de: 603,
      w: 999,
    },
  ],
  diagnostics: [{ code: "schema.extra", message: "extra field" }],
  parser: { name: "replay-parser-2", version: "0.1.0" },
  players: [
    {
      eid: 101,
      g: "Alpha",
      kills: [
        { c: "enemy_kill", v: 202, w: 1 },
        { c: "teamkill", v: 303 },
        { c: "unknown", v: 404 },
      ],
      n: "Afganor",
      r: "Rifleman",
      s: "west",
    },
    {
      eid: 102,
      n: "No kills",
    },
  ],
  source: {
    replay_id: "replay-1",
  },
  status: "success",
  weapons: [{ id: 1, n: "rhs_t72" }],
};

describe("mapParserArtifact", () => {
  it("maps compact parser rows to normalized parser events", () => {
    const mapped = mapParserArtifact(artifact);

    expect(mapped.rawSnapshot).toBe(artifact);
    expect(mapped.events.map((event) => event.eventType)).toEqual([
      "kill",
      "teamkill",
      "unknown_kill",
      "destroyed_vehicle",
      "destroyed_vehicle",
      "destroyed_vehicle",
      "diagnostic",
    ]);
    expect(mapped.events[0]).toMatchObject({
      observedPlayerRef: "101",
      payload: {
        classification: "enemy_kill",
        victim_entity_id: 202,
        weapon_name: "rhs_t72",
      },
      sourceRef: {
        player_kill_index: 0,
      },
    });
    expect(mapped.events[1]).toMatchObject({
      eventType: "teamkill",
      payload: {
        weapon_name: null,
      },
    });
    expect(mapped.events[4]).toMatchObject({
      observedPlayerRef: null,
      payload: {
        destroyed_entity_id: 602,
      },
    });
    expect(mapped.events[5]).toMatchObject({
      payload: {
        weapon_name: null,
      },
    });
  });

  it("maps destroyed vehicles when weapon lookup tables are absent", () => {
    const mapped = mapParserArtifact({
      contract_version: "3.0.0",
      destroyed_vehicles: [{ c: "enemy", de: 601, w: 1 }],
      parser: {},
      source: {},
      status: "success",
    });

    expect(mapped.events[0]?.payload).toMatchObject({
      weapon_name: null,
    });
  });

  it("maps missing optional tables to an empty event set", () => {
    expect(
      mapParserArtifact({
        contract_version: "3.0.0",
        parser: {},
        source: {},
        status: "partial",
      }).events,
    ).toEqual([]);
  });
});
