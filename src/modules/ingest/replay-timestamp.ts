/* eslint-disable unicorn/no-null */
// Derive a replay timestamp from a source replay id — the PRIMARY timestamp source.
//
// The Unix epoch encoded in `source_replay_id` (the sg.zone id, a 10-digit seconds suffix, e.g.
// `sg-zone-1624129684` -> 2021-06-19) is the only unambiguous UTC instant the system carries, so
// it is epoch-PRIMARY: when an in-range epoch is present it WINS over the staged `replayTimestamp`,
// and the staged value is the FALLBACK used only when the id has no in-range epoch (`derived:`,
// non-numeric, or out of range). The staged value was server-local wall-clock (≈UTC+1) wrongly
// stamped as UTC, or filename-sourced (the wrong event entirely) — strictly worse than the epoch.
//
// The epoch is a trailing run of EXACTLY 10 digits preceded by a non-digit or the string start,
// then bounded to the plausible Unix-seconds range. This mirrors migration 0013's SQL exactly:
// `source_replay_id ~ '(\D|^)\d{10}$'` plus `between 1420070400 and 2051222400`, so the ingest
// path and the 0013 backfill accept/reject the SAME inputs.
//
// The exactly-10-digits anchor is what keeps the two paths in agreement: a greedy `\d{9,}$` would
// accept a longer unbroken run (e.g. a zero-padded `00000000001500000000`, which Number() strips to
// 1500000000, in range) that the SQL's exact-10 pattern leaves untouched. Requiring exactly 10
// trailing digits rejects any run that is not 10-long (9-digit, 11+-digit, zero-padded over-long)
// before the range check, identically to SQL.
//
// minEpochSeconds = 1_420_070_400 (2015-01-01) .. maxEpochSeconds = 2_051_222_400 (2035-01-01),
// inclusive — the fetcher's authoritative window. Covers every real sg.zone id (e.g. 1624129684 ->
// 2021-06-19) and rejects the in-range-but-out-of-bound ends (a 10-digit run < lower or > upper).
const minEpochSeconds = 1_420_070_400,
  maxEpochSeconds = 2_051_222_400,
  millisPerSecond = 1000,
  trailingEpochPattern = /(?:^|\D)(?<epoch>\d{10})$/u;

/**
 * Parse the Unix-epoch (seconds) suffix of a `source_replay_id` into an ISO-8601 timestamp.
 *
 * Returns `null` when the id has no trailing run of exactly 10 digits preceded by a non-digit or
 * the string start, or when the parsed epoch falls outside the plausible
 * {@link minEpochSeconds}..{@link maxEpochSeconds} range. Mirrors migration 0013's `(\D|^)\d{10}$`
 * + range bound exactly. Pure and deterministic.
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
  // The range check above bounds epochSeconds to [1.42e9, 2.05e9], so epochSeconds * 1000 lands in
  // ~[1.42e12, 2.05e12] ms -- always far inside JS Date's valid range (+/-8.64e15 ms). new Date()
  // can therefore never produce an Invalid Date here, so no NaN guard is needed.
  const date = new Date(epochSeconds * millisPerSecond);
  return date.toISOString();
}

/**
 * Resolve the effective replay timestamp for a promoted replay (epoch-primary): use the epoch
 * encoded in the source replay id when one is in range, otherwise fall back to the staged
 * `replayTimestamp`. The epoch wins over a present staged value because it is the only true UTC
 * instant the system carries; the staged value is used only when the id has no in-range epoch.
 */
export function resolveReplayTimestamp(input: {
  replayTimestamp: string | null;
  sourceReplayId: string;
}): string | null {
  return (
    deriveReplayTimestampFromSourceId(input.sourceReplayId) ??
    input.replayTimestamp
  );
}
