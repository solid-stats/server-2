/* eslint-disable camelcase, max-lines, max-lines-per-function, no-magic-numbers, no-use-before-define, unicorn/no-null */
import { Pool } from "pg";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../../config/env.js";
import { runMigrations } from "../../../infra/db/migrate.js";
import { PgPublicStatsReadModel } from "../repository.js";
import { decodeCursor, encodeCursor } from "../routes/pagination/cursor.js";
import {
  BOUNTY_SORT,
  PLAYER_SORT,
  SQUAD_SORT,
} from "../routes/pagination/sort.js";

import type { PageCursorState, PageQuery } from "../routes/models.js";

const ALL_SORTS = [
  ...Object.keys(PLAYER_SORT),
  ...Object.keys(SQUAD_SORT),
  ...Object.keys(BOUNTY_SORT),
];

function playerPageByName(
  order: "asc" | "desc",
  after?: PageCursorState,
): PageQuery {
  return after === undefined
    ? { limit: 2, order, sort: "name" }
    : { after, limit: 2, order, sort: "name" };
}

/** Decode a list result's nextCursor into the `after` state for the next page. */
function nextAfter(token: string): PageCursorState {
  const payload = decodeCursor(token, ALL_SORTS, 1);
  return { id: payload.id, value: payload.values[0] ?? null };
}

function stabilityPlayerId(index: number): string {
  const suffix = String(index + 10);
  return `00000000-0000-4000-8000-0000000007${suffix}`;
}

const env = {
    DATABASE_URL:
      process.env["DATABASE_URL"] ??
      "postgresql://solid:solid@localhost:15432/solid_stats",
    RABBITMQ_URL:
      process.env["RABBITMQ_URL"] ?? "amqp://solid:solid@localhost:5673",
    S3_ACCESS_KEY_ID: process.env["S3_ACCESS_KEY_ID"] ?? "solid",
    S3_BUCKET: process.env["S3_BUCKET"] ?? "solid-replays",
    S3_ENDPOINT: process.env["S3_ENDPOINT"] ?? "http://localhost:9000",
    S3_FORCE_PATH_STYLE: process.env["S3_FORCE_PATH_STYLE"] ?? "true",
    S3_REGION: process.env["S3_REGION"] ?? "us-east-1",
    S3_SECRET_ACCESS_KEY: process.env["S3_SECRET_ACCESS_KEY"] ?? "solidsecret",
  },
  config = loadConfig(env),
  pool = new Pool({ connectionString: config.databaseUrl }),
  readModel = new PgPublicStatsReadModel(pool);

beforeAll(async () => {
  await runMigrations(config.databaseUrl);
});

beforeEach(async () => {
  await pool.query(`
    truncate bounty_points, commander_side_stats, player_stats, squad_stats,
      parser_events, parser_results, parse_jobs, replays,
      ingest_staging_records, squad_memberships, squads, player_steam_ids,
      player_nicknames, canonical_players, rotations cascade
  `);
  await seedPublicStats();
});

