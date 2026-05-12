/* eslint-disable max-lines, unicorn/no-null */
import type {
  ScopedRecalculationResult,
  StatisticsRecalculationRepository,
} from "./recalculation.js";

const REPORT_VERSION = 1;

export type FullRunReasonCode =
  | "missing_identity"
  | "missing_replay_timestamp"
  | "missing_rotation"
  | "recalculation_failed";

export type FullRunResultStatus = "failed" | "recalculated" | "skipped";
type SkippedScopedRecalculationResult = ScopedRecalculationResult & {
  status: Exclude<ScopedRecalculationResult["status"], "recalculated">;
};

export interface FullRunLifecycleCounts {
  parseJobs: Record<string, number>;
  parserResults: Record<string, number>;
  replays: Record<string, number>;
  staging: Record<string, number>;
}

export interface ParserResultRecalculationTarget {
  missingIdentityPlayerCount: number;
  parserResultCreatedAt: string;
  parserResultId: string;
  playerCount: number;
  replayId: string;
  replayTimestamp: string | null;
  rotationId: string | null;
  sourceReplayId: string;
  sourceSystem: string;
  stale: boolean;
}

export interface FullRunRecalculationRepository extends StatisticsRecalculationRepository {
  getFullRunLifecycleCounts(): Promise<FullRunLifecycleCounts>;
  listCurrentParserResultTargets(): Promise<ParserResultRecalculationTarget[]>;
}

export interface FullRunAggregateRows {
  bountyRows: number;
  commanderStats: number;
  playerStats: number;
  squadStats: number;
  total: number;
}

export interface FullRunCoverageItem {
  freshnessStatus: "fresh" | "stale";
  identityStatus: "missing_identity" | "ready";
  missingIdentityPlayerCount: number;
  parserResultId: string;
  replayId: string;
  replayTimestamp: string | null;
  rotationId: string | null;
  sourceReplayId: string;
  sourceSystem: string;
}

export interface FullRunResultItem {
  aggregateRows?: FullRunAggregateRows;
  errorMessage?: string;
  missingIdentityPlayerCount: number;
  parserResultId: string;
  reasonCode?: FullRunReasonCode;
  replayId: string;
  replayTimestamp: string | null;
  rotationId: string | null;
  sourceReplayId: string;
  sourceSystem: string;
  status: FullRunResultStatus;
}

export interface FullRunCoverageSummary {
  missingIdentityCount: number;
  parserResultCount: number;
  staleCount: number;
}

export interface FullRunRecalculationSummary extends FullRunCoverageSummary {
  changedAggregateRows: number;
  failureCount: number;
  missingReplayTimestampCount: number;
  missingRotationCount: number;
  recalculatedCount: number;
  skippedCount: number;
}

export interface FullRunCoverageReport {
  generatedAt: string;
  lifecycle: FullRunLifecycleCounts;
  mode: "coverage";
  reportVersion: number;
  summary: FullRunCoverageSummary;
  targets: FullRunCoverageItem[];
}

export interface FullRunRecalculationReport {
  failures: FullRunResultItem[];
  generatedAt: string;
  lifecycle: FullRunLifecycleCounts;
  mode: "recalculate";
  reportVersion: number;
  results: FullRunResultItem[];
  summary: FullRunRecalculationSummary;
}

