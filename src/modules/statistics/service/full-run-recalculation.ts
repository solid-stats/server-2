/* eslint-disable max-lines, unicorn/no-null */
import type { StatisticsRecalculationRepository } from "./recalculation.js";

const REPORT_VERSION = 1;

export type FullRunReasonCode =
  | "missing_identity"
  | "missing_replay_timestamp"
  | "missing_rotation"
  | "recalculation_failed";

export type FullRunResultStatus = "failed" | "recalculated" | "skipped";

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
  assignRotationsForCurrentReplays(): Promise<Map<string, string>>;
  getFullRunLifecycleCounts(): Promise<FullRunLifecycleCounts>;
  listCurrentParserResultTargets(): Promise<ParserResultRecalculationTarget[]>;
  recalculateBountyPointsForRotation(
    rotationId: string,
  ): Promise<{ bountyRows: number }>;
  recalculateCommanderSideStatsForRotation(
    rotationId: string,
  ): Promise<{ commanderStats: number }>;
  recalculatePlayerAndSquadStatsForRotation(
    rotationId: string,
  ): Promise<{ playerStats: number; squadStats: number }>;
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
      rotationByReplay =
        await this.repository.assignRotationsForCurrentReplays(),
      results = Array.from<FullRunResultItem>({ length: targets.length }),
      membersByRotation = new Map<string, RotationGroup>();

    for (const [index, target] of targets.entries()) {
      const classification = classifyTarget(target, rotationByReplay);
      if (classification.kind === "skipped") {
        results[index] = classification.item;
        continue;
      }
      const member: RotationMember = { ...classification, index },
        group = membersByRotation.get(member.rotationId);
      if (group === undefined) {
        membersByRotation.set(member.rotationId, {
          firstTimestamp: member.replayTimestamp,
          members: [member],
        });
      } else {
        group.members.push(member);
      }
    }

    for (const [rotationId, group] of orderedRotationGroups(
      membersByRotation,
    )) {
      const outcome = await this.rebuildRotationOutcome(rotationId);
      for (const [position, member] of group.members.entries()) {
        results[member.index] = rotationResultItem(
          member,
          outcome,
          position === 0,
        );
      }
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

  private async rebuildRotationOutcome(
    rotationId: string,
  ): Promise<RotationOutcome> {
    try {
      return { aggregateRows: await this.rebuildRotation(rotationId) };
    } catch (error) {
      return { error };
    }
  }

  private async rebuildRotation(
    rotationId: string,
  ): Promise<FullRunAggregateRows> {
    const playerAndSquad =
        await this.repository.recalculatePlayerAndSquadStatsForRotation(
          rotationId,
        ),
      commander =
        await this.repository.recalculateCommanderSideStatsForRotation(
          rotationId,
        ),
      bounty =
        await this.repository.recalculateBountyPointsForRotation(rotationId);
    return {
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
  }

  private async loadEvidence(): Promise<
    [FullRunLifecycleCounts, ParserResultRecalculationTarget[]]
  > {
    return Promise.all([
      this.repository.getFullRunLifecycleCounts(),
      this.repository.listCurrentParserResultTargets(),
    ]);
  }
}

interface RotationClassification {
  kind: "rotation";
  replayTimestamp: string;
  rotationId: string;
  target: ParserResultRecalculationTarget;
}

interface RotationMember extends RotationClassification {
  index: number;
}

interface RotationGroup {
  firstTimestamp: string;
  members: RotationMember[];
}

interface SkippedTarget {
  item: FullRunResultItem;
  kind: "skipped";
}

type RotationOutcome =
  | { aggregateRows: FullRunAggregateRows }
  | { error: unknown };

type TargetClassification = RotationClassification | SkippedTarget;

function classifyTarget(
  target: ParserResultRecalculationTarget,
  rotationByReplay: Map<string, string>,
): TargetClassification {
  if (target.missingIdentityPlayerCount > 0) {
    return {
      item: skippedItem(target, "missing_identity", target.rotationId),
      kind: "skipped",
    };
  }
  if (target.replayTimestamp === null) {
    return {
      item: skippedItem(target, "missing_replay_timestamp", null),
      kind: "skipped",
    };
  }
  const rotationId = rotationByReplay.get(target.replayId);
  if (rotationId === undefined) {
    return {
      item: skippedItem(target, "missing_rotation", null),
      kind: "skipped",
    };
  }
  return {
    kind: "rotation",
    replayTimestamp: target.replayTimestamp,
    rotationId,
    target,
  };
}

/**
 * Rotations must be rebuilt in chronological order: bounty points for a rotation
 * read the *previous* rotation's freshly written `player_stats`
 * (`loadPreviousBountyEffectiveness`), so a later rotation must not be rebuilt
 * before an earlier one. We sort by each rotation's first-seen replay timestamp
 * rather than relying on the incoming target order, so the invariant survives a
 * change to the target query's `ORDER BY`. Rotations are non-overlapping time
 * windows, so any member's timestamp orders the rotation correctly relative to
 * the others; replay timestamps are ISO-8601 UTC strings, so lexical comparison
 * is chronological.
 */
function orderedRotationGroups(
  membersByRotation: Map<string, RotationGroup>,
): [string, RotationGroup][] {
  return [...membersByRotation.entries()].toSorted((left, right) =>
    left[1].firstTimestamp.localeCompare(right[1].firstTimestamp),
  );
}

function rotationResultItem(
  member: RotationMember,
  outcome: RotationOutcome,
  isFirstForRotation: boolean,
): FullRunResultItem {
  if ("error" in outcome) {
    return failedItem(member.target, outcome.error);
  }
  return recalculatedRotationItem(
    member.target,
    member.rotationId,
    isFirstForRotation ? outcome.aggregateRows : undefined,
  );
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

function recalculatedRotationItem(
  target: ParserResultRecalculationTarget,
  rotationId: string,
  aggregateRows: FullRunAggregateRows | undefined,
): FullRunResultItem {
  return {
    ...(aggregateRows === undefined ? {} : { aggregateRows }),
    missingIdentityPlayerCount: target.missingIdentityPlayerCount,
    parserResultId: target.parserResultId,
    replayId: target.replayId,
    replayTimestamp: target.replayTimestamp,
    rotationId,
    sourceReplayId: target.sourceReplayId,
    sourceSystem: target.sourceSystem,
    status: "recalculated",
  };
}