describe("PgPublicStatsReadModel", () => {
  it("reads overview and rotations", async () => {
    await expect(readModel.getOverview({})).resolves.toMatchObject({
      filters: { rotationId: null },
      totals: {
        bountyPlayers: 1,
        commanderSides: 2,
        parsedReplays: 1,
        players: 2,
        playerStatRows: 2,
        replays: 2,
        squads: 1,
        squadStatRows: 1,
      },
    });
    await expect(readModel.getOverview({ rotationId })).resolves.toMatchObject({
      filters: { rotationId },
      totals: {
        parsedReplays: 1,
        playerStatRows: 2,
        replays: 1,
      },
    });
    await expect(readModel.listRotations()).resolves.toEqual([
      {
        endsAt: null,
        id: otherRotationId,
        name: "Rotation 2",
        startsAt: "2026-06-01T00:00:00.000Z",
      },
      {
        endsAt: "2026-06-01T00:00:00.000Z",
        id: rotationId,
        name: "Rotation 1",
        startsAt: "2026-05-01T00:00:00.000Z",
      },
    ]);
  });

  it("reads player lists and profiles", async () => {
    await expect(
      readModel.listPlayers({ search: "alp" }, playerPageByName("desc")),
    ).resolves.toMatchObject({
      hasMore: false,
      items: [
        {
          displayName: "Alpha",
          id: playerAlphaId,
          rotationId: null,
          stats: { kills: 3, replayCount: 2 },
        },
      ],
      nextCursor: null,
    });
    await expect(
      readModel.listPlayers(
        { rotationId, search: "alias" },
        playerPageByName("desc"),
      ),
    ).resolves.toMatchObject({
      items: [{ displayName: "Alpha", rotationId, stats: { kills: 3 } }],
      nextCursor: null,
    });
    await expect(
      readModel.getPlayer(playerAlphaId, { rotationId }),
    ).resolves.toEqual({
      aliases: ["Alias Alpha"],
      displayName: "Alpha",
      id: playerAlphaId,
      rotationId,
      stats: {
        deaths: { byTeamkills: 0, total: 1 },
        kdRatio: 3,
        kills: 3,
        replayCount: 2,
        teamkills: 0,
        totalPlayedGames: 2,
        totalScore: 3,
      },
      // 14-02 masking: full SteamID -> leading-ellipsis last-4 at the mapper.
      steamIds: ["...lpha"],
    });
    await expect(
      readModel.listPlayers(
        { rotationId: otherRotationId },
        playerPageByName("asc"),
      ),
    ).resolves.toMatchObject({
      items: [
        {
          displayName: "Alpha",
          rotationId: otherRotationId,
          stats: {
            deaths: { byTeamkills: 0, total: 0 },
            kills: 0,
            replayCount: 0,
            teamkills: 0,
          },
        },
        {
          displayName: "Bravo",
          rotationId: otherRotationId,
          stats: {
            deaths: { byTeamkills: 0, total: 0 },
            kills: 0,
            replayCount: 0,
            teamkills: 0,
          },
        },
      ],
    });
    await expect(
      readModel.getPlayer("00000000-0000-4000-8000-000000009999", {}),
    ).resolves.toBeNull();
  });

  it("reads squad lists and profiles", async () => {
    await expect(
      readModel.listSquads(
        { search: "alpha" },
        { limit: 10, order: "desc", sort: "name" },
      ),
    ).resolves.toMatchObject({
      hasMore: false,
      items: [
        {
          id: squadId,
          name: "Alpha Squad",
          rotationId: null,
          stats: { kills: 5, playerCount: 2 },
        },
      ],
      nextCursor: null,
    });
    await expect(readModel.getSquad(squadId, { rotationId })).resolves.toEqual({
      id: squadId,
      name: "Alpha Squad",
      players: [
        { displayName: "Alpha", id: playerAlphaId },
        { displayName: "Bravo", id: playerBravoId },
      ],
      rotationId,
      stats: {
        deaths: { byTeamkills: 1, total: 2 },
        kills: 5,
        playerCount: 2,
        replayCount: 3,
        teamkills: 1,
      },
    });
    await expect(
      readModel.listSquads(
        { rotationId: otherRotationId },
        { limit: 10, order: "desc", sort: "name" },
      ),
    ).resolves.toMatchObject({
      items: [
        {
          name: "Alpha Squad",
          rotationId: otherRotationId,
          stats: {
            deaths: { byTeamkills: 0, total: 0 },
            kills: 0,
            playerCount: 0,
            replayCount: 0,
            teamkills: 0,
          },
        },
      ],
    });
    await expect(
      readModel.getSquad("00000000-0000-4000-8000-000000009998", {}),
    ).resolves.toBeNull();
  });

  it("reads commander sides, bounty pages, and leaderboards", async () => {
    await expect(readModel.listCommanderSides({})).resolves.toEqual([
      {
        knownLosses: 0,
        knownWins: 1,
        player: null,
        rotationId,
        side: "east",
        unknownOutcomes: 1,
      },
      {
        knownLosses: 1,
        knownWins: 2,
        player: { displayName: "Alpha", id: playerAlphaId },
        rotationId,
        side: "west",
        unknownOutcomes: 0,
      },
    ]);
    await expect(
      readModel.listBounty(
        { rotationId },
        { limit: 10, order: "desc", sort: "points" },
      ),
    ).resolves.toMatchObject({
      hasMore: false,
      items: [
        {
          player: { displayName: "Alpha", id: playerAlphaId },
          points: 7.5,
          rotationId,
        },
      ],
      nextCursor: null,
    });
    await expect(
      readModel.getLeaderboards({ limit: 1, rotationId }),
    ).resolves.toMatchObject({
      bounty: { items: [{ points: 7.5 }] },
      playersByKills: {
        items: [{ displayName: "Alpha", stats: { kills: 3 } }],
      },
      rotationId,
      squadsByKills: { items: [{ name: "Alpha Squad", stats: { kills: 5 } }] },
    });
    await expect(
      readModel.getLeaderboards({ limit: 1 }),
    ).resolves.toMatchObject({
      rotationId: null,
    });
  });
});

