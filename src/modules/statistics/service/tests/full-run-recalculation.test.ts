/* eslint-disable @typescript-eslint/prefer-promise-reject-errors, class-methods-use-this, max-lines, max-lines-per-function, no-use-before-define, unicorn/no-null */
import { describe, expect, it } from "vitest";

import {
  FullRunRecalculationService,
  type FullRunLifecycleCounts,
  type FullRunRecalculationRepository,
  type ParserResultRecalculationTarget,
} from "../full-run-recalculation.js";

import type { ScopedRecalculationResult } from "../recalculation.js";

const generatedAt = new Date("2026-05-12T12:00:00.000Z"),
  lifecycle: FullRunLifecycleCounts = {
    parseJobs: { queued: 1, succeeded: 3 },
    parserResults: { current: 5 },
    replays: { parsed: 4 },
    staging: { promoted: 4 },
  };

describe("FullRunRecalculationService", () => {
  it("Builds dry-run coverage reports from lifecycle counts and current targets", async () => {
    const repository = new FakeFullRunRepository({
        targets: [
          target({ parserResultId: "result-1", stale: false }),
          target({
            missingIdentityPlayerCount: 2,
            parserResultId: "result-2",
            stale: true,
          }),
        ],
      }),
      service = new FullRunRecalculationService(repository, () => generatedAt);

    await expect(service.coverageReport()).resolves.toEqual({
      generatedAt: generatedAt.toISOString(),
      lifecycle,
      mode: "coverage",
      reportVersion: 1,
      summary: {
        missingIdentityCount: 1,
        parserResultCount: 2,
        staleCount: 1,
      },
      targets: [
        expect.objectContaining({
          freshnessStatus: "fresh",
          identityStatus: "ready",
          parserResultId: "result-1",
        }),
        expect.objectContaining({
          freshnessStatus: "stale",
          identityStatus: "missing_identity",
          missingIdentityPlayerCount: 2,
          parserResultId: "result-2",
        }),
      ],
    });
  });

  it("Uses the default clock when no explicit clock is provided", async () => {
    const repository = new FakeFullRunRepository({ targets: [] }),
      service = new FullRunRecalculationService(repository),
      report = await service.coverageReport();

    expect(Date.parse(report.generatedAt)).not.toBeNaN();
  });

  it("Rebuilds each rotation once and attributes its rows a single time", async () => {
    const repository = new FakeFullRunRepository({
        rotationByReplay: new Map([
          ["replay-result-1", "rotation-a"],
          ["replay-result-2", "rotation-a"],
          ["replay-result-6", "rotation-b"],
        ]),
        targets: [
          target({ parserResultId: "result-1" }),
          target({ parserResultId: "result-2" }),
          target({ missingIdentityPlayerCount: 1, parserResultId: "result-3" }),
          target({ parserResultId: "result-4", replayTimestamp: null }),
          target({ parserResultId: "result-5" }),
          target({ parserResultId: "result-6" }),
        ],
      }),
      service = new FullRunRecalculationService(repository, () => generatedAt);

    await expect(
      service.recalculateAllCurrentParserResults(),
    ).resolves.toMatchObject({
      failures: [],
      generatedAt: generatedAt.toISOString(),
      mode: "recalculate",
      results: [
        {
          aggregateRows: {
            bountyRows: 4,
            commanderStats: 3,
            playerStats: 1,
            squadStats: 2,
            total: 10,
          },
          parserResultId: "result-1",
          rotationId: "rotation-a",
          status: "recalculated",
        },
        {
          parserResultId: "result-2",
          rotationId: "rotation-a",
          status: "recalculated",
        },
        {
          parserResultId: "result-3",
          reasonCode: "missing_identity",
          status: "skipped",
        },
        {
          parserResultId: "result-4",
          reasonCode: "missing_replay_timestamp",
          status: "skipped",
        },
        {
          parserResultId: "result-5",
          reasonCode: "missing_rotation",
          status: "skipped",
        },
        {
          aggregateRows: {
            total: 10,
          },
          parserResultId: "result-6",
          rotationId: "rotation-b",
          status: "recalculated",
        },
      ],
      summary: {
        changedAggregateRows: 20,
        failureCount: 0,
        missingIdentityCount: 1,
        missingReplayTimestampCount: 1,
        missingRotationCount: 1,
        parserResultCount: 6,
        recalculatedCount: 3,
        skippedCount: 3,
      },
    });
    expect(repository.calls).toEqual([
      "player-squad:rotation-a",
      "commander:rotation-a",
      "bounty:rotation-a",
      "player-squad:rotation-b",
      "commander:rotation-b",
      "bounty:rotation-b",
    ]);
  });

  it("Fails every member of a rotation when its rebuild throws", async () => {
    const repository = new FakeFullRunRepository({
        rotationByReplay: new Map([
          ["replay-result-1", "rotation-a"],
          ["replay-result-2", "rotation-a"],
        ]),
        rotationFailures: new Map<string, unknown>([
          ["rotation-a", new Error("database unavailable")],
        ]),
        targets: [
          target({ parserResultId: "result-1" }),
          target({ parserResultId: "result-2" }),
        ],
      }),
      service = new FullRunRecalculationService(repository, () => generatedAt);

    await expect(
      service.recalculateAllCurrentParserResults(),
    ).resolves.toMatchObject({
      failures: [
        {
          errorMessage: "database unavailable",
          parserResultId: "result-1",
          reasonCode: "recalculation_failed",
          status: "failed",
        },
        {
          errorMessage: "database unavailable",
          parserResultId: "result-2",
          reasonCode: "recalculation_failed",
          status: "failed",
        },
      ],
      summary: {
        changedAggregateRows: 0,
        failureCount: 2,
        recalculatedCount: 0,
      },
    });
    expect(repository.calls).toEqual(["player-squad:rotation-a"]);
  });

  it("Coerces non-Error rotation rebuild failures to strings", async () => {
    const repository = new FakeFullRunRepository({
        rotationByReplay: new Map([["replay-result-1", "rotation-a"]]),
        rotationFailures: new Map<string, unknown>([
          ["rotation-a", "string failure"],
        ]),
        targets: [target({ parserResultId: "result-1" })],
      }),
      service = new FullRunRecalculationService(repository, () => generatedAt);

    await expect(
      service.recalculateAllCurrentParserResults(),
    ).resolves.toMatchObject({
      failures: [
        {
          errorMessage: "string failure",
          parserResultId: "result-1",
          status: "failed",
        },
      ],
    });
  });
});

