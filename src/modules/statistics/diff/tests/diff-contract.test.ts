/* eslint-disable camelcase */
import { describe, expect, it } from "vitest";

import {
  createDiffReport,
  defaultKnownDifferencePolicy,
  DIFF_CONTRACT_VERSION,
  isDefaultKnownDifferenceCode,
  isStrictFailureCode,
  KNOWN_TEAMKILL_DEATH_DIFFERENCE,
  STRICT_FAILURE_CODES,
  type DiffCorpusScope,
} from "../diff-contract.js";

describe("old-vs-new diff contract", () => {
  it.each<DiffCorpusScope>(["sample", "partial-staging", "full-corpus"])(
    "Builds review-required report metadata for %s corpus",
    (corpusScope) => {
      const report = createDiffReport({
        knownDifferences: [
          {
            code: KNOWN_TEAMKILL_DEATH_DIFFERENCE,
            detail: {
              explanation: "duplicate slot respawn teamkill death",
              newDeathsByTeamkills: 2,
              oldDeathsByTeamkills: 1,
              playerId: "player-1",
              replayId: "replay-1",
            },
          },
        ],
        snapshot: snapshot(corpusScope),
        strictFailures: [
          {
            code: "missing_player",
            detail: { playerId: "player-2" },
            message: "Player is missing from new export",
          },
        ],
        summary: {
          changedPublicAggregateTotals: 3,
          matchedPlayers: 10,
          missingMatches: 1,
          missingPlayers: 1,
        },
      });

      expect(report).toEqual({
        contractVersion: DIFF_CONTRACT_VERSION,
        knownDifferences: [
          {
            code: KNOWN_TEAMKILL_DEATH_DIFFERENCE,
            detail: {
              explanation: "duplicate slot respawn teamkill death",
              newDeathsByTeamkills: 2,
              oldDeathsByTeamkills: 1,
              playerId: "player-1",
              replayId: "replay-1",
            },
          },
        ],
        review_required: true,
        snapshot: {
          comparedAt: "2026-05-12T00:00:00.000Z",
          diffContractVersion: DIFF_CONTRACT_VERSION,
          newInput: {
            contractVersion: "legacy-public-export.v1",
            corpusScope,
            generatedAt: "2026-05-12T00:00:00.000Z",
            label: "new",
            source: "server-2",
          },
          oldInput: {
            artifactSha256: "hash",
            contractVersion: "sg_stats.legacy",
            corpusScope,
            generatedAt: "2026-05-12T00:00:00.000Z",
            label: "old",
            source: "sg_stats",
          },
        },
        strictFailures: [
          {
            code: "missing_player",
            detail: { playerId: "player-2" },
            message: "Player is missing from new export",
          },
        ],
        summary: {
          changedPublicAggregateTotals: 3,
          knownDifferences: 1,
          matchedPlayers: 10,
          missingMatches: 1,
          missingPlayers: 1,
          strictFailures: 1,
        },
      });
    },
  );

  it("Defaults summary counts and rejects broad known-difference allowlists", () => {
    const report = createDiffReport({ snapshot: snapshot("sample") });

    expect(report.review_required).toBe(true);
    expect(report.summary).toEqual({
      changedPublicAggregateTotals: 0,
      knownDifferences: 0,
      matchedPlayers: 0,
      missingMatches: 0,
      missingPlayers: 0,
      strictFailures: 0,
    });
    expect(isStrictFailureCode("missing_match")).toBe(true);
    expect(isStrictFailureCode("cosmetic_difference")).toBe(false);
    expect(STRICT_FAILURE_CODES).toContain("export_failure");
    expect(isDefaultKnownDifferenceCode(KNOWN_TEAMKILL_DEATH_DIFFERENCE)).toBe(
      true,
    );
    expect(isDefaultKnownDifferenceCode("weapon_name_difference")).toBe(false);
    expect(
      defaultKnownDifferencePolicy([
        KNOWN_TEAMKILL_DEATH_DIFFERENCE,
        "weapon_name_difference",
      ]),
    ).toEqual({
      allowed: [KNOWN_TEAMKILL_DEATH_DIFFERENCE],
      rejected: ["weapon_name_difference"],
    });
  });
});

function snapshot(corpusScope: DiffCorpusScope) {
  return {
    comparedAt: "2026-05-12T00:00:00.000Z",
    newInput: {
      contractVersion: "legacy-public-export.v1",
      corpusScope,
      generatedAt: "2026-05-12T00:00:00.000Z",
      label: "new" as const,
      source: "server-2",
    },
    oldInput: {
      artifactSha256: "hash",
      contractVersion: "sg_stats.legacy",
      corpusScope,
      generatedAt: "2026-05-12T00:00:00.000Z",
      label: "old" as const,
      source: "sg_stats",
    },
  };
}
