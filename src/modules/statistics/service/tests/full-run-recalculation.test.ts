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

  it("Recalculates current parser results and summarizes skips and failures", async () => {
    const repository = new FakeFullRunRepository({
        failures: new Map<string, unknown>([
          ["result-5", new Error("database unavailable")],
          ["result-6", "string failure"],
        ]),
        playerAndSquadResults: new Map([
          [
            "result-2",
            {
              playerStats: 0,
              rotationId: null,
              squadStats: 0,
              status: "missing_replay_timestamp",
            },
          ],
          [
            "result-3",
            {
              playerStats: 0,
              rotationId: null,
              squadStats: 0,
              status: "missing_rotation",
            },
          ],
        ]),
        targets: [
          target({ parserResultId: "result-1", stale: false }),
          target({ parserResultId: "result-2" }),
          target({ parserResultId: "result-3" }),
          target({ missingIdentityPlayerCount: 1, parserResultId: "result-4" }),
          target({ parserResultId: "result-5" }),
          target({ parserResultId: "result-6" }),
        ],
      }),
      service = new FullRunRecalculationService(repository, () => generatedAt);

    await expect(
      service.recalculateAllCurrentParserResults(),
    ).resolves.toMatchObject({
      failures: [
        {
          errorMessage: "database unavailable",
          parserResultId: "result-5",
          reasonCode: "recalculation_failed",
          status: "failed",
        },
        {
          errorMessage: "string failure",
          parserResultId: "result-6",
          reasonCode: "recalculation_failed",
          status: "failed",
        },
      ],
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
          status: "recalculated",
        },
        {
          parserResultId: "result-2",
          reasonCode: "missing_replay_timestamp",
          status: "skipped",
        },
        {
          parserResultId: "result-3",
          reasonCode: "missing_rotation",
          status: "skipped",
        },
        {
          parserResultId: "result-4",
          reasonCode: "missing_identity",
          status: "skipped",
        },
        {
          parserResultId: "result-5",
          status: "failed",
        },
        {
          parserResultId: "result-6",
          status: "failed",
        },
      ],
      summary: {
        changedAggregateRows: 10,
        failureCount: 2,
        missingIdentityCount: 1,
        missingReplayTimestampCount: 1,
        missingRotationCount: 1,
        parserResultCount: 6,
        recalculatedCount: 1,
        skippedCount: 3,
        staleCount: 5,
      },
    });
    expect(repository.calls).toEqual([
      "player-squad:result-1",
      "commander:result-1",
      "bounty:result-1",
      "player-squad:result-2",
      "player-squad:result-3",
      "player-squad:result-5",
      "player-squad:result-6",
    ]);
  });

  it("Skips a target when a later aggregate family reports a scoped skip", async () => {
    const repository = new FakeFullRunRepository({
        bountyResults: new Map([
          [
            "result-1",
            { bountyRows: 0, rotationId: null, status: "missing_rotation" },
          ],
        ]),
        targets: [target({ parserResultId: "result-1" })],
      }),
      service = new FullRunRecalculationService(repository, () => generatedAt);

    await expect(
      service.recalculateAllCurrentParserResults(),
    ).resolves.toMatchObject({
      results: [
        {
          parserResultId: "result-1",
          reasonCode: "missing_rotation",
          status: "skipped",
        },
      ],
      summary: {
        changedAggregateRows: 0,
        missingRotationCount: 1,
        skippedCount: 1,
      },
    });
    expect(repository.calls).toEqual([
      "player-squad:result-1",
      "commander:result-1",
      "bounty:result-1",
    ]);
  });
});

class FakeFullRunRepository implements FullRunRecalculationRepository {
  public readonly calls: string[] = [];

  public constructor(
    private readonly options: {
      bountyResults?: Map<
        string,
        ScopedRecalculationResult & { bountyRows: number }
      >;
      commanderResults?: Map<
        string,
        ScopedRecalculationResult & { commanderStats: number }
      >;
      failures?: Map<string, unknown>;
      playerAndSquadResults?: Map<
        string,
        ScopedRecalculationResult & {
          playerStats: number;
          squadStats: number;
        }
      >;
      targets: ParserResultRecalculationTarget[];
    },
  ) {}

  public getFullRunLifecycleCounts(): Promise<FullRunLifecycleCounts> {
    return Promise.resolve(lifecycle);
  }

  public listCurrentParserResultTargets(): Promise<
    ParserResultRecalculationTarget[]
  > {
    return Promise.resolve(this.options.targets);
  }

  public recalculateBountyPointsForParserResult(
    parserResultId: string,
  ): Promise<ScopedRecalculationResult & { bountyRows: number }> {
    this.calls.push(`bounty:${parserResultId}`);
    return Promise.resolve(
      this.options.bountyResults?.get(parserResultId) ?? {
        bountyRows: 4,
        rotationId: "rotation-1",
        status: "recalculated",
      },
    );
  }

  public recalculateCommanderSideStatsForParserResult(
    parserResultId: string,
  ): Promise<ScopedRecalculationResult & { commanderStats: number }> {
    this.calls.push(`commander:${parserResultId}`);
    return Promise.resolve(
      this.options.commanderResults?.get(parserResultId) ?? {
        commanderStats: 3,
        rotationId: "rotation-1",
        status: "recalculated",
      },
    );
  }

  public recalculatePlayerAndSquadStatsForParserResult(
    parserResultId: string,
  ): Promise<
    ScopedRecalculationResult & {
      playerStats: number;
      squadStats: number;
    }
  > {
    this.calls.push(`player-squad:${parserResultId}`);
    const failure = this.options.failures?.get(parserResultId);
    if (failure !== undefined) {
      return Promise.reject(failure);
    }
    return Promise.resolve(
      this.options.playerAndSquadResults?.get(parserResultId) ?? {
        playerStats: 1,
        rotationId: "rotation-1",
        squadStats: 2,
        status: "recalculated",
      },
    );
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
