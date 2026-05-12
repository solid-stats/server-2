/* eslint-disable prefer-arrow-callback */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  coverageReport: vi.fn(),
  poolEnd: vi.fn(),
  recalculateReport: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: vi.fn().mockImplementation(function Pool() {
    return {
      end: mocks.poolEnd,
    };
  }),
}));

vi.mock("../config/env.js", () => ({
  loadConfig: () => ({ databaseUrl: "postgresql://solid:solid@localhost/db" }),
}));

vi.mock("../modules/statistics/repository/full-run.js", () => ({
  PgFullRunStatisticsRepository: vi
    .fn()
    .mockImplementation(function PgFullRunStatisticsRepository() {
      return {};
    }),
}));

vi.mock("../modules/statistics/service/full-run-recalculation.js", () => ({
  FullRunRecalculationService: vi
    .fn()
    .mockImplementation(function FullRunRecalculationService() {
      return {
        coverageReport: mocks.coverageReport,
        recalculateAllCurrentParserResults: mocks.recalculateReport,
      };
    }),
}));

import { runStatisticsRecalculationOperation } from "./recalculate-statistics.js";

describe("runStatisticsRecalculationOperation", () => {
  beforeEach(() => {
    mocks.coverageReport.mockReset();
    mocks.poolEnd.mockReset();
    mocks.recalculateReport.mockReset();
  });

  it("Runs dry-run coverage from default process arguments and writes JSON", async () => {
    const originalArguments = process.argv,
      stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    process.argv = ["node", "recalculate-statistics.ts", "--dry-run"];
    mocks.coverageReport.mockResolvedValue({
      generatedAt: "2026-05-12T00:00:00.000Z",
      lifecycle: {},
      mode: "coverage",
      reportVersion: 1,
      summary: {
        missingIdentityCount: 0,
        parserResultCount: 0,
        staleCount: 0,
      },
      targets: [],
    });

    try {
      const exitCode = await runStatisticsRecalculationOperation();
      expect(exitCode).toBe(0);
      expect(stdout).toHaveBeenCalledWith(
        expect.stringContaining('"coverage"'),
      );
    } finally {
      process.argv = originalArguments;
      stdout.mockRestore();
    }

    expect(mocks.coverageReport).toHaveBeenCalledTimes(1);
    expect(mocks.recalculateReport).not.toHaveBeenCalled();
    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
  });

  it("Runs recalculation and returns failure exit code when report has failures", async () => {
    const written: string[] = [];
    mocks.recalculateReport.mockResolvedValue({
      failures: [{ parserResultId: "result-1" }],
      generatedAt: "2026-05-12T00:00:00.000Z",
      lifecycle: {},
      mode: "recalculate",
      reportVersion: 1,
      results: [{ parserResultId: "result-1" }],
      summary: {
        changedAggregateRows: 0,
        failureCount: 1,
        missingIdentityCount: 0,
        missingReplayTimestampCount: 0,
        missingRotationCount: 0,
        parserResultCount: 1,
        recalculatedCount: 0,
        skippedCount: 0,
        staleCount: 1,
      },
    });

    await expect(
      runStatisticsRecalculationOperation([], (content) => {
        written.push(content);
      }),
    ).resolves.toBe(1);

    expect(mocks.coverageReport).not.toHaveBeenCalled();
    expect(mocks.recalculateReport).toHaveBeenCalledTimes(1);
    expect(written.join("")).toContain('"failureCount": 1');
    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
  });
});
