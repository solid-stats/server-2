/* eslint-disable */
/**
 * Instrumentation reproduction for the deaths under-count (260615-f13b).
 *
 * Runs the REAL server-2 aggregation/identity code (`buildPlayerIdentityIndex`,
 * `bestPlayerIdentityIndexed`, `playerIdentityMatchPriority`,
 * `calculatePlayerAndSquadAggregates`) against REAL staging rows exported to
 * `replays.json` / `identities-zero.json`, and logs, per replay, the exact
 * decision that drops (or credits) Zero's death.
 *
 * It reconstructs the repository's `aggregateInputsFromRows` pipeline:
 *   events  := parser_events rows (parserEventFromRow)         <- the STALE source
 *   players := resolvedPlayers(raw_snapshot, identityIndex)    <- raw_snapshot
 * exactly as `repository.ts` does, then feeds the result to the service.
 *
 * Run: pnpm tsx .planning/quick/260615-f13b-deaths-undercount/instrument.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildPlayerIdentityIndex,
  bestPlayerIdentityIndexed,
  type PlayerIdentityRow,
} from "../../../src/modules/statistics/repository/repository.js";
import {
  artifactCounterDeaths,
  calculatePlayerAndSquadAggregates,
  type AggregatePlayerEvidence,
  type AggregateReplayInput,
} from "../../../src/modules/statistics/service/service.js";
import type {
  NormalizedParserEvent,
  ParserArtifact,
} from "../../../src/modules/statistics/parser-artifact.js";

const here = dirname(fileURLToPath(import.meta.url));

type RawEventRow = {
  event_type: string;
  observed_player_ref: string | null;
  payload: Record<string, unknown>;
  source_ref: Record<string, unknown>;
};
type RawReplay = {
  prid: string;
  rid: string;
  ts: string;
  raw_snapshot: ParserArtifact;
  events: RawEventRow[];
};

const replays: RawReplay[] = JSON.parse(
  readFileSync(join(here, "replays.json"), "utf8"),
).replays;
const identityRows: PlayerIdentityRow[] = JSON.parse(
  readFileSync(join(here, "identities-zero.json"), "utf8"),
).map((r: any) => ({
  display_name: r.display_name,
  nickname: r.nickname,
  nickname_observed_from:
    r.nickname_observed_from === null ? null : new Date(r.nickname_observed_from),
  nickname_observed_to:
    r.nickname_observed_to === null ? null : new Date(r.nickname_observed_to),
  player_id: r.player_id,
  steam_id: r.steam_id,
}));

const ZERO_ID = "000a2ac8-443d-434c-9d30-ea8613c4c0ed";

// Mirror repository.ts parserEventFromRow (the DB -> NormalizedParserEvent map).
function parserEventFromRow(row: RawEventRow): NormalizedParserEvent | undefined {
  if (row.event_type === "diagnostic")
    return { eventType: "diagnostic", observedPlayerRef: null, payload: row.payload, sourceRef: row.source_ref };
  if (row.event_type === "destroyed_vehicle")
    return { eventType: "destroyed_vehicle", observedPlayerRef: row.observed_player_ref, payload: row.payload, sourceRef: row.source_ref };
  if (row.event_type === "player_counter") {
    if (row.observed_player_ref === null) return undefined;
    return { eventType: "player_counter", observedPlayerRef: row.observed_player_ref, payload: row.payload, sourceRef: row.source_ref };
  }
  if (row.event_type === "kill" || row.event_type === "teamkill" || row.event_type === "unknown_kill") {
    if (row.observed_player_ref === null) return undefined;
    return { eventType: row.event_type, observedPlayerRef: row.observed_player_ref, payload: row.payload, sourceRef: row.source_ref };
  }
  return undefined;
}

const identityIndex = buildPlayerIdentityIndex(identityRows);

let creditedTotal = 0;
console.log("rid_date            | resolved | eid | counterEvtForEid | victimKillForEid | deathCredited | branch");
console.log("-".repeat(120));

for (const replay of replays) {
  const ts = new Date(replay.ts);
  const players = (replay.raw_snapshot.players ?? []).flatMap((p): AggregatePlayerEvidence[] => {
    const id = bestPlayerIdentityIndexed(identityIndex, p, ts);
    if (id === undefined) return [];
    // Mirror the patched resolvedPlayers: carry the artifact's own d/td counter.
    const counterDeaths = artifactCounterDeaths(p.d, p.td);
    return [{ entityRef: String(p.eid), playerId: id.player_id, ...(counterDeaths === undefined ? {} : { counterDeaths }) }];
  });
  const events = replay.events.flatMap((r) => {
    const e = parserEventFromRow(r);
    return e === undefined ? [] : [e];
  });

  const input: AggregateReplayInput = { events, players, replayId: replay.rid };
  const result = calculatePlayerAndSquadAggregates([input]);
  const zero = result.playerStats.find((row) => row.playerId === ZERO_ID);

  const zeroArtifact = (replay.raw_snapshot.players ?? []).find((p) => p.n.toLowerCase() === "zero");
  const zeroEid = zeroArtifact === undefined ? "?" : String(zeroArtifact.eid);
  const resolvedZero = players.some((p) => p.playerId === ZERO_ID);
  const counterForEid = events.some((e) => e.eventType === "player_counter" && e.observedPlayerRef === zeroEid && Number(e.payload["deaths_total"] ?? 0) > 0);
  const victimForEid = events.some((e) => (e.eventType === "kill" || e.eventType === "teamkill" || e.eventType === "unknown_kill") && Number(e.payload["victim_entity_id"]) === Number(zeroEid));
  const deaths = zero?.stats.deaths.total ?? 0;
  creditedTotal += deaths;

  const branch = !resolvedZero
    ? "identity-unresolved (game also lost)"
    : deaths > 0
      ? counterForEid
        ? "death via COUNTER event path"
        : victimForEid
          ? "death via VICTIM kill-row path"
          : "death via ARTIFACT counter (fixed: no event, no victim)"
      : "DROPPED: resolved+game-counted, but no counter event AND no victim kill-row";

  console.log(
    `${replay.ts.slice(0, 10)}          | ${resolvedZero ? "yes" : "NO "}      | ${zeroEid.padStart(3)} | ${String(counterForEid).padEnd(5)}            | ${String(victimForEid).padEnd(5)}            | ${String(deaths).padEnd(4)}          | ${branch}`,
  );
}

console.log("-".repeat(120));
console.log(`Zero deaths credited across these ${replays.length} replays: ${creditedTotal} (each replay has d>0 in the artifact).`);
console.log(`Per-replay artifact death signal present in ALL ${replays.length}; credited only ${creditedTotal} => ${replays.length - creditedTotal} dropped here.`);
