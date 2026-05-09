/* eslint-disable camelcase, id-length */
import { describe, expect, it } from "vitest";

import {
  ParserArtifactPersistenceService,
  type StatisticsRepository,
} from "../service.js";

import type {
  NormalizedParserEvent,
  ParserArtifact,
} from "../../parser-artifact.js";

class FakeStatisticsRepository implements StatisticsRepository {
  public calls: { events: NormalizedParserEvent[]; parserResultId: string }[] =
    [];

  public replaceParserEvents(
    parserResultId: string,
    events: NormalizedParserEvent[],
  ): Promise<void> {
    this.calls.push({ events, parserResultId });
    return Promise.resolve();
  }
}

describe("ParserArtifactPersistenceService", () => {
  it("persists mapped parser events and returns event count", async () => {
    const repository = new FakeStatisticsRepository(),
      service = new ParserArtifactPersistenceService(repository),
      count = await service.persistParserArtifact("result-1", artifact());

    expect(count).toBe(1);
    expect(repository.calls).toEqual([
      {
        events: [
          expect.objectContaining({
            eventType: "kill",
          }),
        ],
        parserResultId: "result-1",
      },
    ]);
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