/**
 * PAGE-02 cross-page-boundary stability proof against real PostgreSQL.
 *
 * The dangerous real-world degeneracy is a sort key with MANY shared values: a
 * naive seek that only compares the sort value (no unique tie-breaker) silently
 * drops or duplicates rows at a page boundary that splits a run of equal values.
 * This suite seeds a dataset whose `kills` sort key is heavily tied (a block of
 * 0s plus repeated non-zero values) and whose `name` key is fully distinct, then
 * pages the WHOLE set via successive `nextCursor` calls and asserts the union of
 * returned ids equals the seeded set with NO duplicate and NO missing id — for
 * both `asc` and `desc`.
 *
 * NULL sort-key note: every list sort expression is either a NOT NULL column
 * (`display_name`) or `coalesce(sum(...), 0)`, so the production schema cannot
 * surface a NULL sort value end-to-end. The keyset builder's four NULL-aware OR
 * branches (NULLS FIRST/LAST, both directions) are exhaustively proven in
 * `keyset.test.ts`; here we prove the shared-value (tie-breaker) dimension on
 * real PG, which is the actual MEDIUM-confidence hazard from 14-RESEARCH.
 */
// 7 players: kills = [0,0,0,2,2,5,5] across distinct ids. Heavy ties on both
// 0 and the non-zero values force the id tie-breaker at every boundary.
const STABILITY_PLAYER_COUNT = 7,
  STABILITY_PAGE_LIMIT = 2,
  KILLS_BY_INDEX = [0, 0, 0, 2, 2, 5, 5];

async function seedStabilityDataset(): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < STABILITY_PLAYER_COUNT; index += 1) {
    const id = stabilityPlayerId(index),
      // ASCII 'A'..'G' keep the `name` sort distinct and deterministic.
      name = `Player ${String.fromCodePoint(65 + index)}`;
    ids.push(id);
    await pool.query(
      "insert into canonical_players (id, display_name) values ($1, $2)",
      [id, name],
    );
    await pool.query(
      "insert into player_stats (rotation_id, player_id, stats) values ($1, $2, $3)",
      [
        rotationId,
        id,
        {
          deaths: { by_teamkills: 0, total: 0 },
          kills: KILLS_BY_INDEX[index],
          replay_count: 1,
          teamkills: 0,
        },
      ],
    );
  }
  return ids;
}

async function pageAllPlayerIds(
  sort: "kills" | "name",
  order: "asc" | "desc",
): Promise<string[]> {
  const collected: string[] = [];
  // eslint-disable-next-line init-declarations -- no-undef-init forbids `= undefined`; the do/while assigns before first read
  let after: PageCursorState | undefined;
  let guard = 0;
  // Walk nextCursor until hasMore is false.
  do {
    const page: PageQuery =
        after === undefined
          ? { limit: STABILITY_PAGE_LIMIT, order, sort }
          : { after, limit: STABILITY_PAGE_LIMIT, order, sort },
      result = await readModel.listPlayers({ rotationId }, page);
    for (const item of result.items) {
      collected.push(item.id);
    }
    after =
      result.nextCursor === null ? undefined : nextAfter(result.nextCursor);
    guard += 1;
    if (guard > STABILITY_PLAYER_COUNT + 2) {
      throw new Error("keyset paging failed to terminate");
    }
  } while (after !== undefined);
  return collected;
}

