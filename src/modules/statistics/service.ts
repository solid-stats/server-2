import {
  mapParserArtifact,
  type NormalizedParserEvent,
  type ParserArtifact,
} from "./parser-artifact.js";

export interface StatisticsRepository {
  replaceParserEvents(
    parserResultId: string,
    events: NormalizedParserEvent[],
  ): Promise<void>;
}

export class ParserArtifactPersistenceService {
  public constructor(private readonly repository: StatisticsRepository) {}

  public async persistParserArtifact(
    parserResultId: string,
    artifact: ParserArtifact,
  ): Promise<number> {
    const mapped = mapParserArtifact(artifact);
    await this.repository.replaceParserEvents(parserResultId, mapped.events);
    return mapped.events.length;
  }
}
