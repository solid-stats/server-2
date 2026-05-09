/* eslint-disable camelcase, id-length */
import { describe, expect, it } from "vitest";

import {
  ParserResultRecalculationService,
  type ScopedRecalculationResult,
  type StatisticsRecalculationRepository,
} from "../recalculation.js";

import type {
  NormalizedParserEvent,
  ParserArtifact,
} from "../../parser-artifact.js";

class FakeRecalculationRepository implements StatisticsRecalculationRepository {
  public readonly calls: string[] = [];

  public readonly eventReplacements: NormalizedParserEvent[][] = [];

  public recalculateBountyPointsForParserResult(
    parserResultId: string,
  ): Promise<ScopedRecalculationResult & { bountyRows: number }> {
    this.calls.push(`bounty:${parserResultId}`);
    return Promise.resolve({
      bountyRows: 1,
      rotationId: "rotation-1",
      status: "recalculated",
    });
  }

  public recalculateCommanderSideStatsForParserResult(
    parserResultId: string,
  ): Promise<ScopedRecalculationResult & { commanderStats: number }> {
    this.calls.push(`commander:${parserResultId}`);
    return Promise.resolve({
      commanderStats: 1,
      rotationId: "rotation-1",
      status: "recalculated",
    });
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
    return Promise.resolve({
      playerStats: 2,
      rotationId: "rotation-1",
      squadStats: 1,
      status: "recalculated",
    });
  }

  public replaceParserEvents(
    parserResultId: string,
    events: NormalizedParserEvent[],
  ): Promise<void> {
    this.calls.push(`events:${parserResultId}`);
    this.eventReplacements.push(events);
    return Promise.resolve();
  }
}

describe("ParserResultRecalculationService", () => {
  it("persists normalized events before recalculating every aggregate family", async () => {
    const repository = new FakeRecalculationRepository(),
      service = new ParserResultRecalculationService(repository);

    await expect(
      service.recalculateParserResult("result-1", artifact()),
    ).resolves.toEqual({
      bountyRows: 1,
      commanderStats: 1,
      normalizedEvents: 1,
      playerStats: 2,
      rotationId: "rotation-1",
      squadStats: 1,
      status: "recalculated",
    });

    expect(repository.calls).toEqual([
      "events:result-1",
      "player-squad:result-1",
      "commander:result-1",
      "bounty:result-1",
    ]);
  });

  it("reruns through replacement and recalculation without accumulating normalized events", async () => {
    const repository = new FakeRecalculationRepository(),
      service = new ParserResultRecalculationService(repository);

    await service.recalculateParserResult("result-1", artifact());
    await service.recalculateParserResult("result-1", artifact());

    expect(repository.eventReplacements).toHaveLength(2);
    expect(repository.eventReplacements[0]).toHaveLength(1);
    expect(repository.eventReplacements[1]).toHaveLength(1);
  });
});

function artifact(): ParserArtifact {
  return {
    contract_version: "3.0.0",
    parser: {},
    players: [
      {
        eid: 1,
        kills: [{ c: "enemy_kill", v: 2 }],
        n: "Player",
      },
    ],
    source: {},
    status: "success",
  };
}