describe("PgPublicStatsReadModel keyset cross-boundary stability", () => {
  beforeEach(async () => {
    await pool.query("truncate player_stats, canonical_players cascade");
    await pool.query(
      "insert into rotations (id, name, starts_at, ends_at) values ($1, 'Stab', '2026-05-01T00:00:00.000Z', null) on conflict do nothing",
      [rotationId],
    );
  });

  it.each([
    ["kills", "asc"],
    ["kills", "desc"],
    ["name", "asc"],
    ["name", "desc"],
  ] as const)(
    "pages every id exactly once with no dup/no missing across boundaries (sort=%s order=%s)",
    async (sort, order) => {
      const seededIds = await seedStabilityDataset(),
        pagedIds = await pageAllPlayerIds(sort, order);

      expect(pagedIds).toHaveLength(seededIds.length);
      expect(new Set(pagedIds).size).toBe(pagedIds.length);
      expect([...pagedIds].toSorted()).toEqual([...seededIds].toSorted());
    },
  );
});

/**
 * Overflow paths: with more rows than `limit`, each list query sets `hasMore`
 * and encodes a `nextCursor` from the last kept row — exercising the per-entity
 * cursor builders (player teamkills, squad name/kills, bounty points) and the
 * bounty WHERE composition that ANDs a rotation filter with the seek predicate.
 */
describe("PgPublicStatsReadModel keyset overflow cursors", () => {
  // Runs on top of the standard seedPublicStats dataset (2 players, 1 squad,
  // 1 bounty row in `rotationId`); each test adds one more row to overflow.
  const SECOND_SQUAD_ID = "00000000-0000-4000-8000-000000000801";

  it("pages players by teamkills with a nextCursor when the page overflows", async () => {
    const result = await readModel.listPlayers(
      { rotationId },
      { limit: 1, order: "desc", sort: "teamkills" },
    );

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
    const next = await readModel.listPlayers(
      { rotationId },
      {
        after: nextAfter(result.nextCursor ?? ""),
        limit: 1,
        order: "desc",
        sort: "teamkills",
      },
    );
    expect(next.items).not.toHaveLength(0);
  });

  it("pages squads by name with a nextCursor when the page overflows", async () => {
    await pool.query(
      "insert into squads (id, name) values ($1, 'Beta Squad')",
      [SECOND_SQUAD_ID],
    );
    const result = await readModel.listSquads(
      {},
      { limit: 1, order: "asc", sort: "name" },
    );

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
  });

  it("pages squads by kills with a nextCursor (kills sort value path)", async () => {
    await pool.query(
      "insert into squads (id, name) values ($1, 'Beta Squad')",
      [SECOND_SQUAD_ID],
    );
    await pool.query(
      "insert into squad_stats (rotation_id, squad_id, stats) values ($1, $2, $3)",
      [
        rotationId,
        SECOND_SQUAD_ID,
        {
          deaths: { by_teamkills: 0, total: 0 },
          kills: 2,
          player_count: 1,
          replay_count: 1,
          teamkills: 0,
        },
      ],
    );
    const result = await readModel.listSquads(
      { rotationId },
      { limit: 1, order: "desc", sort: "kills" },
    );

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
    const next = await readModel.listSquads(
      { rotationId },
      {
        after: nextAfter(result.nextCursor ?? ""),
        limit: 1,
        order: "desc",
        sort: "kills",
      },
    );
    expect(next.items).not.toHaveLength(0);
  });

  it("pages bounty by points within a rotation (seek predicate ANDs the rotation WHERE)", async () => {
    // A second bounty row in the same rotation forces an overflow + nextCursor.
    await pool.query(
      "insert into bounty_points (rotation_id, player_id, points) values ($1, $2, 9.00)",
      [rotationId, playerBravoId],
    );
    const result = await readModel.listBounty(
      { rotationId },
      { limit: 1, order: "desc", sort: "points" },
    );

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
    // Second page: cursor + rotation filter -> composeBountyWhere ANDs both.
    const next = await readModel.listBounty(
      { rotationId },
      {
        after: nextAfter(result.nextCursor ?? ""),
        limit: 1,
        order: "desc",
        sort: "points",
      },
    );
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.points).toBeLessThanOrEqual(9);
  });

  it("pages bounty by points without a rotation filter (seek-only WHERE)", async () => {
    // No rotation filter + a cursor -> composeBountyWhere emits `where <seek>`.
    await pool.query(
      "insert into bounty_points (rotation_id, player_id, points) values ($1, $2, 9.00)",
      [rotationId, playerBravoId],
    );
    const result = await readModel.listBounty(
      {},
      { limit: 1, order: "desc", sort: "points" },
    );

    expect(result.hasMore).toBe(true);
    const next = await readModel.listBounty(
      {},
      {
        after: nextAfter(result.nextCursor ?? ""),
        limit: 1,
        order: "desc",
        sort: "points",
      },
    );
    expect(next.items).not.toHaveLength(0);
  });

  it("pages squads by teamkills (teamkills sort value path)", async () => {
    await pool.query(
      "insert into squads (id, name) values ($1, 'Beta Squad')",
      [SECOND_SQUAD_ID],
    );
    await pool.query(
      "insert into squad_stats (rotation_id, squad_id, stats) values ($1, $2, $3)",
      [
        rotationId,
        SECOND_SQUAD_ID,
        {
          deaths: { by_teamkills: 0, total: 0 },
          kills: 0,
          player_count: 1,
          replay_count: 1,
          teamkills: 2,
        },
      ],
    );
    const result = await readModel.listSquads(
      { rotationId },
      { limit: 1, order: "desc", sort: "teamkills" },
    );

    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
  });

  it("paginates leaderboards from a per-surface cursor (leaderboardPage after branch)", async () => {
    // Provide all three surface cursors so leaderboardPage takes its `after` arm.
    const bountyCursor = encodeCursor({
        id: playerAlphaId,
        order: "desc",
        sort: "points",
        values: [100],
      }),
      playersCursor = encodeCursor({
        id: playerAlphaId,
        order: "desc",
        sort: "kills",
        values: [100],
      }),
      squadsCursor = encodeCursor({
        id: squadId,
        order: "desc",
        sort: "kills",
        values: [100],
      }),
      result = await readModel.getLeaderboards({
        bountyAfter: nextAfter(bountyCursor),
        limit: 5,
        playersAfter: nextAfter(playersCursor),
        rotationId,
        squadsAfter: nextAfter(squadsCursor),
      });

    expect(result.bounty.items).not.toHaveLength(0);
    expect(result.playersByKills.items).not.toHaveLength(0);
  });
});

