/* eslint-disable unicorn/no-null */
// Derive a replay timestamp from a source replay id when the primary date source is absent.
//
// Early sg/mace replays carry no primary `replayTimestamp`, but their `source_replay_id` is the
// sg.zone id — a Unix epoch (seconds) suffix, e.g. `sg-zone-1624129684` -> 2021-06-19. This is a
// FALLBACK only: it is applied when the primary source is missing, never to replace a value that
// is already present. The non-null replays got their timestamp from a different (non-epoch)
// source that the early ones lacked.

// The epoch is the trailing run of digits in the id. Require at least 9 digits so a stray short
// numeric suffix can never be mistaken for an epoch, then bound the parsed value to a plausible
// Unix-seconds range so an over-long digit run (which the greedy capture would otherwise read as a
// far-future or overflowing epoch) is rejected instead of producing garbage. The SAME bound is
// applied in migration 0011 so backfilled and newly-promoted replays agree exactly.
//
// minEpochSeconds = 1e9 (2001-09) .. maxEpochSeconds = 2e9 (2033-05) covers every real 10-digit
// sg.zone id (e.g. 1624129684 -> 2021-06-19) and rejects 9-digit (< 1e9, pre-2001) and >= 13-digit
// (> 2e9, far-future / int8-overflow) runs alike.
const minEpochDigits = 9,
  minEpochSeconds = 1_000_000_000,
  maxEpochSeconds = 2_000_000_000,
  millisPerSecond = 1000,
  trailingEpochPattern = new RegExp(
    String.raw`(?<epoch>\d{${String(minEpochDigits)},})$`,
    "u",
  );

/**
 * Parse the Unix-epoch (seconds) suffix of a `source_replay_id` into an ISO-8601 timestamp.
 *
 * Returns `null` when the id has no trailing run of at least {@link minEpochDigits} digits, when
 * the parsed epoch falls outside the plausible {@link minEpochSeconds}..{@link maxEpochSeconds}
 * range, or when it does not yield a valid date. Pure and deterministic.
 */
export function deriveReplayTimestampFromSourceId(
  sourceReplayId: string,
): string | null {
  const match = trailingEpochPattern.exec(sourceReplayId);
  const epochDigits = match?.groups?.["epoch"];
  if (epochDigits === undefined) {
    return null;
  }
  const epochSeconds = Number(epochDigits);
  if (epochSeconds < minEpochSeconds || epochSeconds > maxEpochSeconds) {
    return null;
  }
  const date = new Date(epochSeconds * millisPerSecond);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

/**
 * Resolve the effective replay timestamp for a promoted replay: keep the primary timestamp when
 * present, otherwise fall back to the epoch encoded in the source replay id.
 */
export function resolveReplayTimestamp(input: {
  replayTimestamp: string | null;
  sourceReplayId: string;
}): string | null {
  return (
    input.replayTimestamp ??
    deriveReplayTimestampFromSourceId(input.sourceReplayId)
  );
}
