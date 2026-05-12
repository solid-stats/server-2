/* eslint-disable max-lines, max-lines-per-function, no-magic-numbers, no-use-before-define, unicorn/no-null */
import { describe, expect, it } from "vitest";

import {
  kdRatio,
  killsFromVehicleCoef,
  LegacyPublicStatsExportService,
  type LegacyPublicStatsExportData,
  type LegacyPublicStatsExportRepository,
  totalScore,
  weeklyScore,
} from "../legacy-public-export.js";

const generatedAt = new Date("2026-05-12T12:00:00.000Z");

describe("LegacyPublicStatsExportService", () => {
  it("Builds deterministic legacy public export JSON with metadata and sorted surfaces", async () => {
    const service = new LegacyPublicStatsExportService(
      new FakeLegacyExportRepository({
        otherPlayers: [
          {
            killed: [
              { count: 1, id: "player-d", name: "Aaron" },
              { count: 1, id: "player-e", name: "Aaron" },
              { count: 1, id: "player-b", name: "Bravo" },
            ],
            killers: [],
            player: { id: "player-a", name: "Alpha" },
            teamkilled: [],
            teamkillers: [{ count: 2, id: "player-c", name: "Charlie" }],
          },
          {
            killed: [],
            killers: [],
            player: { id: "player-z", name: "Alpha" },
            teamkilled: [],
            teamkillers: [],
          },
        ],
        playerGlobalStats: [
          player({ id: "player-b", kills: 1, name: "Bravo" }),
          player({ id: "player-c", kills: 1, name: "Bravo" }),
          player({
            deathsTotal: 2,
            id: "player-a",
            kills: 3,
            killsFromVehicle: 1,
            name: "Alpha",
            teamkills: 1,
            totalPlayedGames: 2,
            vehicleKills: 2,
          }),
        ],
        rotationStats: [
          {
            endDate: null,
            id: "rotation-1",
            name: "Rotation 1",
            players: [player({ id: "player-a", kills: 3, name: "Alpha" })],
            squads: [
              {
                deathsByTeamkills: 0,
                deathsTotal: 2,
                id: "squad-1",
                kills: 4,
                name: "Squad One",
                players: [],
                teamkills: 1,
                totalPlayedGames: 2,
                totalPlayers: 3,
              },
            ],
            startDate: "2026-01-01T00:00:00.000Z",
            totalGames: 2,
          },
          {
            endDate: null,
            id: "rotation-2",
            name: "Rotation 2",
            players: [],
            squads: [],
            startDate: "2026-01-01T00:00:00.000Z",
            totalGames: 0,
          },
        ],
        sourceDatabase: "solid_stats_test",
        squadStats: [
          {
            deathsByTeamkills: 0,
            deathsTotal: 2,
            id: "squad-1",
            kills: 4,
            name: "Squad One",
            players: [player({ id: "player-a", kills: 3, name: "Alpha" })],
            teamkills: 1,
            totalPlayedGames: 2,
            totalPlayers: 3,
          },
          {
            deathsByTeamkills: 0,
            deathsTotal: 0,
            id: "squad-2",
            kills: 0,
            name: "Empty Squad",
            players: [],
            teamkills: 0,
            totalPlayedGames: 0,
            totalPlayers: 0,
          },
          {
            deathsByTeamkills: 0,
            deathsTotal: 0,
            id: "squad-z",
            kills: 0,
            name: "Empty Squad",
            players: [],
            teamkills: 0,
            totalPlayedGames: 0,
            totalPlayers: 0,
          },
        ],
        weapons: [
          {
            firearms: [
              { kills: 2, name: "Carbine" },
              { kills: 2, name: "Rifle" },
            ],
            player: { id: "player-a", name: "Alpha" },
            vehicles: [{ kills: 1, name: "IFV" }],
          },
          {
            firearms: [],
            player: { id: "player-z", name: "Alpha" },
            vehicles: [],
          },
        ],
        weeks: [
          {
            player: { id: "player-a", name: "Alpha" },
            weeks: [
              {
                deathsByTeamkills: 0,
                deathsTotal: 0,
                endDate: "2026-01-04T23:59:59.999Z",
                kills: 0,
                killsFromVehicle: 0,
                startDate: "2025-12-29T00:00:00.000Z",
                teamkills: 0,
                totalPlayedGames: 1,
                vehicleKills: 0,
                week: "2026-01",
              },
              {
                deathsByTeamkills: 0,
                deathsTotal: 2,
                endDate: "2026-01-11T23:59:59.999Z",
                kills: 3,
                killsFromVehicle: 1,
                startDate: "2026-01-05T00:00:00.000Z",
                teamkills: 1,
                totalPlayedGames: 2,
                vehicleKills: 1,
                week: "2026-02",
              },
            ],
          },
          {
            player: { id: "player-z", name: "Alpha" },
            weeks: [],
          },
        ],
      }),
    );

    await expect(
      service.export({ corpusScope: "sample", generatedAt }),
    ).resolves.toMatchObject({
      metadata: {
        commandVersion: 1,
        contractVersion: "legacy-public-export.v1",
        corpusScope: "sample",
        generatedAt: generatedAt.toISOString(),
        sourceDatabase: "solid_stats_test",
        totals: {
          otherPlayers: 2,
          players: 3,
          rotations: 2,
          squads: 3,
          weapons: 2,
          weeks: 2,
        },
      },
      players: [
        {
          id: "player-a",
          kdRatio: 1.5,
          killed: [
            { count: 1, id: "player-d", name: "Aaron" },
            { count: 1, id: "player-e", name: "Aaron" },
            { count: 1, id: "player-b", name: "Bravo" },
          ],
          killsFromVehicleCoef: 0.33,
          name: "Alpha",
          teamkillers: [{ count: 2, id: "player-c", name: "Charlie" }],
          totalScore: 2,
        },
        { id: "player-b", name: "Bravo" },
        { id: "player-c", name: "Bravo" },
      ],
      squads: [
        {
          averageKills: 2,
          averagePlayersCount: 1.5,
          averageTeamkills: 0.25,
          players: [{ id: "player-a", name: "Alpha" }],
          score: 1.5,
        },
        {
          averageKills: 0,
          averagePlayersCount: 0,
          averageTeamkills: 0,
          name: "Empty Squad",
          score: 0,
        },
        {
          id: "squad-z",
          name: "Empty Squad",
        },
      ],
      weapons: [
        {
          firearms: [
            { kills: 2, name: "Carbine" },
            { kills: 2, name: "Rifle" },
          ],
        },
        {
          player: { id: "player-z", name: "Alpha" },
        },
      ],
      weeks: [
        {
          player: { id: "player-a", name: "Alpha" },
          weeks: [
            {
              kdRatio: 1.5,
              killsFromVehicleCoef: 0.33,
              score: 1,
              week: "2026-02",
            },
            {
              kdRatio: 0,
              killsFromVehicleCoef: 0,
              score: 0,
              week: "2026-01",
            },
          ],
        },
        {
          player: { id: "player-z", name: "Alpha" },
          weeks: [],
        },
      ],
    });
  });
});