class FakeFullRunRepository implements FullRunRecalculationRepository {
  public readonly calls: string[] = [];

  public constructor(
    private readonly options: {
      rotationByReplay?: Map<string, string>;
      rotationFailures?: Map<string, unknown>;
      targets: ParserResultRecalculationTarget[];
    },
  ) {}

  public assignRotationsForCurrentReplays(): Promise<Map<string, string>> {
    return Promise.resolve(
      this.options.rotationByReplay ??
        new Map(
          this.options.targets.flatMap((current) =>
            current.replayTimestamp === null
              ? []
              : [[current.replayId, current.rotationId ?? "rotation-1"]],
          ),
        ),
    );
  }

  public getFullRunLifecycleCounts(): Promise<FullRunLifecycleCounts> {
    return Promise.resolve(lifecycle);
  }

  public listCurrentParserResultTargets(): Promise<
    ParserResultRecalculationTarget[]
  > {
    return Promise.resolve(this.options.targets);
  }

  public recalculateBountyPointsForParserResult(): Promise<
    ScopedRecalculationResult & { bountyRows: number }
  > {
    return Promise.reject(new Error("not used by full-run path"));
  }

  public recalculateBountyPointsForRotation(
    rotationId: string,
  ): Promise<{ bountyRows: number }> {
    this.calls.push(`bounty:${rotationId}`);
    return Promise.resolve({ bountyRows: 4 });
  }

  public recalculateCommanderSideStatsForParserResult(): Promise<
    ScopedRecalculationResult & { commanderStats: number }
  > {
    return Promise.reject(new Error("not used by full-run path"));
  }

  public recalculateCommanderSideStatsForRotation(
    rotationId: string,
  ): Promise<{ commanderStats: number }> {
    this.calls.push(`commander:${rotationId}`);
    return Promise.resolve({ commanderStats: 3 });
  }

  public recalculatePlayerAndSquadStatsForParserResult(): Promise<
    ScopedRecalculationResult & { playerStats: number; squadStats: number }
  > {
    return Promise.reject(new Error("not used by full-run path"));
  }

  public recalculatePlayerAndSquadStatsForRotation(
    rotationId: string,
  ): Promise<{ playerStats: number; squadStats: number }> {
    this.calls.push(`player-squad:${rotationId}`);
    const failure = this.options.rotationFailures?.get(rotationId);
    if (failure !== undefined) {
      return Promise.reject(failure);
    }
    return Promise.resolve({ playerStats: 1, squadStats: 2 });
  }

  public replaceParserEvents(): Promise<void> {
    return Promise.resolve();
  }
}

function target(
  overrides: Partial<ParserResultRecalculationTarget> & {
    parserResultId: string;
  },
): ParserResultRecalculationTarget {
  return {
    missingIdentityPlayerCount: 0,
    parserResultCreatedAt: "2026-05-12T00:00:00.000Z",
    playerCount: 2,
    replayId: `replay-${overrides.parserResultId}`,
    replayTimestamp: "2026-05-12T00:00:00.000Z",
    rotationId: "rotation-1",
    sourceReplayId: `source-${overrides.parserResultId}`,
    sourceSystem: "solidgames",
    stale: true,
    ...overrides,
  };
}
