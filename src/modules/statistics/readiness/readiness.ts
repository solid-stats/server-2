/* eslint-disable max-lines */
const REPORT_VERSION = 1;

export interface RotationRangeEvidence {
  endsAt: string | null;
  id: string;
  name: string;
  replayCount: number;
  startsAt: string;
}

export interface ReplayRotationEvidence {
  matchedRotationIds: string[];
  replayId: string;
  replayTimestamp: string | null;
  rotationMatchCount: number;
  sourceReplayId: string;
  sourceSystem: string;
}

export interface ParserIdentityPlayerEvidence {
  entityRef: string;
  observedName: string;
  steamId?: string;
}

export interface ParserResultIdentityEvidence {
  parserResultId: string;
  players: ParserIdentityPlayerEvidence[];
  replayId: string;
  replayTimestamp: string | null;
  sourceReplayId: string;
  sourceSystem: string;
}

export interface IdentityReference {
  displayName: string;
  nickname?: string;
  observedFrom: string | null;
  observedTo: string | null;
  playerId: string;
}

export interface StatisticsReadinessRepository {
  getCurrentParserIdentityEvidence(): Promise<ParserResultIdentityEvidence[]>;
  getIdentityReferences(): Promise<IdentityReference[]>;
  getReplayRotationEvidence(): Promise<ReplayRotationEvidence[]>;
  getRotationRanges(): Promise<RotationRangeEvidence[]>;
}

export interface ReadinessReplayItem {
  matchedRotationIds: string[];
  replayId: string;
  replayTimestamp: string | null;
  rotationMatchCount: number;
  sourceReplayId: string;
  sourceSystem: string;
}

export type IdentityResolutionStatus =
  | "ambiguous"
  | "nickname_history"
  | "provisional_observed_name"
  | "unresolved";

export interface NoSteamIdentityItem {
  entityRef: string;
  matchedPlayerIds: string[];
  observedName: string;
  parserResultId: string;
  reasonCode?: "ambiguous_observed_name" | "blank_observed_name";
  replayId: string;
  replayTimestamp: string | null;
  resolutionStatus: IdentityResolutionStatus;
  sourceReplayId: string;
  sourceSystem: string;
}

export interface NicknameConflictItem {
  nickname: string;
  playerIds: string[];
}

export interface StatisticsReadinessSummary {
  ambiguousObservedNameCount: number;
  exactRotationReplayCount: number;
  missingReplayTimestampCount: number;
  missingRotationReplayCount: number;
  nicknameConflictCount: number;
  nicknameHistoryResolvedCount: number;
  noSteamPlayerCount: number;
  overlappingRotationReplayCount: number;
  provisionalObservedNameCount: number;
  replayCount: number;
  rotationCount: number;
  unresolvedObservedNameCount: number;
}

export interface StatisticsReadinessReport {
  generatedAt: string;
  identity: {
    nicknameConflicts: NicknameConflictItem[];
    noSteamPlayers: NoSteamIdentityItem[];
    unresolvedObservedNicknames: NoSteamIdentityItem[];
  };
  reportVersion: number;
  rotation: {
    missingReplayTimestampReplays: ReadinessReplayItem[];
    missingRotationReplays: ReadinessReplayItem[];
    overlappingRotationReplays: ReadinessReplayItem[];
    ranges: RotationRangeEvidence[];
  };
  summary: StatisticsReadinessSummary;
}

