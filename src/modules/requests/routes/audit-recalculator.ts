/* eslint-disable max-classes-per-file, unicorn/no-null */
import type {
  AuditPatchRecalculator,
  CreateAuditPatchInput,
} from "./models.js";
import type { PgStatisticsRepository } from "../../statistics/repository/repository.js";
import type { Pool } from "pg";

export class NoopAuditPatchRecalculator implements AuditPatchRecalculator {
  public readonly status = "recalculated";

  public async recalculateForPatch(input: CreateAuditPatchInput): Promise<{
    status: string;
  }> {
    void input;
    return { status: this.status };
  }
}

export class PgAuditPatchRecalculator implements AuditPatchRecalculator {
  public constructor(
    private readonly pool: Pool,
    private readonly statistics: PgStatisticsRepository,
  ) {}

  public async recalculateForPatch(input: CreateAuditPatchInput): Promise<{
    status: string;
  }> {
    const parserResultId = await this.parserResultId(input);
    if (parserResultId === null) {
      return { status: "no_parser_result_target" };
    }
    const playerAndSquad =
        await this.statistics.recalculatePlayerAndSquadStatsForParserResult(
          parserResultId,
        ),
      commander =
        await this.statistics.recalculateCommanderSideStatsForParserResult(
          parserResultId,
        ),
      bounty =
        await this.statistics.recalculateBountyPointsForParserResult(
          parserResultId,
        );
    return {
      status: [playerAndSquad.status, commander.status, bounty.status].join(
        ",",
      ),
    };
  }

  private async parserResultId(
    input: CreateAuditPatchInput,
  ): Promise<string | null> {
    if (input.affectedEntityId === undefined) {
      return null;
    }
    if (input.affectedEntityType === "parser_result") {
      return input.affectedEntityId;
    }
    if (input.affectedEntityType !== "replay") {
      return null;
    }
    const result = await this.pool.query<{ id: string }>(
      `
        select id::text
        from parser_results
        where replay_id = $1 and status = 'current'
        order by created_at desc, id desc
        limit 1
      `,
      [input.affectedEntityId],
    );
    const [row] = result.rows;
    return row === undefined ? null : row.id;
  }
}
