import { describe, expect, it } from "vitest";

import { PgStatisticsRepository } from "./repository.js";

import type { Pool, PoolClient } from "pg";

class FailingClient {
  public readonly queries: string[] = [];

  public released = false;

  public query(sql: string): Promise<unknown> {
    const normalizedSql = sql.trim();
    this.queries.push(normalizedSql);
    if (normalizedSql.startsWith("insert into parser_events")) {
      return Promise.reject(new Error("insert failed"));
    }
    return Promise.resolve({});
  }

  public release(): void {
    this.released = true;
  }
}

describe("PgStatisticsRepository", () => {
  it("rolls back and releases the client when event replacement fails", async () => {
    const client = new FailingClient(),
      pool = {
        connect: () => Promise.resolve(client as unknown as PoolClient),
      } as unknown as Pool,
      repository = new PgStatisticsRepository(pool);

    await expect(
      repository.replaceParserEvents("result-1", [
        {
          eventType: "kill",
          observedPlayerRef: "101",
          payload: {},
          sourceRef: {},
        },
      ]),
    ).rejects.toThrow("insert failed");

    expect(client.queries).toEqual([
      "begin",
      "delete from parser_events where parser_result_id = $1",
      "insert into parser_events (\n          parser_result_id, event_type, observed_player_ref, payload, source_ref\n        )\n        values ($1, $2, $3, $4, $5)",
      "rollback",
    ]);
    expect(client.released).toBe(true);
  });
});
