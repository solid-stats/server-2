import type { NormalizedParserEvent } from "./parser-artifact.js";
import type { Pool, PoolClient } from "pg";

export class PgStatisticsRepository {
  public constructor(private readonly pool: Pool) {}

  public async replaceParserEvents(
    parserResultId: string,
    events: NormalizedParserEvent[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await replaceParserEventsInTransaction(client, parserResultId, events);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function replaceParserEventsInTransaction(
  client: PoolClient,
  parserResultId: string,
  events: NormalizedParserEvent[],
): Promise<void> {
  await client.query("delete from parser_events where parser_result_id = $1", [
    parserResultId,
  ]);

  for (const event of events) {
    await client.query(
      `
        insert into parser_events (
          parser_result_id, event_type, observed_player_ref, payload, source_ref
        )
        values ($1, $2, $3, $4, $5)
      `,
      [
        parserResultId,
        event.eventType,
        event.observedPlayerRef,
        event.payload,
        event.sourceRef,
      ],
    );
  }
}