describe("legacy export math helpers", () => {
  it("Calculates public ratios and scores with deterministic rounding", () => {
    expect(kdRatio(5, 0)).toBe(5);
    expect(kdRatio(5, 2)).toBe(2.5);
    expect(killsFromVehicleCoef(1, 3)).toBe(0.33);
    expect(totalScore(5, 2)).toBe(3);
    expect(weeklyScore(1, 2, 2)).toBe(-0.5);
    expect(weeklyScore(1, 0, 0)).toBe(0);
  });
});

class FakeLegacyExportRepository implements LegacyPublicStatsExportRepository {
  public constructor(private readonly data: LegacyPublicStatsExportData) {}

  public loadExportData(): Promise<LegacyPublicStatsExportData> {
    return Promise.resolve(this.data);
  }
}

function player(
  overrides: Partial<LegacyPublicStatsExportData["playerGlobalStats"][number]>,
): LegacyPublicStatsExportData["playerGlobalStats"][number] {
  return {
    deathsByTeamkills: 0,
    deathsTotal: 0,
    id: "player",
    kills: 0,
    killsFromVehicle: 0,
    lastPlayedGameDate: null,
    lastSquadPrefix: null,
    name: "Player",
    teamkills: 0,
    totalPlayedGames: 0,
    vehicleKills: 0,
    ...overrides,
  };
}
