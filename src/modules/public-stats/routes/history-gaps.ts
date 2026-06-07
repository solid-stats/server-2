/**
 * History-gap computation — pure, side-effect-free.
 *
 * `withGaps` inserts explicit `{ kind: "unknown-gap" }` entries between
 * known timeline windows so that the absence of evidence is represented as
 * first-class data rather than a silent hole. Plan 03 will declare a TypeBox
 * mirror of `UnknownGapEntry` for schema validation.
 *
 * ### Locked edge-policy (Open Q1, resolved in PLAN 16-01)
 * (a) A between-gap is emitted only when `prevTo < nextFrom` (strictly
 *     disjoint). Adjacent (`prevTo === nextFrom`) and overlapping windows
 *     produce no gap.
 * (b) A leading gap `{ from: null, to: firstFrom }` is emitted only when
 *     `firstFrom !== null` — we know activity started at that point, so
 *     everything before is genuinely unknown.
 * (c) A trailing gap `{ from: lastTo, to: null }` is emitted only when the
 *     last window is **closed** (`to !== null`). An open last window (`to ===
 *     null`) represents the current/ongoing state and is NOT a gap.
 *
 * ### Comparison semantics
 * Temporal bounds are ISO-8601 date-time strings from PostgreSQL. Lexicographic
 * string comparison (`<`) is correct for ISO strings with the same UTC offset
 * (all values from this repo use UTC / `Z` suffix).
 */

/** An explicit unknown-gap entry in a discriminated-union timeline. */
export interface UnknownGapEntry {
  readonly from: string | null;
  readonly kind: "unknown-gap";
  readonly to: string | null;
}

/**
 * Determines whether a gap exists between two consecutive window boundaries.
 *
 * A gap exists (between-gap) when both `prevTo` and `nextFrom` are non-null
 * and `prevTo` is strictly less than `nextFrom` (the windows are disjoint).
 * A gap also exists at the leading edge when `prevTo` is null (before the
 * first window) and `nextFrom` is non-null.
 */
function gapExists(prevTo: string | null, nextFrom: string | null): boolean {
  if (nextFrom === null) return false;
  if (prevTo === null) return true; // leading gap
  return prevTo < nextFrom; // between-gap (strict disjoint)
}

/**
 * Build a discriminated-union timeline from sorted window intervals by
 * inserting explicit `unknown-gap` entries wherever the timeline has holes.
 *
 * @param windows - Interval objects sorted ascending by `from` (nulls-first),
 *   each carrying `from: string | null` and `to: string | null` plus any
 *   payload properties.
 * @param makeKnown - Maps a window `T` to a known-kind entry. The caller
 *   provides the union member shape (e.g. `{ kind: "alias", ... }`).
 * @returns A discriminated-union array interleaving known entries with
 *   `unknown-gap` entries as dictated by the locked edge-policy above.
 */
export function withGaps<
  T extends { from: string | null; to: string | null },
  KnownEntry,
>(windows: T[], makeKnown: (w: T) => KnownEntry): Array<KnownEntry | UnknownGapEntry> {
  const out: Array<KnownEntry | UnknownGapEntry> = [];

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!;
    const prevTo = i === 0 ? null : windows[i - 1]!.to;

    // Leading gap (i === 0, prevTo === null) or between-gap (i > 0).
    if (gapExists(prevTo, w.from)) {
      out.push({ from: prevTo, kind: "unknown-gap", to: w.from });
    }

    out.push(makeKnown(w));
  }

  // Trailing gap: only when the last window is closed (to !== null).
  const last = windows.at(-1);
  if (last !== undefined && last.to !== null) {
    out.push({ from: last.to, kind: "unknown-gap", to: null });
  }

  return out;
}
