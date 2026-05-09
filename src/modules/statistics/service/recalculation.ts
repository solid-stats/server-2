import {
  ParserArtifactPersistenceService,
  type StatisticsRepository,
} from "./service.js";

import type { ParserArtifact } from "../parser-artifact.js";

export interface StatisticsRecalculationRepository extends StatisticsRepository {
  recalculateBountyPointsForParserResult(
    parserResultId: string,
  ): Promise<ScopedRecalculationResult & { bountyRows: number }>;
  recalculateCommanderSideStatsForParserResult(
    parserResultId: string,
  ): Promise<ScopedRecalculationResult & { commanderStats: number }>;
  recalculatePlayerAndSquadStatsForParserResult(
    parserResultId: string,
  ): Promise<
    ScopedRecalculationResult & {
      playerStats: number;
      squadStats: number;
    }
  >;
}

export interface ScopedRecalculationResult {
  rotationId: string | null;
  status: "recalculated" | "missing_replay_timestamp" | "missing_rotation";
}

export interface ParserResultRecalculationSummary {
  bountyRows: number;
  commanderStats: number;
  normalizedEvents: number;
  playerStats: number;
  rotationId: string | null;
  squadStats: number;
  status: ScopedRecalculationResult["status"];
}

export class ParserResultRecalculationService {
  public constructor(
    private readonly repository: StatisticsRecalculationRepository,
  ) {}

  public async recalculateParserResult(
    parserResultId: string,
    artifact: ParserArtifact,
  ): Promise<ParserResultRecalculationSummary> {
    const persistence = new ParserArtifactPersistenceService(this.repository),
      normalizedEvents = await persistence.persistParserArtifact(
        parserResultId,
        artifact,
      ),
      playerAndSquad =
        await this.repository.recalculatePlayerAndSquadStatsForParserResult(
          parserResultId,
        ),
      commander =
        await this.repository.recalculateCommanderSideStatsForParserResult(
          parserResultId,
        ),
      bounty =
        await this.repository.recalculateBountyPointsForParserResult(
          parserResultId,
        );

    return {
      bountyRows: bounty.bountyRows,
      commanderStats: commander.commanderStats,
      normalizedEvents,
      playerStats: playerAndSquad.playerStats,
      rotationId: playerAndSquad.rotationId,
      squadStats: playerAndSquad.squadStats,
      status: playerAndSquad.status,
    };
  }
}