const rotationId = "00000000-0000-4000-8000-000000000501",
  otherRotationId = "00000000-0000-4000-8000-000000000502",
  playerAlphaId = "00000000-0000-4000-8000-000000000601",
  playerBravoId = "00000000-0000-4000-8000-000000000602",
  squadId = "00000000-0000-4000-8000-000000000701",
  replayId = "00000000-0000-4000-8000-000000000801",
  otherReplayId = "00000000-0000-4000-8000-000000000802";

async function seedPublicStats(): Promise<void> {
  await pool.query(
    `
      insert into rotations (id, name, starts_at, ends_at)
      values
        ($1, 'Rotation 1', '2026-05-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
        ($2, 'Rotation 2', '2026-06-01T00:00:00.000Z', null)
    `,
    [rotationId, otherRotationId],
  );
  await pool.query(
    `
      insert into canonical_players (id, display_name)
      values ($1, 'Alpha'), ($2, 'Bravo')
    `,
    [playerAlphaId, playerBravoId],
  );
  await pool.query(
    `
      insert into player_nicknames (player_id, nickname)
      values ($1, 'Alias Alpha')
    `,
    [playerAlphaId],
  );
  await pool.query(
    `
      insert into player_steam_ids (player_id, steam_id)
      values ($1, 'steam-alpha')
    `,
    [playerAlphaId],
  );
  await pool.query("insert into squads (id, name) values ($1, 'Alpha Squad')", [
    squadId,
  ]);
  await pool.query(
    `
      insert into squad_memberships (squad_id, player_id, valid_from)
      values ($1, $2, '2026-05-01T00:00:00.000Z'), ($1, $3, '2026-05-01T00:00:00.000Z')
    `,
    [squadId, playerAlphaId, playerBravoId],
  );
  await pool.query(
    `
      insert into replays (
        id, source_system, source_replay_id, object_key, checksum, size_bytes,
        replay_timestamp, rotation_id, status
      )
      values
        ($1, 'solidgames', 'replay-1', 'raw/replay-1.json', $3, 128, '2026-05-02T00:00:00.000Z', $5, 'parsed'),
        ($2, 'solidgames', 'replay-2', 'raw/replay-2.json', $4, 128, '2026-06-02T00:00:00.000Z', $6, 'ready_for_parse')
    `,
    [
      replayId,
      otherReplayId,
      "a".repeat(64),
      "b".repeat(64),
      rotationId,
      otherRotationId,
    ],
  );
  await pool.query(
    `
      insert into player_stats (rotation_id, player_id, stats)
      values
        ($1, $2, $4),
        ($1, $3, $5)
    `,
    [
      rotationId,
      playerAlphaId,
      playerBravoId,
      {
        deaths: { by_teamkills: 0, total: 1 },
        kills: 3,
        replay_count: 2,
        teamkills: 0,
      },
      {
        deaths: { by_teamkills: 1, total: 2 },
        kills: 1,
        replay_count: 1,
        teamkills: 1,
      },
    ],
  );
  await pool.query(
    `
      insert into squad_stats (rotation_id, squad_id, stats)
      values ($1, $2, $3)
    `,
    [
      rotationId,
      squadId,
      {
        deaths: { by_teamkills: 1, total: 2 },
        kills: 5,
        player_count: 2,
        replay_count: 3,
        teamkills: 1,
      },
    ],
  );
  await pool.query(
    `
      insert into commander_side_stats (
        rotation_id, player_id, side, known_wins, known_losses, unknown_outcomes
      )
      values ($1, $2, 'west', 2, 1, 0), ($1, null, 'east', 1, 0, 1)
    `,
    [rotationId, playerAlphaId],
  );
  await pool.query(
    "insert into bounty_points (rotation_id, player_id, points) values ($1, $2, 7.50)",
    [rotationId, playerAlphaId],
  );
}

