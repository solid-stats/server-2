//
// normalize.ts — the ONE shared snapshot normalizer for the golden oracle.
//
// Characterization snapshots must be deterministic across runs. Two sources of
// non-determinism enter the asserted surface (RESEARCH §4): gen_random_uuid() ids
// (+ their fk references) and now()-based timestamps. This module:
//   - builds a uuid -> stable token map (first-seen order, "uuid:1", "uuid:2", …),
//     substituting BOTH primary ids AND fk columns through the same map;
//   - redacts known timestamp columns to a fixed token;
//   - redacts the parser artifact's local source_file path (absolute, host-specific);
//   - sorts rows by a caller-supplied natural key so DB scan order never matters.
//
// Contractual order (cursor-paginated lists, bounty inputs.events[]) is NOT re-sorted —
// the caller simply does not pass those through sortRows().

const TIMESTAMP_TOKEN = "<ts>";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const TIMESTAMP_KEYS = new Set([
  "calculated_at",
  "created_at",
  "finished_at",
  "published_at",
  "started_at",
  "updated_at",
]);

/**
 * A stable uuid -> token map shared across all rows of one snapshot so the SAME
 * uuid (whether it appears as a primary id or an fk) always maps to the SAME token.
 */
export class UuidMap {
  private readonly tokens = new Map<string, string>();

  public token(uuid: string): string {
    const existing = this.tokens.get(uuid);
    if (existing !== undefined) {
      return existing;
    }
    const token = `uuid:${String(this.tokens.size + 1)}`;
    this.tokens.set(uuid, token);
    return token;
  }
}

/**
 * Recursively normalize a value: map every uuid string (primary id or fk) through
 * `uuids`, redact timestamp-named fields, and redact the artifact source_file path.
 * Arrays keep their order (callers control row order via sortRows()).
 */
export function normalizeValue(value: unknown, uuids: UuidMap): unknown {
  if (typeof value === "string") {
    return UUID_PATTERN.test(value) ? uuids.token(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, uuids));
  }
  if (value !== null && typeof value === "object") {
    return normalizeObject(value as Record<string, unknown>, uuids);
  }
  return value;
}

function normalizeObject(
  value: Record<string, unknown>,
  uuids: UuidMap,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (TIMESTAMP_KEYS.has(key) && item !== null) {
      result[key] = TIMESTAMP_TOKEN;
      continue;
    }
    if (key === "source_file" && typeof item === "string") {
      // Absolute, host-specific local path from the parser-2 CLI run — redact.
      result[key] = "<source_file>";
      continue;
    }
    result[key] = normalizeValue(item, uuids);
  }
  return result;
}

/**
 * Normalize a list of DB rows and sort by a caller-supplied natural key, so the
 * snapshot is independent of DB scan order. Use ONLY for unordered table dumps;
 * never for contractually-ordered surfaces (cursor lists, bounty events).
 */
export function normalizeRows(
  rows: Record<string, unknown>[],
  uuids: UuidMap,
  naturalKey: (row: Record<string, unknown>) => string,
): Record<string, unknown>[] {
  return rows
    .map((row) => ({
      key: naturalKey(row),
      normalized: normalizeObject(row, uuids),
    }))
    .toSorted((left, right) => left.key.localeCompare(right.key))
    .map((entry) => entry.normalized);
}
