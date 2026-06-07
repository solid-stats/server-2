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
import { slugify } from "../routes/slug.js";

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
    // Phase 16: slug field is null (no backfill in seed). Use toMatchObject to
    // tolerate the additive slug/provenance fields added by Phase 16 plans.
    await expect(readModel.listRotations()).resolves.toMatchObject([
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
    // Phase 16: getPlayer now returns slug + provenance (additive fields).
    // Use toMatchObject to tolerate these without having to enumerate them fully.
    await expect(
      readModel.getPlayer(playerAlphaId, { rotationId }),
    ).resolves.toMatchObject({
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
    // Phase 16: getSquad now returns slug + provenance (additive). Use toMatchObject.
    await expect(
      readModel.getSquad(squadId, { rotationId }),
    ).resolves.toMatchObject({
      id: squadId,
      name: "Alpha Squad",
      players: [
        { displayName: "Alpha", id: playerAlphaId },
        { displayName: "Bravo", id: playerBravoId },
      ],
      rotationId,
      stats: {
        deaths: { byTeamkills: 1, total: 2 },
        // PARITY-06: extended fields (byte-identical to SQUAD_STATS_SQL semantics)
        kdRatio: 2.5,
        kills: 5,
        playerCount: 2,
        replayCount: 3,
        teamkills: 1,
        totalPlayedGames: 3,
        totalScore: 4,
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

// ---------------------------------------------------------------------------
// PARITY-06: Squad sub-resource integration tests (15-03)
// ---------------------------------------------------------------------------

/**
 * Squad parity integration tests. The seeded parity data (seedParityEvents)
 * from 15-02 covers Alpha+Bravo in the same squad (squadId). Both members are
 * seeded via steam_id resolution, so squad parity queries find their events.
 *
 * Squad weapons/relationships/weekly are documented member-level aggregations —
 * NOT byte-identical to a legacy squad formula (none exists, 15-CONTEXT Q3).
 *
 * Squad KD/score/games (from getSquad) ARE byte-identical to SQUAD_STATS_SQL:
 * kills=5, deaths_total=2, teamkills=1 → kdRatio=round(5/2)=2.5,
 * totalScore=round(5-1)=4, totalPlayedGames=replayCount=3.
 */
describe("PgPublicStatsReadModel squad parity sub-resources (PARITY-06)", () => {
  beforeEach(async () => {
    await seedParityEvents();
  });

  it("getSquad returns stats with kdRatio/totalScore/totalPlayedGames byte-identical to SQUAD_STATS_SQL", async () => {
    const result = await readModel.getSquad(squadId, { rotationId });

    expect(result).not.toBeNull();
    // SQUAD_STATS_SQL: kills=5, deaths_total=2, teamkills=1, replay_count=3
    expect(result?.stats.kills).toBe(5);
    expect(result?.stats.deaths.total).toBe(2);
    expect(result?.stats.teamkills).toBe(1);
    expect(result?.stats.replayCount).toBe(3);
    // kdRatio = round(5/2) = 2.5 (byte-identical to SQUAD_STATS_SQL semantics)
    expect(result?.stats.kdRatio).toBeCloseTo(2.5, 2);
    // totalScore = round(5 - 1) = 4
    expect(result?.stats.totalScore).toBe(4);
    // totalPlayedGames = replayCount = 3
    expect(result?.stats.totalPlayedGames).toBe(3);
  });

  it("getSquadWeapons returns member-aggregated firearms and vehicles sorted deterministically", async () => {
    // Alpha: Rifle×2, Pistol×1 (firearms); RPG×2 (vehicles)
    // Bravo: SMG×1 (firearms); no vehicles
    // Squad aggregate: Rifle×2, Pistol×1, SMG×1 (firearms, sorted kills desc then name)
    //                  RPG×2 (vehicles)
    const result = await readModel.getSquadWeapons(squadId);

    expect(result).not.toBeNull();
    // Firearms sorted by kills desc, then name: Rifle(2) > Pistol(1) ~ SMG(1)
    expect(result?.firearms).toHaveLength(3);
    expect(result?.firearms[0]).toEqual({ kills: 2, name: "Rifle" });
    // Pistol and SMG both have 1 kill, sorted by name asc
    expect(result?.firearms[1]?.kills).toBe(1);
    expect(result?.firearms[2]?.kills).toBe(1);
    expect(result?.vehicles).toEqual([{ kills: 2, name: "RPG" }]);
  });

  it("getSquadWeapons returns null for an unknown squad", async () => {
    await expect(
      readModel.getSquadWeapons("00000000-0000-4000-8000-000000009998"),
    ).resolves.toBeNull();
  });

  it("getSquadRelationships returns member-aggregated relationship lists", async () => {
    // Alpha killed Bravo 3×; Bravo killed Alpha 1×
    // Squad aggregate: both members' relationships combined
    const result = await readModel.getSquadRelationships(squadId);

    expect(result).not.toBeNull();
    // From Alpha's perspective: killed Bravo 3×
    // From Bravo's perspective: killed Alpha 1×
    // Squad killed: {Bravo: 3} + {Alpha: 1} from respective members
    expect(result?.killed).toHaveLength(2);
    // Squad killers: {Bravo: 1} + {Alpha: 3} from respective members
    expect(result?.killers).toHaveLength(2);
    expect(result?.teamkilled).toHaveLength(0);
    expect(result?.teamkillers).toHaveLength(0);
  });

  it("getSquadRelationships returns null for an unknown squad", async () => {
    await expect(
      readModel.getSquadRelationships("00000000-0000-4000-8000-000000009998"),
    ).resolves.toBeNull();
  });

  it("getSquadWeekly returns member-aggregated weekly buckets with formulas applied", async () => {
    // Alpha: kills=3, deaths=1, killsFromVehicle=1, vehicleKills=2 in week 2026-18
    // Bravo: kills=1, deaths=3 in week 2026-18
    // Squad aggregate: kills=4, deaths=4, killsFromVehicle=1, vehicleKills=2
    const result = await readModel.getSquadWeekly(squadId);

    expect(result).not.toBeNull();
    expect(result?.weeks).toHaveLength(1);
    const [week] = result?.weeks ?? [];
    expect(week?.week).toBe("2026-18");
    expect(week?.kills).toBe(4);
    expect(week?.deaths.total).toBe(4);
    // kdRatio = round(4/4) = 1.0
    expect(week?.kdRatio).toBeCloseTo(1, 2);
    // totalPlayedGames = 1 (Alpha) + 1 (Bravo) = 2 distinct replays per member
    expect(week?.totalPlayedGames).toBe(2);
  });

  it("getSquadWeekly returns null for an unknown squad", async () => {
    await expect(
      readModel.getSquadWeekly("00000000-0000-4000-8000-000000009998"),
    ).resolves.toBeNull();
  });

  it("Steam64 leak guard: no Steam64 in any squad parity response body or 404", async () => {
    const steam64Pattern = /7656119\d{10}/u;
    const [weapons, relationships, weekly] = await Promise.all([
      readModel.getSquadWeapons(squadId),
      readModel.getSquadRelationships(squadId),
      readModel.getSquadWeekly(squadId),
    ]);

    for (const body of [weapons, relationships, weekly]) {
      expect(JSON.stringify(body)).not.toMatch(steam64Pattern);
    }
    // 404 body — fixed string, no id echoing
    expect(JSON.stringify({ message: "squad not found" })).not.toMatch(
      steam64Pattern,
    );
  });
});

// ---------------------------------------------------------------------------
// Parity edge-case coverage (15-03): empty branches + teamkill + count merge
// ---------------------------------------------------------------------------

/**
 * IDs for edge-case tests — range 1001+ to avoid conflicts with main fixtures.
 *
 * edgePlayerA: player with no parity events → empty weapons/rels/weekly
 * edgePlayerB: player with teamkill events → teamkilled/teamkillers callbacks
 * edgePlayerC: target of teamkills by B
 * edgeSquadEmpty: squad with no members → weapons/rels/weekly return empty
 * edgeSquadNoEvents: squad with members but no parser events
 * edgeSquadTeamkill: squad with teamkill events → teamkilled/teamkillers
 * edgeJobId/edgeResultId: parse artefacts for edge events
 */
const edgePlayerAId = "00000000-0000-4000-8000-000000001001",
  edgePlayerBId = "00000000-0000-4000-8000-000000001002",
  edgePlayerCId = "00000000-0000-4000-8000-000000001003",
  edgeSquadEmptyId = "00000000-0000-4000-8000-000000001101",
  edgeSquadNoEventsId = "00000000-0000-4000-8000-000000001102",
  edgeSquadTeamkillId = "00000000-0000-4000-8000-000000001103",
  edgeJobId = "00000000-0000-4000-8000-000000001201",
  edgeResultId = "00000000-0000-4000-8000-000000001202";

/**
 * Seed canonical players and squads needed for edge-case tests.
 * Player A has no steam_id → parity queries return 0 rows (empty branches).
 * Player B has steam_id "steam-edge-b"; Player C has steam_id "steam-edge-c".
 * edgeSquadEmpty has no members.
 * edgeSquadNoEvents has players A+B as members but no parser events.
 * edgeSquadTeamkill has players B+C as members with teamkill event data.
 */
async function seedEdgePlayers(): Promise<void> {
  // Player A: canonical only, no steam_id → no parity rows
  await pool.query(
    "insert into canonical_players (id, display_name) values ($1, 'EdgeA'), ($2, 'EdgeB'), ($3, 'EdgeC')",
    [edgePlayerAId, edgePlayerBId, edgePlayerCId],
  );
  await pool.query(
    "insert into player_steam_ids (player_id, steam_id) values ($1, 'steam-edge-b'), ($2, 'steam-edge-c')",
    [edgePlayerBId, edgePlayerCId],
  );
  await pool.query(
    "insert into squads (id, name) values ($1, 'EdgeEmpty'), ($2, 'EdgeNoEvents'), ($3, 'EdgeTeamkill')",
    [edgeSquadEmptyId, edgeSquadNoEventsId, edgeSquadTeamkillId],
  );
  // edgeSquadNoEvents: members A+B but no parse events for them
  await pool.query(
    `insert into squad_memberships (squad_id, player_id, valid_from)
     values ($1, $2, '2026-05-01T00:00:00.000Z'), ($1, $3, '2026-05-01T00:00:00.000Z')`,
    [edgeSquadNoEventsId, edgePlayerAId, edgePlayerBId],
  );
  // edgeSquadTeamkill: members B+C with teamkill event
  await pool.query(
    `insert into squad_memberships (squad_id, player_id, valid_from)
     values ($1, $2, '2026-05-01T00:00:00.000Z'), ($1, $3, '2026-05-01T00:00:00.000Z')`,
    [edgeSquadTeamkillId, edgePlayerBId, edgePlayerCId],
  );
}

/**
 * Seed parser events for Player B:
 * - player_counter: kills=1, teamkills=1
 * - teamkill (victim edge-c-ref, weapon Pistol) → teamkilled/teamkillers path
 * - kill (victim edge-c-ref, weapon Knife) → B killed C
 *
 * Player C:
 * - player_counter: kills=0, teamkills=0
 * - kill (victim edge-b-ref) → C killed B → both B+C have killed each other
 *
 * This means in edgeSquadTeamkill.relationships:
 * - killed: B killed C (1×), C killed B (1×) → 2 entries, neither duplicated
 * - killers: C killed B (1×), B killed C (1×) → 2 entries
 * - teamkilled: B teamkilled C (1×) → exercises teamkilled map callback
 * - teamkillers: C (1× teamkilled by B) → exercises teamkillers map callback
 *
 * For count merge (line 1203): both B and C kill the same target Alpha (from
 * main fixtures) so `addToRelationshipMap` merges: B kills Alpha(1) + C kills
 * Alpha(1) → Alpha count=2.
 */
async function seedEdgeEvents(): Promise<void> {
  await pool.query(
    `insert into parse_jobs (id, replay_id, parser_contract_version, object_key, checksum, status)
     values ($1, $2, 'v1', 'raw/replay-edge.json', $3, 'succeeded')`,
    [edgeJobId, replayId, "c".repeat(64)],
  );
  await pool.query(
    `insert into parser_results (id, replay_id, parse_job_id, parser_contract_version, status, raw_snapshot)
     values ($1, $2, $3, 'v1', 'current', '{}'::jsonb)`,
    [edgeResultId, replayId, edgeJobId],
  );

  // Player B events
  await pool.query(
    `insert into parser_events (parser_result_id, event_type, occurred_at, observed_player_ref, payload, source_ref)
     values
       ($1, 'player_counter', '2026-05-02T13:00:00.000Z', 'edge-b-ref',
         '{"player":{"name":"EdgeB","steam_id":"steam-edge-b"},"kills":2,"kills_from_vehicle":0,"vehicle_kills":0,"teamkills":1,"deaths_total":1,"deaths_by_teamkills":1}'::jsonb,
         '{}'::jsonb),
       ($1, 'kill', '2026-05-02T13:01:00.000Z', 'edge-b-ref',
         '{"weapon_name":"Knife","victim_entity_id":"edge-c-ref"}'::jsonb, '{}'::jsonb),
       ($1, 'kill', '2026-05-02T13:02:00.000Z', 'edge-b-ref',
         '{"weapon_name":"Knife","victim_entity_id":"alpha-ref"}'::jsonb, '{}'::jsonb),
       ($1, 'teamkill', '2026-05-02T13:03:00.000Z', 'edge-b-ref',
         '{"weapon_name":"Pistol","victim_entity_id":"edge-c-ref"}'::jsonb, '{}'::jsonb)`,
    [edgeResultId],
  );

  // Player C events
  await pool.query(
    `insert into parser_events (parser_result_id, event_type, occurred_at, observed_player_ref, payload, source_ref)
     values
       ($1, 'player_counter', '2026-05-02T13:00:00.000Z', 'edge-c-ref',
         '{"player":{"name":"EdgeC","steam_id":"steam-edge-c"},"kills":1,"kills_from_vehicle":0,"vehicle_kills":0,"teamkills":0,"deaths_total":2,"deaths_by_teamkills":0}'::jsonb,
         '{}'::jsonb),
       ($1, 'kill', '2026-05-02T13:04:00.000Z', 'edge-c-ref',
         '{"weapon_name":"Rifle","victim_entity_id":"alpha-ref"}'::jsonb, '{}'::jsonb)`,
    [edgeResultId],
  );
  // Alpha player_counter in edgeResultId so alpha-ref resolves to playerAlphaId as a victim.
  // This enables count-merge: both B and C kill alpha-ref in the same result.
  await pool.query(
    `insert into parser_events (parser_result_id, event_type, occurred_at, observed_player_ref, payload, source_ref)
     values ($1, 'player_counter', '2026-05-02T13:00:00.000Z', 'alpha-ref',
       '{"player":{"name":"Alpha","steam_id":"steam-alpha"},"kills":0,"kills_from_vehicle":0,"vehicle_kills":0,"teamkills":0,"deaths_total":2,"deaths_by_teamkills":0}'::jsonb,
       '{}'::jsonb)`,
    [edgeResultId],
  );
}

describe("PgPublicStatsReadModel parity empty-branch coverage", () => {
  beforeEach(async () => {
    await seedEdgePlayers();
  });

  it("getPlayerWeapons returns empty when player exists but has no kill events", async () => {
    // Player A has no steam_id → parity weapon query returns 0 rows → empty branch (line 475)
    // Phase 16: provenance is included (null when no stat rows).
    await expect(
      readModel.getPlayerWeapons(edgePlayerAId),
    ).resolves.toMatchObject({
      firearms: [],
      vehicles: [],
    });
  });

  it("getPlayerRelationships returns empty when player exists but has no kill rows", async () => {
    // Player A has no steam_id → relationship query returns 0 rows → empty branch (line 527)
    // Phase 16: provenance is included (null when no stat rows).
    await expect(
      readModel.getPlayerRelationships(edgePlayerAId),
    ).resolves.toMatchObject({
      killed: [],
      killers: [],
      teamkilled: [],
      teamkillers: [],
    });
  });

  it("getPlayerWeekly returns empty when player exists but has no week rows", async () => {
    // Player A has no steam_id → week query returns 0 rows → empty branch (line 561)
    // Phase 16: provenance is included (null when no stat rows).
    await expect(
      readModel.getPlayerWeekly(edgePlayerAId),
    ).resolves.toMatchObject({
      weeks: [],
    });
  });

  it("getPlayerVehicles returns zeros/empty when player exists but has no stats or weapon events", async () => {
    // Player A has no steam_id → statsRow=undefined, weaponsEntry=undefined → zero branch (lines 499-502, 506)
    // Phase 16: provenance is included (null when no stat rows).
    await expect(
      readModel.getPlayerVehicles(edgePlayerAId),
    ).resolves.toMatchObject({
      killsFromVehicle: 0,
      killsFromVehicleCoef: 0,
      vehicleKills: 0,
      vehicles: [],
    });
  });

  it("getSquadWeapons returns empty payload when squad exists but has no members", async () => {
    // edgeSquadEmpty has no squad_memberships → members.length === 0 + squadExists = true (line 594)
    // Phase 16: provenance is included (null when no stat rows).
    await expect(
      readModel.getSquadWeapons(edgeSquadEmptyId),
    ).resolves.toMatchObject({
      firearms: [],
      vehicles: [],
    });
  });

  it("getSquadRelationships returns empty payload when squad exists but has no members", async () => {
    // edgeSquadEmpty: members.length === 0 + squadExists = true (line 629)
    // Phase 16: provenance is included (null when no stat rows).
    await expect(
      readModel.getSquadRelationships(edgeSquadEmptyId),
    ).resolves.toMatchObject({
      killed: [],
      killers: [],
      teamkilled: [],
      teamkillers: [],
    });
  });

  it("getSquadWeekly returns empty payload when squad exists but has no members", async () => {
    // edgeSquadEmpty: members.length === 0 + squadExists = true (line 673)
    // Phase 16: provenance is included (null when no stat rows).
    await expect(
      readModel.getSquadWeekly(edgeSquadEmptyId),
    ).resolves.toMatchObject({
      weeks: [],
    });
  });

  it("getSquadWeapons returns empty when members have no weapon events (line 605)", async () => {
    // edgeSquadNoEvents: members A+B exist but no parser_events → allRows=[] → entry=undefined
    // Phase 16: provenance is included.
    await expect(
      readModel.getSquadWeapons(edgeSquadNoEventsId),
    ).resolves.toMatchObject({ firearms: [], vehicles: [] });
  });

  it("getSquadWeekly returns empty when members have no week events (lines 683, 1216)", async () => {
    // edgeSquadNoEvents: members exist, mapWeeks([])=[], aggregateWeekEntries([])=undefined
    // Phase 16: provenance is included.
    await expect(
      readModel.getSquadWeekly(edgeSquadNoEventsId),
    ).resolves.toMatchObject({ weeks: [] });
  });
});

// ---------------------------------------------------------------------------
// Phase 16: slug backfill determinism + partial-unique index (T-16-17)
// ---------------------------------------------------------------------------

/**
 * Fixture names used to prove SQL slug_base() == TS slugify() byte-for-byte.
 * The list deliberately includes Latin-only, Cyrillic, and mixed/punctuation
 * names to cover all transliteration branches in both implementations.
 */
const SLUG_FIXTURE_NAMES = [
  "Alpha",
  "Alpha Squad",
  "Игрок Вася",
  "Rotation 1",
  "Bravo-Team",
  "Привет Мир",
  "Ещё Один Тест",
];

describe("Phase 16 slug_base() determinism — SQL == TS slugify()", () => {
  it.each(SLUG_FIXTURE_NAMES)(
    "slug_base(%s) matches slugify(%s)",
    async (name) => {
      const result = await pool.query<{ b: string }>(
        "select slug_base($1) as b",
        [name],
      );
      const sqlSlug = result.rows[0]?.b ?? null;
      const tsSlug = slugify(name);

      expect(sqlSlug).toBe(tsSlug);
    },
  );
});

describe("Phase 16 partial-unique index: duplicate non-null slug rejected, multiple nulls allowed", () => {
  // Use a sub-range of UUIDs that won't clash with main fixtures.
  const slugUniquePlayerA = "00000000-0000-4000-8000-000000002001",
    slugUniquePlayerB = "00000000-0000-4000-8000-000000002002",
    slugNullPlayerA = "00000000-0000-4000-8000-000000002003",
    slugNullPlayerB = "00000000-0000-4000-8000-000000002004";

  it("rejects inserting two canonical_players rows with the same non-null slug", async () => {
    await pool.query(
      "insert into canonical_players (id, display_name, slug) values ($1, 'SlugA', 'dup-slug')",
      [slugUniquePlayerA],
    );
    await expect(
      pool.query(
        "insert into canonical_players (id, display_name, slug) values ($1, 'SlugB', 'dup-slug')",
        [slugUniquePlayerB],
      ),
    ).rejects.toThrow(/unique/iu);
  });

  it("allows multiple canonical_players rows with null slug (partial index excludes nulls)", async () => {
    await pool.query(
      "insert into canonical_players (id, display_name, slug) values ($1, 'NullA', null)",
      [slugNullPlayerA],
    );
    await expect(
      pool.query(
        "insert into canonical_players (id, display_name, slug) values ($1, 'NullB', null)",
        [slugNullPlayerB],
      ),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 16: slug-or-UUID resolution integration (real-pg, real routes)
// ---------------------------------------------------------------------------

/**
 * Prove that getPlayer/getSquad/getRotation each resolve by UUID AND slug,
 * and return 404 (not 500) for an unknown slug.
 *
 * These use readModel directly (same transport as the route — repository layer).
 * The route-level 404 wiring is covered by the route unit tests.
 */
const slugResolutionPlayerId = "00000000-0000-4000-8000-000000003001",
  slugResolutionSquadId = "00000000-0000-4000-8000-000000003002",
  slugResolutionRotationId = "00000000-0000-4000-8000-000000003003";

describe("Phase 16 slug-or-UUID resolution (readModel, real-pg)", () => {
  beforeEach(async () => {
    await pool.query("delete from canonical_players where id = $1", [
      slugResolutionPlayerId,
    ]);
    await pool.query("delete from squads where id = $1", [
      slugResolutionSquadId,
    ]);
    await pool.query("delete from rotations where id = $1", [
      slugResolutionRotationId,
    ]);
    await pool.query(
      "insert into canonical_players (id, display_name, slug) values ($1, 'SlugPlayer', 'slug-player-test')",
      [slugResolutionPlayerId],
    );
    await pool.query(
      "insert into squads (id, name, slug) values ($1, 'Slug Squad', 'slug-squad-test')",
      [slugResolutionSquadId],
    );
    await pool.query(
      `insert into rotations (id, name, slug, starts_at, ends_at)
       values ($1, 'Slug Rotation', 'slug-rotation-test', '2026-01-01T00:00:00.000Z', null)`,
      [slugResolutionRotationId],
    );
  });

  it("getPlayer resolves by UUID → returns row with slug field", async () => {
    const result = await readModel.getPlayer(slugResolutionPlayerId, {});

    expect(result).not.toBeNull();
    expect(result?.id).toBe(slugResolutionPlayerId);
    expect(result?.slug).toBe("slug-player-test");
  });

  it("getPlayer resolves by slug → returns same row", async () => {
    const result = await readModel.getPlayer("slug-player-test", {});

    expect(result).not.toBeNull();
    expect(result?.id).toBe(slugResolutionPlayerId);
    expect(result?.slug).toBe("slug-player-test");
  });

  it("getPlayer returns null for unknown slug (not throw)", async () => {
    await expect(
      readModel.getPlayer("completely-unknown-slug-xyz", {}),
    ).resolves.toBeNull();
  });

  it("getSquad resolves by UUID → returns row with slug field", async () => {
    const result = await readModel.getSquad(slugResolutionSquadId, {});

    expect(result).not.toBeNull();
    expect(result?.id).toBe(slugResolutionSquadId);
    expect(result?.slug).toBe("slug-squad-test");
  });

  it("getSquad resolves by slug → returns same row", async () => {
    const result = await readModel.getSquad("slug-squad-test", {});

    expect(result).not.toBeNull();
    expect(result?.id).toBe(slugResolutionSquadId);
    expect(result?.slug).toBe("slug-squad-test");
  });

  it("getSquad returns null for unknown slug (not throw)", async () => {
    await expect(
      readModel.getSquad("completely-unknown-squad-slug-xyz", {}),
    ).resolves.toBeNull();
  });

  it("getRotation resolves by UUID → returns row with slug and provenance", async () => {
    const result = await readModel.getRotation(slugResolutionRotationId);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(slugResolutionRotationId);
    expect(result?.slug).toBe("slug-rotation-test");
    expect(result?.provenance).toBeDefined();
  });

  it("getRotation resolves by slug → returns same row", async () => {
    const result = await readModel.getRotation("slug-rotation-test");

    expect(result).not.toBeNull();
    expect(result?.id).toBe(slugResolutionRotationId);
  });

  it("getRotation returns null for unknown slug (not throw)", async () => {
    await expect(
      readModel.getRotation("completely-unknown-rotation-slug-xyz"),
    ).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 16: slug resolution on sub-resource & history routes (16-REVIEW F1)
// ---------------------------------------------------------------------------
//
// Regression guard for code-review Finding 1: every sub-resource/history
// read-model method must branch on looksLikeUuid (via resolvePlayerId/
// resolveSquadId) so a slug input is matched against the `slug` column instead
// of being passed to a `::uuid` cast (which threw 22P02 → 500). A known slug
// must resolve to a non-null payload; an unknown slug must yield null (404),
// never a thrown cast exception.

const subResourceSlugPlayerId = "00000000-0000-4000-8000-000000005001",
  subResourceSlugSquadId = "00000000-0000-4000-8000-000000005002";

describe("Phase 16 slug resolution on sub-resource & history methods (real-pg)", () => {
  beforeEach(async () => {
    await pool.query("delete from canonical_players where id = $1", [
      subResourceSlugPlayerId,
    ]);
    await pool.query("delete from squads where id = $1", [
      subResourceSlugSquadId,
    ]);
    await pool.query(
      "insert into canonical_players (id, display_name, slug) values ($1, 'SubResPlayer', 'sub-res-player')",
      [subResourceSlugPlayerId],
    );
    await pool.query(
      "insert into squads (id, name, slug) values ($1, 'SubRes Squad', 'sub-res-squad')",
      [subResourceSlugSquadId],
    );
  });

  it("player sub-resource & history methods resolve a known slug to a non-null payload", async () => {
    const [weapons, vehicles, relationships, weekly, names, memberships] =
      await Promise.all([
        readModel.getPlayerWeapons("sub-res-player"),
        readModel.getPlayerVehicles("sub-res-player"),
        readModel.getPlayerRelationships("sub-res-player"),
        readModel.getPlayerWeekly("sub-res-player"),
        readModel.getPlayerNameHistory("sub-res-player"),
        readModel.getPlayerMembershipHistory("sub-res-player"),
      ]);

    expect(weapons).not.toBeNull();
    expect(vehicles).not.toBeNull();
    expect(relationships).not.toBeNull();
    expect(weekly).not.toBeNull();
    expect(names).not.toBeNull();
    expect(memberships).not.toBeNull();
  });

  it("player sub-resource & history methods return null for an unknown slug (not throw 500)", async () => {
    const unknown = "no-such-player-slug-xyz";
    await Promise.all([
      expect(readModel.getPlayerWeapons(unknown)).resolves.toBeNull(),
      expect(readModel.getPlayerVehicles(unknown)).resolves.toBeNull(),
      expect(readModel.getPlayerRelationships(unknown)).resolves.toBeNull(),
      expect(readModel.getPlayerWeekly(unknown)).resolves.toBeNull(),
      expect(readModel.getPlayerNameHistory(unknown)).resolves.toBeNull(),
      expect(readModel.getPlayerMembershipHistory(unknown)).resolves.toBeNull(),
    ]);
  });

  it("squad sub-resource & history methods resolve a known slug to a non-null payload", async () => {
    const [weapons, relationships, weekly, memberships] = await Promise.all([
      readModel.getSquadWeapons("sub-res-squad"),
      readModel.getSquadRelationships("sub-res-squad"),
      readModel.getSquadWeekly("sub-res-squad"),
      readModel.getSquadMembershipHistory("sub-res-squad"),
    ]);

    expect(weapons).not.toBeNull();
    expect(relationships).not.toBeNull();
    expect(weekly).not.toBeNull();
    expect(memberships).not.toBeNull();
  });

  it("squad sub-resource & history methods return null for an unknown slug (not throw 500)", async () => {
    const unknown = "no-such-squad-slug-xyz";
    await Promise.all([
      expect(readModel.getSquadWeapons(unknown)).resolves.toBeNull(),
      expect(readModel.getSquadRelationships(unknown)).resolves.toBeNull(),
      expect(readModel.getSquadWeekly(unknown)).resolves.toBeNull(),
      expect(readModel.getSquadMembershipHistory(unknown)).resolves.toBeNull(),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Phase 16: history endpoints integration (real-pg) — HIST-01/02, T-16-16
// ---------------------------------------------------------------------------

const historyPlayerId = "00000000-0000-4000-8000-000000004001",
  historySquadId = "00000000-0000-4000-8000-000000004002",
  historySquadBId = "00000000-0000-4000-8000-000000004003",
  historyEmptyPlayerId = "00000000-0000-4000-8000-000000004099";

describe("Phase 16 history endpoints (real-pg)", () => {
  beforeEach(async () => {
    // Clean up history-specific rows
    for (const id of [historyPlayerId, historyEmptyPlayerId]) {
      await pool.query("delete from canonical_players where id = $1", [id]);
    }
    for (const id of [historySquadId, historySquadBId]) {
      await pool.query("delete from squads where id = $1", [id]);
    }

    // Seed players and squads
    await pool.query(
      `insert into canonical_players (id, display_name, slug) values
         ($1, 'HistPlayer', 'hist-player'),
         ($2, 'EmptyHistPlayer', 'empty-hist-player')`,
      [historyPlayerId, historyEmptyPlayerId],
    );
    await pool.query(
      `insert into squads (id, name, slug) values
         ($1, 'HistSquad', 'hist-squad'),
         ($2, 'HistSquadB', 'hist-squad-b')`,
      [historySquadId, historySquadBId],
    );

    // Seed two disjoint nickname windows + one open window for historyPlayerId.
    // Window A: from=null (unknown lower bound — exercises null ternary branch in repository)
    // Window B: from='2026-03-01' to='2026-04-01' (closed) — gap between A and B
    // Window C: from='2026-05-01' to=null (open — no trailing gap expected)
    // source_replay_id is a UUID FK column — use null (nullable) to avoid FK constraint.
    await pool.query(
      `insert into player_nicknames (player_id, nickname, observed_from, observed_to, source_replay_id)
       values
         ($1, 'NickA', null, '2026-02-01T00:00:00.000Z', null),
         ($1, 'NickB', '2026-03-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', null),
         ($1, 'NickC', '2026-05-01T00:00:00.000Z', null, null)`,
      [historyPlayerId],
    );

    // Seed membership for historyPlayerId in historySquadId
    // Window: from='2026-01-01' to='2026-03-01' (valid_from is NOT NULL per schema)
    await pool.query(
      `insert into squad_memberships (squad_id, player_id, valid_from, valid_to)
       values ($1, $2, '2026-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')`,
      [historySquadId, historyPlayerId],
    );

    // Seed membership for historySquadId (historyPlayerId member)
    // Same membership from squad perspective
  });

  it("getPlayerNameHistory returns entries ordered ascending with unknown-gap between disjoint windows and no trailing gap for open window", async () => {
    const result = await readModel.getPlayerNameHistory(historyPlayerId);

    expect(result).not.toBeNull();
    // Entries (NickA.from=null → no leading gap): alias(A), gap(Feb→Mar), alias(B), gap(Apr→May), alias(C, open)
    // NickC is open (to=null) → no trailing gap
    const entries = result?.entries ?? [];
    expect(entries.length).toBeGreaterThanOrEqual(3);

    // There must be at least one unknown-gap entry between the disjoint A and B windows
    const gapEntries = entries.filter((entry) => entry.kind === "unknown-gap");
    expect(gapEntries.length).toBeGreaterThanOrEqual(1);

    // Alias entries in ascending order
    const aliasEntries = entries.filter((entry) => entry.kind === "alias");
    expect(aliasEntries.length).toBe(3);

    // The last entry must be the open window (NickC, to=null) with kind='alias'
    const lastEntry = entries.at(-1);
    expect(lastEntry?.kind).toBe("alias");
    expect(lastEntry?.to).toBeNull();

    // No trailing unknown-gap after the open window
    const trailingEntry = entries.at(-1);
    expect(trailingEntry?.kind).not.toBe("unknown-gap");
  });

  it("getPlayerNameHistory: open window has to=null (not request-time)", async () => {
    const result = await readModel.getPlayerNameHistory(historyPlayerId);

    const openAlias = result?.entries.find(
      (entry) => entry.kind === "alias" && entry.to === null,
    );
    expect(openAlias).toBeDefined();
    expect(openAlias?.to).toBeNull();
  });

  it("getPlayerNameHistory provenance = max over seeded nickname timestamps (not now)", async () => {
    const result = await readModel.getPlayerNameHistory(historyPlayerId);

    expect(result).not.toBeNull();
    // Provenance must be non-null (we have seeded rows with timestamps)
    expect(result?.provenance.lastUpdatedAt).not.toBeNull();
    // Must be a valid ISO string
    expect(
      () => new Date(result?.provenance.lastUpdatedAt ?? ""),
    ).not.toThrow();
    // Must NOT be later than the test-start time plus a few seconds
    const provenanceMs = new Date(
      result?.provenance.lastUpdatedAt ?? 0,
    ).getTime();
    const testStart = Date.now() + 5000;
    expect(provenanceMs).toBeLessThan(testStart);
  });

  it("getPlayerNameHistory returns empty entries and null provenance for player with no nicknames", async () => {
    const result = await readModel.getPlayerNameHistory(historyEmptyPlayerId);

    expect(result).not.toBeNull();
    expect(result?.entries).toEqual([]);
    expect(result?.provenance.lastUpdatedAt).toBeNull();
  });

  it("getPlayerNameHistory returns null for unknown player (not throw)", async () => {
    await expect(
      readModel.getPlayerNameHistory("00000000-0000-4000-8000-000000009997"),
    ).resolves.toBeNull();
  });

  it("getPlayerMembershipHistory returns null for unknown player (not throw)", async () => {
    await expect(
      readModel.getPlayerMembershipHistory(
        "00000000-0000-4000-8000-000000009998",
      ),
    ).resolves.toBeNull();
  });

  it("getPlayerMembershipHistory returns membership entry with squad counterpart (id/slug/name), no Steam64", async () => {
    const result = await readModel.getPlayerMembershipHistory(historyPlayerId);

    expect(result).not.toBeNull();
    const membershipEntries =
      result?.entries.filter((entry) => entry.kind === "membership") ?? [];
    expect(membershipEntries.length).toBeGreaterThanOrEqual(1);

    // Counterpart must carry id, slug, name — no steam_id
    const [firstMembership] = membershipEntries;
    expect(firstMembership?.kind).toBe("membership");
    if (firstMembership?.kind === "membership") {
      expect(firstMembership.squad.id).toBe(historySquadId);
      expect(firstMembership.squad.slug).toBeDefined();
      expect(firstMembership.squad.name).toBe("HistSquad");
      // No Steam64-style field in counterpart
      expect(JSON.stringify(firstMembership.squad)).not.toMatch(
        /7656119\d{10}/u,
      );
    }
  });

  it("getPlayerMembershipHistory returns empty entries and null provenance for player with no memberships", async () => {
    const result =
      await readModel.getPlayerMembershipHistory(historyEmptyPlayerId);

    expect(result).not.toBeNull();
    expect(result?.entries).toEqual([]);
    expect(result?.provenance.lastUpdatedAt).toBeNull();
  });

  it("getSquadMembershipHistory returns membership entry with player counterpart (id/slug/displayName), no Steam64", async () => {
    const result = await readModel.getSquadMembershipHistory(historySquadId);

    expect(result).not.toBeNull();
    const membershipEntries =
      result?.entries.filter((entry) => entry.kind === "membership") ?? [];
    expect(membershipEntries.length).toBeGreaterThanOrEqual(1);

    const [firstMembership] = membershipEntries;
    expect(firstMembership?.kind).toBe("membership");
    if (firstMembership?.kind === "membership") {
      expect(firstMembership.player.id).toBe(historyPlayerId);
      expect(firstMembership.player.slug).toBeDefined();
      expect(firstMembership.player.displayName).toBe("HistPlayer");
      // No Steam64-style field in counterpart
      expect(JSON.stringify(firstMembership.player)).not.toMatch(
        /7656119\d{10}/u,
      );
    }
  });

  it("getSquadMembershipHistory returns null for unknown squad (not throw)", async () => {
    await expect(
      readModel.getSquadMembershipHistory(
        "00000000-0000-4000-8000-000000009996",
      ),
    ).resolves.toBeNull();
  });
});

describe("PgPublicStatsReadModel parity teamkill + count-merge coverage", () => {
  beforeEach(async () => {
    await seedEdgePlayers();
    await seedEdgeEvents();
  });

  it("getPlayerRelationships includes teamkilled/teamkillers callbacks for player with teamkill data", async () => {
    // Player B has a teamkill event against C → teamkilled=[C:1] (exercises map callback at line 538)
    const result = await readModel.getPlayerRelationships(edgePlayerBId);

    expect(result).not.toBeNull();
    // B killed C (1×Knife) → killed includes C
    expect(
      result?.killed.some(
        (relationship) => relationship.player.displayName === "EdgeC",
      ),
    ).toBe(true);
    // B teamkilled C (1×) → teamkilled = [{C,1}] (exercises map callback at line 538)
    expect(
      result?.teamkilled.some(
        (relationship) => relationship.player.displayName === "EdgeC",
      ),
    ).toBe(true);
  });

  it("getPlayerRelationships teamkillers map callback fires for victim of a teamkill (line 542)", async () => {
    // C was teamkilled by B → C's teamkillers = [{B,1}] (exercises map callback at line 542)
    const result = await readModel.getPlayerRelationships(edgePlayerCId);

    expect(result).not.toBeNull();
    // C's teamkillers must include B
    expect(
      result?.teamkillers.some(
        (relationship) => relationship.player.displayName === "EdgeB",
      ),
    ).toBe(true);
  });

  it("getSquadRelationships includes teamkilled/teamkillers when members have teamkill events (lines 648, 654)", async () => {
    // edgeSquadTeamkill: B+C; B teamkilled C → squad teamkilled=[C:1], teamkillers=[C (as victim of B):1]
    const result = await readModel.getSquadRelationships(edgeSquadTeamkillId);

    expect(result).not.toBeNull();
    // B teamkilled C → teamkilled entry exists (exercises map callback at line 648)
    expect(result?.teamkilled.length).toBeGreaterThan(0);
    // C was teamkilled by B → teamkillers entry exists (exercises map callback at line 654)
    expect(result?.teamkillers.length).toBeGreaterThan(0);
  });

  it("aggregateRelationshipEntries merges counts when two members killed the same target (line 1203)", async () => {
    // Both B and C killed alpha-ref (playerAlphaId) in their events.
    // Squad killed list: B→{EdgeC:1, Alpha:1}, C→{Alpha:1}
    // Alpha appears twice → addToRelationshipMap merges: count = 1 + 1 = 2 (line 1203)
    const result = await readModel.getSquadRelationships(edgeSquadTeamkillId);

    expect(result).not.toBeNull();
    // Alpha was killed by both B and C → merged count >= 2
    const alphaEntry = result?.killed.find(
      (relationship) => relationship.player.id === playerAlphaId,
    );
    expect(alphaEntry).toBeDefined();
    expect(alphaEntry?.count).toBe(2);
  });
});
