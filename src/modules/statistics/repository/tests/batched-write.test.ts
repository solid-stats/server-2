import { describe, expect, it } from "vitest";

import { PgStatisticsRepository } from "../repository.js";

import { bountyInsertRows, countQueries } from "./insert-assertions.js";
import {
  ScriptedClient,
  bountyInsertParameters,
  commanderInsertParameters,
  poolFor,
} from "./utilities.js";

describe("PgStatisticsRepository batched write & bounded resolve (FINDING 4/5)", () => {
  // mace → ONE all-time scope, so a clean per-table insert count is asserted
  // without the sg two-scope doubling.
  it("issues exactly ONE multi-row insert per aggregate table, not one per row", async () => {
    const client = new ScriptedClient({
        auditGameType: "mace",
        withMembership: true,
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    // Two player rows + one squad row are produced for this fixture, yet the
    // replace must emit a single insert per table (the unnest batch), not N.
    await expect(
      repository.recalculatePlayerAndSquadStatsForParserResult("result-1"),
    ).resolves.toMatchObject({ playerStats: 2, squadStats: 1 });

    expect(countQueries(client, "insert into player_stats")).toBe(1);
    expect(countQueries(client, "insert into squad_stats")).toBe(1);
  });

  it("issues exactly ONE commander insert for multiple commander rows", async () => {
    const client = new ScriptedClient({ auditGameType: "mace" }),
      repository = new PgStatisticsRepository(poolFor(client));

    await repository.recalculateCommanderSideStatsForParserResult("result-1");

    expect(countQueries(client, "insert into commander_side_stats")).toBe(1);
    // The single insert carries all rows in array params (batched), not per-row.
    expect(commanderInsertParameters(client)).toHaveLength(1);
  });

  it("issues exactly ONE bounty insert for the all-time scope", async () => {
    const client = new ScriptedClient({
        auditGameType: "mace",
        withBountyMemberships: true,
        withVictimIdentity: true,
      }),
      repository = new PgStatisticsRepository(poolFor(client));

    await repository.recalculateBountyPointsForParserResult("result-1");

    expect(countQueries(client, "insert into bounty_points")).toBe(1);
    expect(bountyInsertParameters(client)).toHaveLength(1);
    // The single insert still carries byte-identical per-row data (re-zipped).
    expect(bountyInsertRows(client)).toHaveLength(1);
  });

  it("resolves name fallbacks in a single set-based statement regardless of occurrence count", async () => {
    const client = new ScriptedClient({ auditGameType: "mace" }),
      repository = new PgStatisticsRepository(poolFor(client));

    await repository.recalculatePlayerAndSquadStatsForParserResult("result-1");

    // FINDING 4: the fallback resolve is ONE `select occ.idx` set-based pass over
    // the unnested occurrences (two index-sargable EXISTS halves), never a
    // per-occurrence correlated probe loop. Bounded at 1 statement no matter how
    // many distinct (name, ts) occurrences the bucket contains.
    expect(countQueries(client, "select occ.idx")).toBe(1);
    // And the canonical-player/nickname fallback inserts stay batched (≤1 each).
    expect(
      countQueries(client, "insert into canonical_players"),
    ).toBeLessThanOrEqual(1);
    expect(
      countQueries(client, "insert into player_nicknames"),
    ).toBeLessThanOrEqual(1);
  });
});
