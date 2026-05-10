/* eslint-disable camelcase, unicorn/no-null */
import { expect, it } from "vitest";

import {
  NoopAuditPatchRecalculator,
  PgAuditPatchRecalculator,
} from "./audit-recalculator.js";

import type { PgStatisticsRepository } from "../../statistics/repository/repository.js";
import type { Pool } from "pg";

it("NoopAuditPatchRecalculator should report recalculated status", async () => {
  const recalculator = new NoopAuditPatchRecalculator();

  await expect(
    recalculator.recalculateForPatch({
      affectedEntityType: "player_stat",
      patch: { kills: 12 },
      reason: "Manual correction",
      recalculationStatus: "pending",
      requestId: "request-1",
    }),
  ).resolves.toEqual({ status: "recalculated" });
});

it("PgAuditPatchRecalculator should recalculate direct parser result targets", async () => {
  const statistics = statisticsDouble(),
    recalculator = new PgAuditPatchRecalculator(poolDouble(null), statistics);

  await expect(
    recalculator.recalculateForPatch({
      affectedEntityId: "parser-result-1",
      affectedEntityType: "parser_result",
      patch: {},
      reason: "Manual correction",
      recalculationStatus: "pending",
      requestId: "request-1",
    }),
  ).resolves.toEqual({
    status: "recalculated,recalculated,recalculated",
  });
  expect(statistics.recalculated).toEqual([
    "player-squad:parser-result-1",
    "commander:parser-result-1",
    "bounty:parser-result-1",
  ]);
});

it("PgAuditPatchRecalculator should resolve replay targets to current parser results", async () => {
  const statistics = statisticsDouble(),
    pool = poolDouble("parser-result-2"),
    recalculator = new PgAuditPatchRecalculator(pool, statistics);

  await expect(
    recalculator.recalculateForPatch({
      affectedEntityId: "replay-1",
      affectedEntityType: "replay",
      patch: {},
      reason: "Manual correction",
      recalculationStatus: "pending",
      requestId: "request-1",
    }),
  ).resolves.toEqual({
    status: "recalculated,recalculated,recalculated",
  });
  expect(statistics.recalculated).toContain("bounty:parser-result-2");
});

it("PgAuditPatchRecalculator should apply parser event patches before recalculation", async () => {
  const statistics = statisticsDouble(),
    pool = poolDouble("parser-result-event"),
    recalculator = new PgAuditPatchRecalculator(pool, statistics);

  await expect(
    recalculator.recalculateForPatch({
      affectedEntityId: "event-1",
      affectedEntityType: "parser_event",
      patch: { victim_entity_id: 101 },
      reason: "Manual correction",
      recalculationStatus: "pending",
      requestId: "request-1",
    }),
  ).resolves.toEqual({
    status: "recalculated,recalculated,recalculated",
  });
  expect(pool.queries.join("\n")).toContain("update parser_events");
});

it("PgAuditPatchRecalculator should report missing parser event targets", async () => {
  const recalculator = new PgAuditPatchRecalculator(
    poolDouble(null),
    statisticsDouble(),
  );

  await expect(
    recalculator.recalculateForPatch({
      affectedEntityId: "event-1",
      affectedEntityType: "parser_event",
      patch: {},
      reason: "Manual correction",
      recalculationStatus: "pending",
      requestId: "request-1",
    }),
  ).resolves.toEqual({ status: "no_parser_result_target" });
});

it("PgAuditPatchRecalculator should report untargeted audit patches", async () => {
  const recalculator = new PgAuditPatchRecalculator(
    poolDouble(null),
    statisticsDouble(),
  );

  await expect(
    recalculator.recalculateForPatch({
      affectedEntityType: "player",
      patch: {},
      reason: "Manual correction",
      recalculationStatus: "pending",
      requestId: "request-1",
    }),
  ).resolves.toEqual({ status: "no_parser_result_target" });
  await expect(
    recalculator.recalculateForPatch({
      affectedEntityId: "player-1",
      affectedEntityType: "player",
      patch: {},
      reason: "Manual correction",
      recalculationStatus: "pending",
      requestId: "request-1",
    }),
  ).resolves.toEqual({ status: "no_parser_result_target" });
  await expect(
    recalculator.recalculateForPatch({
      affectedEntityId: "replay-1",
      affectedEntityType: "replay",
      patch: {},
      reason: "Manual correction",
      recalculationStatus: "pending",
      requestId: "request-1",
    }),
  ).resolves.toEqual({ status: "no_parser_result_target" });
});

function statisticsDouble(): PgStatisticsRepository & {
  recalculated: string[];
} {
  const recalculated: string[] = [],
    result = {
      rotationId: "rotation-1",
      status: "recalculated" as const,
    };
  return {
    recalculated,
    async recalculateBountyPointsForParserResult(parserResultId: string) {
      recalculated.push(`bounty:${parserResultId}`);
      return { ...result, bountyRows: 1 };
    },
    async recalculateCommanderSideStatsForParserResult(parserResultId: string) {
      recalculated.push(`commander:${parserResultId}`);
      return { ...result, commanderStats: 1 };
    },
    async recalculatePlayerAndSquadStatsForParserResult(
      parserResultId: string,
    ) {
      recalculated.push(`player-squad:${parserResultId}`);
      return { ...result, playerStats: 1, squadStats: 1 };
    },
  } as unknown as PgStatisticsRepository & { recalculated: string[] };
}

function poolDouble(parserResultId: string | null): Pool & {
  queries: string[];
} {
  const queries: string[] = [];
  return {
    queries,
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("from parser_events")) {
        return {
          rows:
            parserResultId === null
              ? []
              : [
                  {
                    parser_result_id: parserResultId,
                  },
                ],
        };
      }
      return {
        rows:
          parserResultId === null
            ? []
            : [
                {
                  id: parserResultId,
                },
              ],
      };
    },
  } as unknown as Pool & { queries: string[] };
}
