/* eslint-disable prefer-arrow-callback */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolEnd: vi.fn(),
  report: vi.fn(),
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

vi.mock("../modules/statistics/repository/readiness.js", () => ({
  PgStatisticsReadinessRepository: vi
    .fn()
    .mockImplementation(function PgStatisticsReadinessRepository() {
      return {};
    }),
}));

vi.mock("../modules/statistics/readiness/readiness.js", () => ({
  StatisticsReadinessService: vi
    .fn()
    .mockImplementation(function StatisticsReadinessService() {
      return { report: mocks.report };
    }),
}));

import { runStatisticsReadinessOperation } from "./statistics-readiness.js";

describe("runStatisticsReadinessOperation", () => {
  beforeEach(() => {
    mocks.poolEnd.mockReset();
    mocks.report.mockReset();
  });

  it("Writes readiness report JSON and closes the pool", async () => {
    const written: string[] = [];
    mocks.report.mockResolvedValue({
      generatedAt: "2026-05-12T00:00:00.000Z",
      reportVersion: 1,
      summary: { replayCount: 0 },
    });

    await expect(
      runStatisticsReadinessOperation((content) => {
        written.push(content);
      }),
    ).resolves.toBe(0);

    expect(written.join("")).toContain('"replayCount": 0');
    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
  });

  it("Uses stdout as the default writer", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    mocks.report.mockResolvedValue({
      generatedAt: "2026-05-12T00:00:00.000Z",
      reportVersion: 1,
      summary: { replayCount: 0 },
    });

    try {
      await expect(runStatisticsReadinessOperation()).resolves.toBe(0);
      expect(stdout).toHaveBeenCalledWith(
        expect.stringContaining("replayCount"),
      );
    } finally {
      stdout.mockRestore();
    }
  });
});