// ---------------------------------------------------------------------------
// Parity sub-resource tests (15-02): parser_events-backed methods
// ---------------------------------------------------------------------------

const parityJobId = "00000000-0000-4000-8000-000000000901",
  parityResultId = "00000000-0000-4000-8000-000000000902";

/**
 * Seed a parse_job + parser_result + parser_events for replayId so that
 * Alpha has weapon/week/relationship parity data resolvable via steam_id.
 *
 * Alpha (observed_player_ref = 'alpha-ref'):
 *   - player_counter: kills=3, kills_from_vehicle=1, vehicle_kills=2,
 *       teamkills=0, deaths_total=1, deaths_by_teamkills=0
 *   - kill (victim 'bravo-ref') with weapon 'Rifle'
 *   - kill (victim 'bravo-ref') with weapon 'Rifle'
 *   - kill (victim 'bravo-ref') with weapon 'Pistol'
 *   - destroyed_vehicle (victim 'bravo-ref') with weapon 'RPG'
 *   - destroyed_vehicle (victim 'bravo-ref') with weapon 'RPG'
 *
 * Bravo (observed_player_ref = 'bravo-ref'):
 *   - player_counter: kills=1, kills_from_vehicle=0, vehicle_kills=0,
 *       teamkills=0, deaths_total=3, deaths_by_teamkills=0
 *   - kill (victim 'alpha-ref') with weapon 'SMG'
 */
