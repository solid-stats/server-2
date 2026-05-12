/* eslint-disable camelcase, max-lines, max-lines-per-function, no-use-before-define, unicorn/no-null */
import { describe, expect, it } from "vitest";

import { PgLegacyPublicStatsExportRepository } from "../legacy-export.js";

import type { Pool } from "pg";

describe("PgLegacyPublicStatsExportRepository", () => {
  it("Maps legacy export rows into player, squad, rotation, relationship, weapon, and week surfaces", async () => {
    const repository = new PgLegacyPublicStatsExportRepository(
      poolFor(
        new ScriptedLegacyExportPool({
          relationshipRows: [
            {
              count: "2",
              relationship_type: "killed",
              source_player_id: "player-a",
              source_player_name: "Alpha",
              target_player_id: "player-b",
              target_player_name: "Bravo",
            },
            {
              count: "1",
              relationship_type: "teamkilled",
              source_player_id: "player-a",
              source_player_name: "Alpha",
              target_player_id: "player-c",
              target_player_name: "Charlie",
            },
            {
              count: "1",
              relationship_type: "killers",
              source_player_id: "player-b",
              source_player_name: "Bravo",
              target_player_id: "player-a",
              target_player_name: "Alpha",
            },
          ],
          rotationRows: [
            {
              end_date: null,
              id: "rotation-1",
              name: "Rotation 1",
              players: [],
              squads: [],
              start_date: new Date("2026-01-01T00:00:00.000Z"),
              total_games: "2",
            },
          ],
          sourceRows: [{ source_database: "solid_stats_test" }],
          squadRows: [
            {
              deaths_by_teamkills: "1",
              deaths_total: "4",
              id: "squad-1",
              kills: "5",
              name: "Squad One",
              players: [],
              teamkills: "1",
              total_played_games: "2",
              total_players: "3",
            },
          ],
          statRows: [
            {
              deaths_by_teamkills: "1",
              deaths_total: "2",
              id: "player-a",
              kills: 3,
              kills_from_vehicle: "1",
              last_played_game_date: new Date("2026-01-02T00:00:00.000Z"),
              last_squad_prefix: "[A]",
              name: "Alpha",
              teamkills: "1",
              total_played_games: "2",
              vehicle_kills: "2",
            },
          ],
          weaponRows: [
            {
              kills: "2",
              player_id: "player-a",
              player_name: "Alpha",
              weapon_group: "firearms",
              weapon_name: "Rifle",
            },
            {
              kills: "1",
              player_id: "player-a",
              player_name: "Alpha",
              weapon_group: "vehicles",
              weapon_name: "IFV",
            },
          ],
          weekRows: [
            {
              deaths_by_teamkills: "1",
              deaths_total: "2",
              end_date: new Date("2026-01-11T23:59:59.999Z"),
              kills: "3",
              kills_from_vehicle: "1",
              player_id: "player-a",
              player_name: "Alpha",
              start_date: new Date("2026-01-05T00:00:00.000Z"),
              teamkills: "1",
              total_played_games: "2",
              vehicle_kills: "2",
              week: "2026-02",
            },
            {
              deaths_by_teamkills: "0",
              deaths_total: "0",
              end_date: new Date("2026-01-04T23:59:59.999Z"),
              kills: "0",
              kills_from_vehicle: "0",
              player_id: "player-a",
              player_name: "Alpha",
              start_date: new Date("2025-12-29T00:00:00.000Z"),
              teamkills: "0",
              total_played_games: "1",
              vehicle_kills: "0",
              week: "2026-01",
            },
          ],
        }),
      ),
    );

    await expect(repository.loadExportData()).resolves.toEqual({
      otherPlayers: [
        {
          killed: [{ count: 2, id: "player-b", name: "Bravo" }],
          killers: [],
          player: { id: "player-a", name: "Alpha" },
          teamkilled: [{ count: 1, id: "player-c", name: "Charlie" }],
          teamkillers: [],
        },
        {
          killed: [],
          killers: [{ count: 1, id: "player-a", name: "Alpha" }],
          player: { id: "player-b", name: "Bravo" },
          teamkilled: [],
          teamkillers: [],
        },
      ],
      playerGlobalStats: [
        {
          deathsByTeamkills: 1,
          deathsTotal: 2,
          id: "player-a",
          kills: 3,
          killsFromVehicle: 1,
          lastPlayedGameDate: "2026-01-02T00:00:00.000Z",
          lastSquadPrefix: "[A]",
          name: "Alpha",
          teamkills: 1,
          totalPlayedGames: 2,
          vehicleKills: 2,
        },
      ],
      rotationStats: [
        {
          endDate: null,
          id: "rotation-1",
          name: "Rotation 1",
          players: [],
          squads: [],
          startDate: "2026-01-01T00:00:00.000Z",
          totalGames: 2,
        },
      ],
      sourceDatabase: "solid_stats_test",
      squadStats: [
        {
          deathsByTeamkills: 1,
          deathsTotal: 4,
          id: "squad-1",
          kills: 5,
          name: "Squad One",
          players: [],
          teamkills: 1,
          totalPlayedGames: 2,
          totalPlayers: 3,
        },
      ],
      weapons: [
        {
          firearms: [{ kills: 2, name: "Rifle" }],
          player: { id: "player-a", name: "Alpha" },
          vehicles: [{ kills: 1, name: "IFV" }],
        },
      ],
      weeks: [
        {
          player: { id: "player-a", name: "Alpha" },
          weeks: [
            {
              deathsByTeamkills: 1,
              deathsTotal: 2,
              endDate: "2026-01-11T23:59:59.999Z",
              kills: 3,
              killsFromVehicle: 1,
              startDate: "2026-01-05T00:00:00.000Z",
              teamkills: 1,
              totalPlayedGames: 2,
              vehicleKills: 2,
              week: "2026-02",
            },
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
          ],
        },
      ],
    });
  });

  it("Uses safe defaults when optional export rows are absent", async () => {
    const repository = new PgLegacyPublicStatsExportRepository(
      poolFor(
        new ScriptedLegacyExportPool({
          relationshipRows: [],
          rotationRows: [
            {
              end_date: new Date("2026-02-01T00:00:00.000Z"),
              id: "rotation-empty",
              name: "Rotation Empty",
              players: null,
              squads: null,
              start_date: new Date("2026-01-01T00:00:00.000Z"),
              total_games: "0",
            },
          ],
          sourceRows: [],
          squadRows: [
            {
              deaths_by_teamkills: "0",
              deaths_total: "0",
              id: "squad-empty",
              kills: "0",
              name: "Squad Empty",
              players: null,
              teamkills: "0",
              total_played_games: "0",
              total_players: "0",
            },
          ],
          statRows: [],
          weaponRows: [],
          weekRows: [],
        }),
      ),
    );

    await expect(repository.loadExportData()).resolves.toMatchObject({
      rotationStats: [
        {
          endDate: "2026-02-01T00:00:00.000Z",
          players: [],
          squads: [],
        },
      ],
      sourceDatabase: "unknown",
      squadStats: [{ players: [] }],
    });
  });
});

