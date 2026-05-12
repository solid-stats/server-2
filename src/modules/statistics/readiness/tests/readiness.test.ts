/* eslint-disable max-lines-per-function, no-use-before-define, unicorn/no-null */
import { describe, expect, it } from "vitest";

import {
  StatisticsReadinessService,
  type IdentityReference,
  type ParserResultIdentityEvidence,
  type ReplayRotationEvidence,
  type RotationRangeEvidence,
  type StatisticsReadinessRepository,
} from "../readiness.js";

const generatedAt = new Date("2026-05-12T12:00:00.000Z");

describe("StatisticsReadinessService", () => {
  it("Builds rotation and no-SteamID readiness reports with actionable evidence", async () => {
    const repository = new FakeReadinessRepository({
        identityReferences: [
          identityReference({
            nickname: "Historian",
            playerId: "player-history",
          }),
          identityReference({
            nickname: "Another",
            observedFrom: "2026-01-01T00:00:00.000Z",
            observedTo: null,
            playerId: "player-another-a",
          }),
          identityReference({
            nickname: "Another",
            observedFrom: "2026-01-02T00:00:00.000Z",
            observedTo: null,
            playerId: "player-another-b",
          }),
          identityReference({
            nickname: "Open",
            observedFrom: null,
            observedTo: "2026-12-31T23:59:59.000Z",
            playerId: "player-open-a",
          }),
          identityReference({
            nickname: "Open",
            observedFrom: null,
            observedTo: "2026-11-30T23:59:59.000Z",
            playerId: "player-open-b",
          }),
          identityReference({
            displayName: "Existing",
            playerId: "player-existing",
          }),
          identityReference({
            nickname: "Shared",
            observedFrom: "2026-01-01T00:00:00.000Z",
            observedTo: "2026-12-31T23:59:59.000Z",
            playerId: "player-shared-a",
          }),
          identityReference({
            nickname: "Shared",
            observedFrom: "2026-06-01T00:00:00.000Z",
            observedTo: null,
            playerId: "player-shared-b",
          }),
        ],
        parserResults: [
          parserResult([
            { entityRef: "101", observedName: "Historian" },
            { entityRef: "102", observedName: "New Player" },
            { entityRef: "103", observedName: "   " },
            { entityRef: "104", observedName: "Shared" },
            {
              entityRef: "105",
              observedName: "Steam Player",
              steamId: "steam-105",
            },
          ]),
        ],
        replays: [
          replay({ replayId: "replay-exact", rotationMatchCount: 1 }),
          replay({
            replayId: "replay-missing-timestamp",
            replayTimestamp: null,
            rotationMatchCount: 0,
          }),
          replay({ replayId: "replay-missing", rotationMatchCount: 0 }),
          replay({
            matchedRotationIds: ["rotation-1", "rotation-2"],
            replayId: "replay-overlap",
            rotationMatchCount: 2,
          }),
        ],
        rotations: [
          {
            endsAt: "2026-06-01T00:00:00.000Z",
            id: "rotation-1",
            name: "R1",
            replayCount: 2,
            startsAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
      service = new StatisticsReadinessService(repository, () => generatedAt);

    await expect(service.report()).resolves.toMatchObject({
      generatedAt: generatedAt.toISOString(),
      identity: {
        nicknameConflicts: [
          {
            nickname: "another",
            playerIds: ["player-another-a", "player-another-b"],
          },
          {
            nickname: "open",
            playerIds: ["player-open-a", "player-open-b"],
          },
          {
            nickname: "shared",
            playerIds: ["player-shared-a", "player-shared-b"],
          },
        ],
        noSteamPlayers: [
          {
            matchedPlayerIds: ["player-history"],
            observedName: "Historian",
            resolutionStatus: "nickname_history",
          },
          {
            matchedPlayerIds: [],
            observedName: "New Player",
            resolutionStatus: "provisional_observed_name",
          },
          {
            matchedPlayerIds: [],
            observedName: "   ",
            reasonCode: "blank_observed_name",
            resolutionStatus: "unresolved",
          },
          {
            matchedPlayerIds: ["player-shared-a", "player-shared-b"],
            observedName: "Shared",
            reasonCode: "ambiguous_observed_name",
            resolutionStatus: "ambiguous",
          },
        ],
        unresolvedObservedNicknames: [
          {
            observedName: "   ",
            reasonCode: "blank_observed_name",
          },
        ],
      },
      reportVersion: 1,
      rotation: {
        missingReplayTimestampReplays: [
          { replayId: "replay-missing-timestamp" },
        ],
        missingRotationReplays: [{ replayId: "replay-missing" }],
        overlappingRotationReplays: [{ replayId: "replay-overlap" }],
      },
      summary: {
        ambiguousObservedNameCount: 1,
        exactRotationReplayCount: 1,
        missingReplayTimestampCount: 1,
        missingRotationReplayCount: 1,
        nicknameConflictCount: 3,
        nicknameHistoryResolvedCount: 1,
        noSteamPlayerCount: 4,
        overlappingRotationReplayCount: 1,
        provisionalObservedNameCount: 1,
        replayCount: 4,
        rotationCount: 1,
        unresolvedObservedNameCount: 1,
      },
    });
  });

  it("Uses default clock and treats null replay timestamps as active nickname windows", async () => {
    const service = new StatisticsReadinessService(
        new FakeReadinessRepository({
          identityReferences: [
            identityReference({ nickname: "Traveler", playerId: "player-1" }),
          ],
          parserResults: [
            parserResult(
              [{ entityRef: "101", observedName: "Traveler" }],
              null,
            ),
          ],
          replays: [],
          rotations: [],
        }),
      ),
      report = await service.report();

    expect(Date.parse(report.generatedAt)).not.toBeNaN();
    expect(report.identity.noSteamPlayers).toMatchObject([
      {
        matchedPlayerIds: ["player-1"],
        resolutionStatus: "nickname_history",
      },
    ]);
  });
});

class FakeReadinessRepository implements StatisticsReadinessRepository {
  public constructor(
    private readonly options: {
      identityReferences: IdentityReference[];
      parserResults: ParserResultIdentityEvidence[];
      replays: ReplayRotationEvidence[];
      rotations: RotationRangeEvidence[];
    },
  ) {}

  public getCurrentParserIdentityEvidence(): Promise<
    ParserResultIdentityEvidence[]
  > {
    return Promise.resolve(this.options.parserResults);
  }

  public getIdentityReferences(): Promise<IdentityReference[]> {
    return Promise.resolve(this.options.identityReferences);
  }

  public getReplayRotationEvidence(): Promise<ReplayRotationEvidence[]> {
    return Promise.resolve(this.options.replays);
  }

  public getRotationRanges(): Promise<RotationRangeEvidence[]> {
    return Promise.resolve(this.options.rotations);
  }
}

function replay(
  overrides: Partial<ReplayRotationEvidence>,
): ReplayRotationEvidence {
  return {
    matchedRotationIds:
      overrides.rotationMatchCount === 1 ? ["rotation-1"] : [],
    replayId: "replay-1",
    replayTimestamp: "2026-02-01T00:00:00.000Z",
    rotationMatchCount: 1,
    sourceReplayId: "source-1",
    sourceSystem: "solidgames",
    ...overrides,
  };
}

function parserResult(
  players: ParserResultIdentityEvidence["players"],
  replayTimestamp: string | null = "2026-07-01T00:00:00.000Z",
): ParserResultIdentityEvidence {
  return {
    parserResultId: "result-1",
    players,
    replayId: "replay-1",
    replayTimestamp,
    sourceReplayId: "source-1",
    sourceSystem: "solidgames",
  };
}

function identityReference(
  overrides: Partial<IdentityReference> & { playerId: string },
): IdentityReference {
  return {
    displayName: "Display",
    observedFrom: null,
    observedTo: null,
    ...overrides,
  };
}
