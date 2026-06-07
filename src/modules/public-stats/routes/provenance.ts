/**
 * Provenance helpers — pure, side-effect-free.
 *
 * ### HIST-03 invariant (T-16-02)
 * `maxTimestamp` MUST NOT use `Date.now()`, `new Date()` (without argument),
 * or any other request-time clock. The returned value MUST be derived
 * exclusively from the `Date` instances in the `values` array — i.e. from the
 * actual rows returned by the query, not the request time.
 *
 * Returns `null` when no `Date` instances are present in the array. This is
 * the correct result for a response backed by zero rows — it signals "no
 * provenance data available" rather than fabricating a timestamp.
 */

/**
 * Compute the maximum timestamp over a mixed array of `Date`, `null`, and
 * `undefined` values.
 *
 * @param values - Timestamps from rows returned by the current query. May
 *   include `null` (column was NULL in PostgreSQL) and `undefined` (column not
 *   selected / row missing a field). Both are filtered out before aggregation.
 * @returns ISO-8601 UTC string of the maximum `Date`, or `null` when no
 *   `Date` instances are present.
 *
 * ### Forbidden: `now()`
 * The implementation MUST NOT call `Date.now()`, `new Date()` (no-arg), or any
 * other source of wall-clock time. Provenance reflects data freshness, not
 * request time. The `grep -n "now()" provenance.ts` acceptance gate asserts
 * this at the file level.
 */
export function maxTimestamp(values: ReadonlyArray<Date | null | undefined>): string | null {
  const present = values.filter((v): v is Date => v instanceof Date);
  if (present.length === 0) return null;
  return new Date(Math.max(...present.map((d) => d.getTime()))).toISOString();
}
