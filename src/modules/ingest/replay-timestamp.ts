/* eslint-disable unicorn/no-null */
// Derive a replay timestamp from a source replay id when the primary date source is absent.
//
// Early sg/mace replays carry no primary `replayTimestamp`, but their `source_replay_id` is the
// sg.zone id — a Unix epoch (seconds) suffix, e.g. `sg-zone-1624129684` -> 2021-06-19. This is a
// FALLBACK only: it is applied when the primary source is missing, never to replace a value that
// is already present. The non-null replays got their timestamp from a different (non-epoch)
// source that the early ones lacked.

// The epoch is the trailing run of digits in the id. Require at least 9 digits so a stray short
// numeric suffix can never be mistaken for an epoch: 9 digits is `> 1e8` seconds (year 1973),
// below any real replay, and the smallest width that excludes incidental short numbers.
const minEpochDigits = 9,
  millisPerSecond = 1000,
  trailingEpochPattern = new RegExp(
    String.raw`(?<epoch>\d{${String(minEpochDigits)},})$`,
    "u",
  );

/**
 * Parse the Unix-epoch (seconds) suffix of a `source_replay_id` into an ISO-8601 timestamp.
 *
 * Returns `null` when the id has no trailing run of at least {@link minEpochDigits} digits, or
 * when the parsed epoch does not yield a valid date. Pure and deterministic.
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
  const millis = epochSeconds * millisPerSecond;
  if (!Number.isSafeInteger(millis)) {
    return null;
  }
  const date = new Date(millis);
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
