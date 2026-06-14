/* eslint-disable unicorn/no-null */
// Derive a replay timestamp from a source replay id when the primary date source is absent.
//
// Early sg/mace replays carry no primary `replayTimestamp`, but their `source_replay_id` is the
// sg.zone id — a Unix epoch (seconds) suffix, e.g. `sg-zone-1624129684` -> 2021-06-19. This is a
// FALLBACK only: it is applied when the primary source is missing, never to replace a value that
// is already present. The non-null replays got their timestamp from a different (non-epoch)
// source that the early ones lacked.

// The epoch is a trailing run of EXACTLY 10 digits preceded by a non-digit or the string start,
// then bounded to a plausible Unix-seconds range. This mirrors migration 0011's SQL exactly:
// `source_replay_id ~ '(\D|^)\d{10}$'` plus `between 1000000000 and 2000000000`, so the ingest
// path and the backfill accept/reject the SAME inputs.
//
// The exactly-10-digits anchor is what keeps the two paths in agreement: a greedy `\d{9,}$` would
// accept a longer unbroken run (e.g. a zero-padded `00000000001500000000`, which Number() strips to
// 1500000000, in range) that the SQL's exact-10 pattern leaves NULL. Requiring exactly 10 trailing
// digits rejects any run that is not 10-long (9-digit, 11+-digit, zero-padded over-long) before the
// range check, identically to SQL.
//
// minEpochSeconds = 1e9 (2001-09) .. maxEpochSeconds = 2e9 (2033-05) covers every real 10-digit
// sg.zone id (e.g. 1624129684 -> 2021-06-19) and rejects the in-range-but-out-of-bound ends (a
// 10-digit run < 1e9 or > 2e9).
const minEpochSeconds = 1_000_000_000,
  maxEpochSeconds = 2_000_000_000,
  millisPerSecond = 1000,
  trailingEpochPattern = /(?:^|\D)(?<epoch>\d{10})$/u;

/**
 * Parse the Unix-epoch (seconds) suffix of a `source_replay_id` into an ISO-8601 timestamp.
 *
 * Returns `null` when the id has no trailing run of exactly 10 digits preceded by a non-digit or
 * the string start, when the parsed epoch falls outside the plausible
 * {@link minEpochSeconds}..{@link maxEpochSeconds} range, or when it does not yield a valid date.
 * Mirrors migration 0011's `(\D|^)\d{10}$` + range bound exactly. Pure and deterministic.
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
