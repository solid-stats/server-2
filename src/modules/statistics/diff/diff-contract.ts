/* eslint-disable camelcase */
export const DIFF_CONTRACT_VERSION = "old-vs-new-diff.v1" as const;

export const KNOWN_TEAMKILL_DEATH_DIFFERENCE =
  "deaths_by_teamkills_duplicate_slot_respawn" as const;

export const STRICT_FAILURE_CODES = [
  "missing_player",
  "missing_match",
  "changed_public_aggregate_total",
  "parser_failure",
  "export_failure",
  "unexplained_difference",
] as const;

export type DiffCorpusScope = "full-corpus" | "partial-staging" | "sample";

export type StrictFailureCode = (typeof STRICT_FAILURE_CODES)[number];

export type KnownDifferenceCode = typeof KNOWN_TEAMKILL_DEATH_DIFFERENCE;

export interface DiffInputMetadata {
  artifactSha256?: string;
  contractVersion: string;
  corpusScope: DiffCorpusScope;
  generatedAt: string;
  label: "new" | "old";
  source: string;
}

export interface DiffSnapshotMetadata {
  comparedAt: string;
  diffContractVersion?: typeof DIFF_CONTRACT_VERSION;
  newInput: DiffInputMetadata;
  oldInput: DiffInputMetadata;
}

export interface DiffSummaryCounts {
  changedPublicAggregateTotals: number;
  knownDifferences: number;
  matchedPlayers: number;
  missingMatches: number;
  missingPlayers: number;
  strictFailures: number;
}

export interface StrictParityFailure {
  code: StrictFailureCode;
  detail: Record<string, unknown>;
  message: string;
}

export interface KnownTeamkillDeathDifference {
  code: KnownDifferenceCode;
  detail: {
    explanation: string;
    newDeathsByTeamkills: number;
    oldDeathsByTeamkills: number;
    playerId: string;
    replayId?: string;
  };
}

export interface OldVsNewDiffReport {
  contractVersion: typeof DIFF_CONTRACT_VERSION;
  knownDifferences: KnownTeamkillDeathDifference[];
  review_required: true;
  snapshot: DiffSnapshotMetadata;
  strictFailures: StrictParityFailure[];
  summary: DiffSummaryCounts;
}

export function createDiffReport(input: {
  knownDifferences?: KnownTeamkillDeathDifference[];
  snapshot: DiffSnapshotMetadata;
  strictFailures?: StrictParityFailure[];
  summary?: Partial<DiffSummaryCounts>;
}): OldVsNewDiffReport {
  const strictFailures = input.strictFailures ?? [],
    knownDifferences = input.knownDifferences ?? [];
  return {
    contractVersion: DIFF_CONTRACT_VERSION,
    knownDifferences,
    review_required: true,
    snapshot: {
      ...input.snapshot,
      diffContractVersion: DIFF_CONTRACT_VERSION,
    },
    strictFailures,
    summary: {
      changedPublicAggregateTotals:
        input.summary?.changedPublicAggregateTotals ?? 0,
      knownDifferences: knownDifferences.length,
      matchedPlayers: input.summary?.matchedPlayers ?? 0,
      missingMatches: input.summary?.missingMatches ?? 0,
      missingPlayers: input.summary?.missingPlayers ?? 0,
      strictFailures: strictFailures.length,
    },
  };
}

export function isStrictFailureCode(code: string): code is StrictFailureCode {
  return STRICT_FAILURE_CODES.includes(code as StrictFailureCode);
}

export function isDefaultKnownDifferenceCode(
  code: string,
): code is KnownDifferenceCode {
  return code === KNOWN_TEAMKILL_DEATH_DIFFERENCE;
}

export function defaultKnownDifferencePolicy(
  requestedCodes: readonly string[],
): {
  allowed: KnownDifferenceCode[];
  rejected: string[];
} {
  const allowed: KnownDifferenceCode[] = [],
    rejected: string[] = [];
  for (const code of requestedCodes) {
    if (isDefaultKnownDifferenceCode(code)) {
      allowed.push(code);
      continue;
    }
    rejected.push(code);
  }
  return { allowed, rejected };
}