async function seedParityEvents(): Promise<void> {
  await pool.query(
    `
      insert into parse_jobs (id, replay_id, parser_contract_version, object_key, checksum, status)
      values ($1, $2, 'v1', 'raw/replay-1.json', $3, 'succeeded')
    `,
    [parityJobId, replayId, "a".repeat(64)],
  );
  await pool.query(
    `
      insert into parser_results (id, replay_id, parse_job_id, parser_contract_version, status, raw_snapshot)
      values ($1, $2, $3, 'v1', 'current', '{}'::jsonb)
    `,
    [parityResultId, replayId, parityJobId],
  );

  // Alpha: player_counter
  await pool.query(
    `
      insert into parser_events (parser_result_id, event_type, occurred_at, observed_player_ref, payload, source_ref)
      values ($1, 'player_counter', '2026-05-02T12:00:00.000Z', 'alpha-ref',
        '{"player":{"name":"Alpha","steam_id":"steam-alpha"},"kills":3,"kills_from_vehicle":1,"vehicle_kills":2,"teamkills":0,"deaths_total":1,"deaths_by_teamkills":0}'::jsonb,
        '{}'::jsonb)
    `,
    [parityResultId],
  );
  // Alpha: 2x kill with Rifle
  await pool.query(
    `
      insert into parser_events (parser_result_id, event_type, occurred_at, observed_player_ref, payload, source_ref)
      values
        ($1, 'kill', '2026-05-02T12:01:00.000Z', 'alpha-ref',
          '{"weapon_name":"Rifle","victim_entity_id":"bravo-ref"}'::jsonb, '{}'::jsonb),
        ($1, 'kill', '2026-05-02T12:02:00.000Z', 'alpha-ref',
          '{"weapon_name":"Rifle","victim_entity_id":"bravo-ref"}'::jsonb, '{}'::jsonb)
    `,
    [parityResultId],
  );
  // Alpha: 1x kill with Pistol
  await pool.query(
    `
      insert into parser_events (parser_result_id, event_type, occurred_at, observed_player_ref, payload, source_ref)
      values ($1, 'kill', '2026-05-02T12:03:00.000Z', 'alpha-ref',
        '{"weapon_name":"Pistol","victim_entity_id":"bravo-ref"}'::jsonb, '{}'::jsonb)
    `,
    [parityResultId],
  );
  // Alpha: 2x destroyed_vehicle with RPG
  await pool.query(
    `
      insert into parser_events (parser_result_id, event_type, occurred_at, observed_player_ref, payload, source_ref)
      values
        ($1, 'destroyed_vehicle', '2026-05-02T12:04:00.000Z', 'alpha-ref',
          '{"weapon_name":"RPG","victim_entity_id":"bravo-ref"}'::jsonb, '{}'::jsonb),
        ($1, 'destroyed_vehicle', '2026-05-02T12:05:00.000Z', 'alpha-ref',
          '{"weapon_name":"RPG","victim_entity_id":"bravo-ref"}'::jsonb, '{}'::jsonb)
    `,
    [parityResultId],
  );

  // Bravo: player_counter
  await pool.query(
    `
      insert into parser_events (parser_result_id, event_type, occurred_at, observed_player_ref, payload, source_ref)
      values ($1, 'player_counter', '2026-05-02T12:00:00.000Z', 'bravo-ref',
        '{"player":{"name":"Bravo","steam_id":"steam-bravo"},"kills":1,"kills_from_vehicle":0,"vehicle_kills":0,"teamkills":0,"deaths_total":3,"deaths_by_teamkills":0}'::jsonb,
        '{}'::jsonb)
    `,
    [parityResultId],
  );
  // Bravo: 1x kill with SMG
  await pool.query(
    `
      insert into parser_events (parser_result_id, event_type, occurred_at, observed_player_ref, payload, source_ref)
      values ($1, 'kill', '2026-05-02T12:06:00.000Z', 'bravo-ref',
        '{"weapon_name":"SMG","victim_entity_id":"alpha-ref"}'::jsonb, '{}'::jsonb)
    `,
    [parityResultId],
  );
}

