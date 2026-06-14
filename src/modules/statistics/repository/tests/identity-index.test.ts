/* eslint-disable camelcase, id-length, no-inline-comments, unicorn/no-null */
import { describe, expect, it } from "vitest";

import {
  bestPlayerIdentityIndexed,
  buildPlayerIdentityIndex,
  playerIdentityMatchPriority,
  type PlayerIdentityRow,
} from "../repository.js";

import type { ParserArtifact } from "../../parser-artifact.js";

type ArtifactPlayer = NonNullable<ParserArtifact["players"]>[number];

/**
 * The ORACLE: the prior O(|identities|)-per-player `bestPlayerIdentity` scan,
 * reproduced verbatim here (flatMap over the whole array + stable `.toSorted` by
 * descending priority, first element wins). FINDING 3 replaces this with an
 * O(1)-lookup index; this test cross-checks that the index resolves the SAME
 * identity as this scan for every seeded input, so the perf change is proven
 * behavior-preserving rather than merely "looks equivalent".
 */
function bestPlayerIdentityScan(
  identities: PlayerIdentityRow[],
  player: ArtifactPlayer,
  replayTimestamp: Date,
): PlayerIdentityRow | undefined {
  return identities
    .flatMap((identity) => {
      const priority = playerIdentityMatchPriority(
        identity,
        player,
        replayTimestamp,
      );
      return priority === undefined ? [] : [{ identity, priority }];
    })
    .toSorted((left, right) => right.priority - left.priority)[0]?.identity;
}

function identityRow(
  overrides: Partial<PlayerIdentityRow> & { player_id: string },
): PlayerIdentityRow {
  return {
    display_name: overrides.player_id,
    nickname: null,
    nickname_observed_from: null,
    nickname_observed_to: null,
    steam_id: null,
    ...overrides,
  };
}

const TS = new Date("2024-06-01T00:00:00.000Z");

// A deliberately adversarial seeded corpus: steam-id, active-nickname-in-window,
// expired-nickname, display-name-only, duplicate display names across players (to
// exercise the first-in-array tie-break), and players matching nothing.
const IDENTITIES: PlayerIdentityRow[] = [
  identityRow({
    display_name: "Alpha",
    player_id: "p-alpha",
    steam_id: "sid-1",
  }),
  identityRow({
    display_name: "Bravo",
    nickname: "Brav",
    nickname_observed_from: new Date("2024-01-01T00:00:00.000Z"),
    nickname_observed_to: new Date("2024-12-31T00:00:00.000Z"),
    player_id: "p-bravo",
  }),
  identityRow({
    display_name: "Charlie",
    nickname: "Char",
    nickname_observed_from: new Date("2020-01-01T00:00:00.000Z"),
    nickname_observed_to: new Date("2020-12-31T00:00:00.000Z"),
    player_id: "p-charlie",
  }),
  // Two players share lower(display_name) "dup" — the scan's stable sort keeps the
  // FIRST one on a priority tie; the index must do the same.
  identityRow({ display_name: "Dup", player_id: "p-dup-first" }),
  identityRow({ display_name: "dup", player_id: "p-dup-second" }),
  // A player whose display_name collides with another's active nickname: nickname
  // (priority 2) must beat display_name (priority 1) regardless of array order.
  identityRow({ display_name: "echoes", player_id: "p-echo-display" }),
  identityRow({
    display_name: "Echo Real",
    nickname: "Echoes",
    nickname_observed_from: null,
    nickname_observed_to: null,
    player_id: "p-echo-nick",
  }),
  // Steam id AND a name that matches a different player's display — steam wins.
  identityRow({
    display_name: "Foxtrot",
    player_id: "p-fox",
    steam_id: "sid-2",
  }),
  identityRow({ display_name: "sid-clash", player_id: "p-fox-nameclash" }),
];

const PLAYERS: ArtifactPlayer[] = [
  { eid: 1, n: "Alpha", sid: "sid-1" }, // steam match
  { eid: 2, n: "Alpha" }, // display match (no sid)
  { eid: 3, n: "Brav" }, // active nickname in window
  { eid: 4, n: "Char" }, // expired nickname → falls through to nothing
  { eid: 5, n: "Charlie" }, // display match
  { eid: 6, n: "DUP" }, // duplicate display, tie-break first
  { eid: 7, n: "Echoes" }, // nickname (p-echo-nick) beats display (none here)
  { eid: 8, n: "echoes" }, // display match p-echo-display, but nickname also matches → nickname wins
  { eid: 9, n: "Foxtrot", sid: "sid-2" }, // steam match
  { eid: 10, n: "sid-clash", sid: "sid-2" }, // steam (sid-2 → p-fox) beats display (p-fox-nameclash)
  { eid: 11, n: "Ghost" }, // matches nothing
  { eid: 12, n: "Foxtrot" }, // display match p-fox (no sid)
];

describe("player identity index (FINDING 3 — O(1) resolution)", () => {
  it("resolves every seeded player identically to the prior per-player scan", () => {
    const index = buildPlayerIdentityIndex(IDENTITIES);

    for (const player of PLAYERS) {
      const fromScan = bestPlayerIdentityScan(IDENTITIES, player, TS),
        fromIndex = bestPlayerIdentityIndexed(index, player, TS);
      expect(fromIndex).toEqual(fromScan);
    }
  });

  it("preserves the first-in-array tie-break for duplicate display names", () => {
    const index = buildPlayerIdentityIndex(IDENTITIES);
    expect(
      bestPlayerIdentityIndexed(index, { eid: 6, n: "DUP" }, TS)?.player_id,
    ).toBe("p-dup-first");
  });

  it("matches the scan across a sweep of timestamps spanning every nickname window", () => {
    const index = buildPlayerIdentityIndex(IDENTITIES),
      timestamps = [
        new Date("2019-01-01T00:00:00.000Z"),
        new Date("2020-06-01T00:00:00.000Z"),
        new Date("2024-06-01T00:00:00.000Z"),
        new Date("2030-01-01T00:00:00.000Z"),
      ];

    for (const ts of timestamps) {
      for (const player of PLAYERS) {
        expect(bestPlayerIdentityIndexed(index, player, ts)).toEqual(
          bestPlayerIdentityScan(IDENTITIES, player, ts),
        );
      }
    }
  });

  it("returns undefined for a player matching no identity (index and scan agree)", () => {
    const index = buildPlayerIdentityIndex(IDENTITIES),
      ghost: ArtifactPlayer = { eid: 99, n: "Nobody", sid: "sid-absent" };
    expect(bestPlayerIdentityIndexed(index, ghost, TS)).toBeUndefined();
    expect(bestPlayerIdentityScan(IDENTITIES, ghost, TS)).toBeUndefined();
  });
});
