/* eslint-disable prefer-arrow-callback */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exportReport: vi.fn(),
  poolEnd: vi.fn(),
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

vi.mock("../modules/statistics/repository/legacy-export.js", () => ({
  PgLegacyPublicStatsExportRepository: vi
    .fn()
    .mockImplementation(function PgLegacyPublicStatsExportRepository() {
      return {};
    }),
}));

vi.mock("../modules/statistics/export/legacy-public-export.js", () => ({
  LegacyPublicStatsExportService: vi
    .fn()
    .mockImplementation(function LegacyPublicStatsExportService() {
      return { export: mocks.exportReport };
    }),
}));

import {
  parseOperationArguments,
  runLegacyPublicStatsExportOperation,
} from "./export-legacy-public-stats.js";

describe("runLegacyPublicStatsExportOperation", () => {
  beforeEach(() => {
    mocks.exportReport.mockReset();
    mocks.poolEnd.mockReset();
  });

  it("Writes legacy export JSON and closes the pool", async () => {
    const written: string[] = [];
    mocks.exportReport.mockResolvedValue({
      metadata: {
        contractVersion: "legacy-public-export.v1",
        corpusScope: "sample",
      },
      players: [],
    });

    await expect(
      runLegacyPublicStatsExportOperation(
        [
          "--corpus-scope",
          "sample",
          "--generated-at",
          "2026-05-12T00:00:00.000Z",
        ],
        (content) => {
          written.push(content);
        },
      ),
    ).resolves.toBe(0);

    expect(written.join("")).toContain("legacy-public-export.v1");
    expect(mocks.exportReport).toHaveBeenCalledWith({
      corpusScope: "sample",
      generatedAt: new Date("2026-05-12T00:00:00.000Z"),
    });
    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
  });

  it("Uses stdout as the default writer", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    mocks.exportReport.mockResolvedValue({
      metadata: { contractVersion: "legacy-public-export.v1" },
      players: [],
    });

    try {
      await expect(runLegacyPublicStatsExportOperation()).resolves.toBe(0);
      expect(stdout).toHaveBeenCalledWith(
        expect.stringContaining("legacy-public-export.v1"),
      );
    } finally {
      stdout.mockRestore();
    }
  });
});

describe("parseOperationArguments", () => {
  it("Defaults corpus scope and generated time when arguments are omitted", () => {
    const generatedAt = new Date("2026-05-12T00:00:00.000Z");

    expect(parseOperationArguments([], () => generatedAt)).toEqual({
      corpusScope: "current",
      generatedAt,
    });
    expect(parseOperationArguments([]).generatedAt.getTime()).not.toBeNaN();
  });

  it("Throws when an argument value is missing or invalid", () => {
    expect(() => parseOperationArguments(["--corpus-scope"])).toThrow(
      "Missing value",
    );
    expect(() =>
      parseOperationArguments(["--generated-at", "not-a-date"]),
    ).toThrow("Invalid --generated-at value");
  });
});