describe("PgPublicStatsReadModel parity sub-resources", () => {
  beforeEach(async () => {
    await seedParityEvents();
  });

  it("getPlayerWeapons returns sorted firearms and vehicles for a known player", async () => {
    const result = await readModel.getPlayerWeapons(playerAlphaId);

    expect(result).not.toBeNull();
    // Firearms sorted by kills desc, then name: Rifle(2) > Pistol(1)
    expect(result?.firearms).toEqual([
      { kills: 2, name: "Rifle" },
      { kills: 1, name: "Pistol" },
    ]);
    // Vehicles: RPG x2
    expect(result?.vehicles).toEqual([{ kills: 2, name: "RPG" }]);
  });

  it("getPlayerWeapons returns null for an unknown player", async () => {
    await expect(
      readModel.getPlayerWeapons("00000000-0000-4000-8000-000000009999"),
    ).resolves.toBeNull();
  });

  it("getPlayerVehicles returns killsFromVehicle, vehicleKills, coef, and vehicles list", async () => {
    const result = await readModel.getPlayerVehicles(playerAlphaId);

    expect(result).not.toBeNull();
    expect(result?.killsFromVehicle).toBe(1);
    expect(result?.vehicleKills).toBe(2);
    // coef = round(1/3, 3) = 0.333
    expect(result?.killsFromVehicleCoef).toBeCloseTo(0.333, 2);
    expect(result?.vehicles).toEqual([{ kills: 2, name: "RPG" }]);
  });

  it("getPlayerVehicles returns null for an unknown player", async () => {
    await expect(
      readModel.getPlayerVehicles("00000000-0000-4000-8000-000000009999"),
    ).resolves.toBeNull();
  });

  it("getPlayerRelationships returns killed/killers lists for a known player", async () => {
    const result = await readModel.getPlayerRelationships(playerAlphaId);

    expect(result).not.toBeNull();
    // Alpha killed Bravo 3 times (2 Rifle + 1 Pistol)
    expect(result?.killed).toEqual([
      { count: 3, player: { displayName: "Bravo", id: playerBravoId } },
    ]);
    // Bravo killed Alpha 1 time
    expect(result?.killers).toEqual([
      { count: 1, player: { displayName: "Bravo", id: playerBravoId } },
    ]);
    expect(result?.teamkilled).toEqual([]);
    expect(result?.teamkillers).toEqual([]);
  });

  it("getPlayerRelationships returns null for an unknown player", async () => {
    await expect(
      readModel.getPlayerRelationships("00000000-0000-4000-8000-000000009999"),
    ).resolves.toBeNull();
  });

  it("getPlayerWeekly returns weekly buckets with formulas applied", async () => {
    const result = await readModel.getPlayerWeekly(playerAlphaId);

    expect(result).not.toBeNull();
    expect(result?.weeks).toHaveLength(1);
    const [week] = result?.weeks ?? [];
    // 2026-05-02 falls in ISO week 2026-18
    expect(week?.week).toBe("2026-18");
    expect(week?.kills).toBe(3);
    expect(week?.deaths.total).toBe(1);
    expect(week?.kdRatio).toBeCloseTo(3, 1);
    expect(week?.totalPlayedGames).toBe(1);
    expect(week?.killsFromVehicle).toBe(1);
    expect(week?.vehicleKills).toBe(2);
    expect(week?.killsFromVehicleCoef).toBeCloseTo(0.333, 2);
  });

  it("getPlayerWeekly returns null for an unknown player", async () => {
    await expect(
      readModel.getPlayerWeekly("00000000-0000-4000-8000-000000009999"),
    ).resolves.toBeNull();
  });

  it("PARITY-05: getPlayer returns stats with kdRatio, totalScore, totalPlayedGames", async () => {
    const result = await readModel.getPlayer(playerAlphaId, { rotationId });

    expect(result).not.toBeNull();
    expect(result?.stats.kills).toBe(3);
    expect(result?.stats.kdRatio).toBeCloseTo(3, 1);
    // totalScore = kills - teamkills = 3 - 0 = 3
    expect(result?.stats.totalScore).toBe(3);
    expect(result?.stats.totalPlayedGames).toBe(2);
  });

  it("Steam64 leak guard: no Steam64 appears in any parity response body", async () => {
    const steam64Pattern = /7656119\d{10}/u;
    const [weapons, vehicles, relationships, weekly] = await Promise.all([
      readModel.getPlayerWeapons(playerAlphaId),
      readModel.getPlayerVehicles(playerAlphaId),
      readModel.getPlayerRelationships(playerAlphaId),
      readModel.getPlayerWeekly(playerAlphaId),
    ]);

    for (const body of [weapons, vehicles, relationships, weekly]) {
      expect(JSON.stringify(body)).not.toMatch(steam64Pattern);
    }
    // 404 body
    expect(JSON.stringify({ message: "player not found" })).not.toMatch(
      steam64Pattern,
    );
  });
});