export class FullRunRecalculationService {
  public constructor(
    private readonly repository: FullRunRecalculationRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async coverageReport(): Promise<FullRunCoverageReport> {
    const [lifecycle, targets] = await this.loadEvidence();
    return {
      generatedAt: this.now().toISOString(),
      lifecycle,
      mode: "coverage",
      reportVersion: REPORT_VERSION,
      summary: summarizeCoverage(targets),
      targets: targets.map((target) => coverageItem(target)),
    };
  }

  public async recalculateAllCurrentParserResults(): Promise<FullRunRecalculationReport> {
    const [lifecycle, targets] = await this.loadEvidence(),
      results: FullRunResultItem[] = [];

    for (const target of targets) {
      results.push(await this.recalculateTarget(target));
    }

    return {
      failures: results.filter((result) => result.status === "failed"),
      generatedAt: this.now().toISOString(),
      lifecycle,
      mode: "recalculate",
      reportVersion: REPORT_VERSION,
      results,
      summary: summarizeRecalculation(targets, results),
    };
  }

  private async loadEvidence(): Promise<
    [FullRunLifecycleCounts, ParserResultRecalculationTarget[]]
  > {
    return Promise.all([
      this.repository.getFullRunLifecycleCounts(),
      this.repository.listCurrentParserResultTargets(),
    ]);
  }

  private async recalculateTarget(
    target: ParserResultRecalculationTarget,
  ): Promise<FullRunResultItem> {
    if (target.missingIdentityPlayerCount > 0) {
      return skippedItem(target, "missing_identity", target.rotationId);
    }

    try {
      const playerAndSquad =
        await this.repository.recalculatePlayerAndSquadStatsForParserResult(
          target.parserResultId,
        );
      if (playerAndSquad.status !== "recalculated") {
        return skippedItem(target, playerAndSquad.status, null);
      }

      const commander =
          await this.repository.recalculateCommanderSideStatsForParserResult(
            target.parserResultId,
          ),
        bounty = await this.repository.recalculateBountyPointsForParserResult(
          target.parserResultId,
        ),
        skippedAggregate = firstSkippedAggregate([commander, bounty]);
      if (skippedAggregate !== undefined) {
        return skippedItem(target, skippedAggregate.status, null);
      }

      return recalculatedItem({
        bounty,
        commander,
        playerAndSquad,
        target,
      });
    } catch (error) {
      return failedItem(target, error);
    }
  }
}

function coverageItem(
  target: ParserResultRecalculationTarget,
): FullRunCoverageItem {
  return {
    freshnessStatus: target.stale ? "stale" : "fresh",
    identityStatus:
      target.missingIdentityPlayerCount > 0 ? "missing_identity" : "ready",
    missingIdentityPlayerCount: target.missingIdentityPlayerCount,
    parserResultId: target.parserResultId,
    replayId: target.replayId,
    replayTimestamp: target.replayTimestamp,
    rotationId: target.rotationId,
    sourceReplayId: target.sourceReplayId,
    sourceSystem: target.sourceSystem,
  };
}

function summarizeCoverage(
  targets: ParserResultRecalculationTarget[],
): FullRunCoverageSummary {
  return {
    missingIdentityCount: targets.filter(
      (target) => target.missingIdentityPlayerCount > 0,
    ).length,
    parserResultCount: targets.length,
    staleCount: targets.filter((target) => target.stale).length,
  };
}

function summarizeRecalculation(
  targets: ParserResultRecalculationTarget[],
  results: FullRunResultItem[],
): FullRunRecalculationSummary {
  return {
    ...summarizeCoverage(targets),
    changedAggregateRows: results.reduce(
      (total, result) => total + (result.aggregateRows?.total ?? 0),
      0,
    ),
    failureCount: results.filter((result) => result.status === "failed").length,
    missingReplayTimestampCount: countReason(
      results,
      "missing_replay_timestamp",
    ),
    missingRotationCount: countReason(results, "missing_rotation"),
    recalculatedCount: results.filter(
      (result) => result.status === "recalculated",
    ).length,
    skippedCount: results.filter((result) => result.status === "skipped")
      .length,
  };
}

function countReason(
  results: FullRunResultItem[],
  reasonCode: FullRunReasonCode,
): number {
  return results.filter((result) => result.reasonCode === reasonCode).length;
}

function skippedItem(
  target: ParserResultRecalculationTarget,
  reasonCode: Exclude<FullRunReasonCode, "recalculation_failed">,
  rotationId: string | null,
): FullRunResultItem {
  return {
    missingIdentityPlayerCount: target.missingIdentityPlayerCount,
    parserResultId: target.parserResultId,
    reasonCode,
    replayId: target.replayId,
    replayTimestamp: target.replayTimestamp,
    rotationId,
    sourceReplayId: target.sourceReplayId,
    sourceSystem: target.sourceSystem,
    status: "skipped",
  };
}

function failedItem(
  target: ParserResultRecalculationTarget,
  error: unknown,
): FullRunResultItem {
  return {
    errorMessage: error instanceof Error ? error.message : String(error),
    missingIdentityPlayerCount: target.missingIdentityPlayerCount,
    parserResultId: target.parserResultId,
    reasonCode: "recalculation_failed",
    replayId: target.replayId,
    replayTimestamp: target.replayTimestamp,
    rotationId: target.rotationId,
    sourceReplayId: target.sourceReplayId,
    sourceSystem: target.sourceSystem,
    status: "failed",
  };
}

function recalculatedItem(input: {
  bounty: ScopedRecalculationResult & { bountyRows: number };
  commander: ScopedRecalculationResult & { commanderStats: number };
  playerAndSquad: ScopedRecalculationResult & {
    playerStats: number;
    squadStats: number;
  };
  target: ParserResultRecalculationTarget;
}): FullRunResultItem {
  const { bounty, commander, playerAndSquad, target } = input;
  const aggregateRows = {
    bountyRows: bounty.bountyRows,
    commanderStats: commander.commanderStats,
    playerStats: playerAndSquad.playerStats,
    squadStats: playerAndSquad.squadStats,
    total:
      playerAndSquad.playerStats +
      playerAndSquad.squadStats +
      commander.commanderStats +
      bounty.bountyRows,
  };
  return {
    aggregateRows,
    missingIdentityPlayerCount: target.missingIdentityPlayerCount,
    parserResultId: target.parserResultId,
    replayId: target.replayId,
    replayTimestamp: target.replayTimestamp,
    rotationId: playerAndSquad.rotationId,
    sourceReplayId: target.sourceReplayId,
    sourceSystem: target.sourceSystem,
    status: "recalculated",
  };
}

function firstSkippedAggregate(
  results: ScopedRecalculationResult[],
): SkippedScopedRecalculationResult | undefined {
  return results.find(
    (result): result is SkippedScopedRecalculationResult =>
      result.status !== "recalculated",
  );
}