interface ScriptedLegacyExportOptions {
  relationshipRows: unknown[];
  rotationRows: unknown[];
  sourceRows: unknown[];
  squadRows: unknown[];
  statRows: unknown[];
  weaponRows: unknown[];
  weekRows: unknown[];
}

class ScriptedLegacyExportPool {
  public constructor(private readonly options: ScriptedLegacyExportOptions) {}

  public query(sql: string): Promise<{ rows: unknown[] }> {
    const normalizedSql = sql.trim();
    if (normalizedSql.startsWith("select current_database()")) {
      return Promise.resolve({ rows: this.options.sourceRows });
    }
    if (normalizedSql.includes("counter_totals")) {
      return Promise.resolve({ rows: this.options.statRows });
    }
    if (normalizedSql.startsWith("select\n  squad.id")) {
      return Promise.resolve({ rows: this.options.squadRows });
    }
    if (normalizedSql.startsWith("select\n  rotation.id")) {
      return Promise.resolve({ rows: this.options.rotationRows });
    }
    if (normalizedSql.includes("kill_events")) {
      return Promise.resolve({ rows: this.options.relationshipRows });
    }
    if (normalizedSql.includes("case when event.event_type")) {
      return Promise.resolve({ rows: this.options.weaponRows });
    }
    return Promise.resolve({ rows: this.options.weekRows });
  }
}

function poolFor(pool: ScriptedLegacyExportPool): Pool {
  return pool as unknown as Pool;
}