export class StatisticsReadinessService {
  public constructor(
    private readonly repository: StatisticsReadinessRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async report(): Promise<StatisticsReadinessReport> {
    const [ranges, replays, parserResults, references] = await Promise.all([
        this.repository.getRotationRanges(),
        this.repository.getReplayRotationEvidence(),
        this.repository.getCurrentParserIdentityEvidence(),
        this.repository.getIdentityReferences(),
      ]),
      noSteamPlayers = classifyNoSteamPlayers(parserResults, references),
      nicknameConflicts = nicknameConflictItems(references),
      missingReplayTimestampReplays = replays.filter(
        (replay) => replay.replayTimestamp === null,
      ),
      missingRotationReplays = replays.filter(
        (replay) =>
          replay.replayTimestamp !== null && replay.rotationMatchCount === 0,
      ),
      overlappingRotationReplays = replays.filter(
        (replay) => replay.rotationMatchCount > 1,
      );

    return {
      generatedAt: this.now().toISOString(),
      identity: {
        nicknameConflicts,
        noSteamPlayers,
        unresolvedObservedNicknames: noSteamPlayers.filter(
          (player) => player.resolutionStatus === "unresolved",
        ),
      },
      reportVersion: REPORT_VERSION,
      rotation: {
        missingReplayTimestampReplays: missingReplayTimestampReplays.map(
          (replay) => replayItem(replay),
        ),
        missingRotationReplays: missingRotationReplays.map((replay) =>
          replayItem(replay),
        ),
        overlappingRotationReplays: overlappingRotationReplays.map((replay) =>
          replayItem(replay),
        ),
        ranges,
      },
      summary: summary({
        missingReplayTimestampReplays,
        missingRotationReplays,
        nicknameConflicts,
        noSteamPlayers,
        overlappingRotationReplays,
        ranges,
        replays,
      }),
    };
  }
}

function replayItem(replay: ReplayRotationEvidence): ReadinessReplayItem {
  return {
    matchedRotationIds: replay.matchedRotationIds,
    replayId: replay.replayId,
    replayTimestamp: replay.replayTimestamp,
    rotationMatchCount: replay.rotationMatchCount,
    sourceReplayId: replay.sourceReplayId,
    sourceSystem: replay.sourceSystem,
  };
}

function classifyNoSteamPlayers(
  parserResults: ParserResultIdentityEvidence[],
  references: IdentityReference[],
): NoSteamIdentityItem[] {
  return parserResults.flatMap((parserResult) =>
    parserResult.players
      .filter((player) => player.steamId === undefined)
      .map((player) => classifyNoSteamPlayer(parserResult, player, references)),
  );
}

function classifyNoSteamPlayer(
  parserResult: ParserResultIdentityEvidence,
  player: ParserIdentityPlayerEvidence,
  references: IdentityReference[],
): NoSteamIdentityItem {
  const observedName = player.observedName.trim();
  if (observedName.length === 0) {
    return identityItem(parserResult, player, {
      matchedPlayerIds: [],
      reasonCode: "blank_observed_name",
      resolutionStatus: "unresolved",
    });
  }

  const matches = matchingIdentityReferences(
      references,
      observedName,
      parserResult.replayTimestamp,
    ),
    matchedPlayerIds = uniquePlayerIds(matches);
  if (matchedPlayerIds.length > 1) {
    return identityItem(parserResult, player, {
      matchedPlayerIds,
      reasonCode: "ambiguous_observed_name",
      resolutionStatus: "ambiguous",
    });
  }

  const resolutionStatus = matches.some(
    (reference) => reference.nickname !== undefined,
  )
    ? "nickname_history"
    : "provisional_observed_name";
  return identityItem(parserResult, player, {
    matchedPlayerIds,
    resolutionStatus,
  });
}

function matchingIdentityReferences(
  references: IdentityReference[],
  observedName: string,
  replayTimestamp: string | null,
): IdentityReference[] {
  const normalizedName = observedName.toLowerCase();
  return references.filter((reference) => {
    if (reference.nickname !== undefined) {
      return (
        reference.nickname.toLowerCase() === normalizedName &&
        isReferenceActive(reference, replayTimestamp)
      );
    }
    return reference.displayName.toLowerCase() === normalizedName;
  });
}

function isReferenceActive(
  reference: IdentityReference,
  replayTimestamp: string | null,
): boolean {
  if (replayTimestamp === null) {
    return true;
  }
  return (
    (reference.observedFrom === null ||
      reference.observedFrom <= replayTimestamp) &&
    (reference.observedTo === null || reference.observedTo >= replayTimestamp)
  );
}

function identityItem(
  parserResult: ParserResultIdentityEvidence,
  player: ParserIdentityPlayerEvidence,
  resolution: {
    matchedPlayerIds: string[];
    reasonCode?: NoSteamIdentityItem["reasonCode"];
    resolutionStatus: IdentityResolutionStatus;
  },
): NoSteamIdentityItem {
  return {
    entityRef: player.entityRef,
    matchedPlayerIds: resolution.matchedPlayerIds,
    observedName: player.observedName,
    parserResultId: parserResult.parserResultId,
    ...(resolution.reasonCode === undefined
      ? {}
      : { reasonCode: resolution.reasonCode }),
    replayId: parserResult.replayId,
    replayTimestamp: parserResult.replayTimestamp,
    resolutionStatus: resolution.resolutionStatus,
    sourceReplayId: parserResult.sourceReplayId,
    sourceSystem: parserResult.sourceSystem,
  };
}

function nicknameConflictItems(
  references: IdentityReference[],
): NicknameConflictItem[] {
  const nicknameRows = references.filter(
      (reference): reference is IdentityReference & { nickname: string } =>
        reference.nickname !== undefined,
    ),
    conflicts = new Map<string, Set<string>>();

  for (const left of nicknameRows) {
    for (const right of nicknameRows) {
      if (
        left.playerId !== right.playerId &&
        left.nickname.toLowerCase() === right.nickname.toLowerCase() &&
        windowsOverlap(left, right)
      ) {
        const key = left.nickname.toLowerCase(),
          playerIds = conflicts.get(key) ?? new Set<string>();
        playerIds.add(left.playerId);
        playerIds.add(right.playerId);
        conflicts.set(key, playerIds);
      }
    }
  }

  return [...conflicts.entries()]
    .map(([nickname, playerIds]) => ({
      nickname,
      playerIds: [...playerIds].toSorted(),
    }))
    .toSorted((left, right) => left.nickname.localeCompare(right.nickname));
}

function windowsOverlap(
  left: Pick<IdentityReference, "observedFrom" | "observedTo">,
  right: Pick<IdentityReference, "observedFrom" | "observedTo">,
): boolean {
  const leftStart = left.observedFrom ?? "",
    leftEnd = left.observedTo ?? "9999-12-31T23:59:59.999Z",
    rightStart = right.observedFrom ?? "",
    rightEnd = right.observedTo ?? "9999-12-31T23:59:59.999Z";
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function uniquePlayerIds(references: IdentityReference[]): string[] {
  return [
    ...new Set(references.map((reference) => reference.playerId)),
  ].toSorted();
}

function summary(input: {
  missingReplayTimestampReplays: ReplayRotationEvidence[];
  missingRotationReplays: ReplayRotationEvidence[];
  nicknameConflicts: NicknameConflictItem[];
  noSteamPlayers: NoSteamIdentityItem[];
  overlappingRotationReplays: ReplayRotationEvidence[];
  ranges: RotationRangeEvidence[];
  replays: ReplayRotationEvidence[];
}): StatisticsReadinessSummary {
  return {
    ambiguousObservedNameCount: input.noSteamPlayers.filter(
      (player) => player.resolutionStatus === "ambiguous",
    ).length,
    exactRotationReplayCount: input.replays.filter(
      (replay) => replay.rotationMatchCount === 1,
    ).length,
    missingReplayTimestampCount: input.missingReplayTimestampReplays.length,
    missingRotationReplayCount: input.missingRotationReplays.length,
    nicknameConflictCount: input.nicknameConflicts.length,
    nicknameHistoryResolvedCount: input.noSteamPlayers.filter(
      (player) => player.resolutionStatus === "nickname_history",
    ).length,
    noSteamPlayerCount: input.noSteamPlayers.length,
    overlappingRotationReplayCount: input.overlappingRotationReplays.length,
    provisionalObservedNameCount: input.noSteamPlayers.filter(
      (player) => player.resolutionStatus === "provisional_observed_name",
    ).length,
    replayCount: input.replays.length,
    rotationCount: input.ranges.length,
    unresolvedObservedNameCount: input.noSteamPlayers.filter(
      (player) => player.resolutionStatus === "unresolved",
    ).length,
  };
}
