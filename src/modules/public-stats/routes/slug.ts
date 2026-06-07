/**
 * Slug helpers — pure, side-effect-free.
 *
 * ### Byte-identical TS↔SQL invariant (Pitfall 1 / T-16-01)
 * `slugify` MUST produce the same output as the SQL `slug_base()` function
 * defined in migration `0006_slug_addressing.sql`. Both are driven from the
 * single ordered `CYRILLIC_TRANSLITERATION` source below. Plan 02 mirrors this
 * list byte-for-byte into SQL `replace()` chains so that app-generated slugs
 * (new-row path) and backfilled slugs are identical for the same input string.
 *
 * ### id-fallback is the caller's responsibility
 * `slugify` returns an empty string for unslugifiable inputs (e.g. "!!!" or "").
 * Callers (app insert path, SQL backfill) apply the entity-prefix id-fallback
 * (`p-<hex>`, `s-<hex>`, etc.) when the result is empty. Do NOT put fallback
 * logic here — it would couple this helper to entity types.
 *
 * ### Collision-suffixing is the caller's responsibility
 * Appending `-<shortSuffix>` to resolve slug collisions happens at the insert
 * path / SQL backfill level, not inside `slugify`. Keep this function a pure
 * transform of a single name string.
 */

/**
 * Ordered list of Cyrillic → Latin transliteration pairs.
 *
 * **ORDER MATTERS** — multi-char sequences (ж→zh, ч→ch, ш→sh, щ→shch, ю→yu,
 * я→ya, х→kh, ё→e) MUST appear BEFORE single-char ones so that chained
 * `String.replace()` calls process them in the correct priority order.
 * Plan 02 mirrors this exact list in the SQL `slug_base()` function as chained
 * `replace()` calls (before `translate()`), in this same order.
 *
 * Both upper- and lower-case Cyrillic are covered: `slugify` lowercases the
 * input first, so only lower-case Cyrillic entries are needed for correctness.
 * The map is listed lower-case; `slugify` normalises case before applying it.
 */
export const CYRILLIC_TRANSLITERATION: readonly (readonly [string, string])[] =
  [
    // Multi-char sequences — must come first
    ["ж", "zh"],
    ["ч", "ch"],
    ["ш", "sh"],
    ["щ", "shch"],
    ["ю", "yu"],
    ["я", "ya"],
    ["х", "kh"],
    ["ё", "e"],
    // Single-char sequences
    ["а", "a"],
    ["б", "b"],
    ["в", "v"],
    ["г", "g"],
    ["д", "d"],
    ["е", "e"],
    ["з", "z"],
    ["и", "i"],
    ["й", "j"],
    ["к", "k"],
    ["л", "l"],
    ["м", "m"],
    ["н", "n"],
    ["о", "o"],
    ["п", "p"],
    ["р", "r"],
    ["с", "s"],
    ["т", "t"],
    ["у", "u"],
    ["ф", "f"],
    ["ц", "ts"],
    ["ы", "y"],
    ["э", "e"],
    // Soft/hard signs produce no Latin character (omit from output)
    ["ь", ""],
    ["ъ", ""],
  ];

/**
 * Canonical UUID pattern (case-insensitive). Used to branch slug-or-UUID
 * resolution without passing a non-UUID string to a `::uuid` PostgreSQL cast
 * (which would throw `invalid input syntax for type uuid` → 500).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const SHORT_SUFFIX_LENGTH = 6;

/**
 * Convert a human-readable name to a URL-safe slug.
 *
 * Algorithm (byte-identical to SQL `slug_base()` in migration 0006):
 * 1. Lowercase the input.
 * 2. Apply multi-char Cyrillic→Latin replacements (ж→zh, ч→ch, etc.) in
 *    `CYRILLIC_TRANSLITERATION` order — must happen before single-char pass.
 * 3. Apply single-char Cyrillic→Latin replacements (а→a, б→b, etc.).
 * 4. Replace every run of non-`[a-z0-9]` characters with a single dash.
 * 5. Trim leading and trailing dashes.
 *
 * Returns `""` for empty or unslugifiable inputs — the caller must apply an
 * entity-prefix id-fallback (e.g. `"p-" + shortSuffix(id)`) when needed.
 */
export function slugify(name: string): string {
  let slug = name.toLowerCase();
  for (const [cyr, lat] of CYRILLIC_TRANSLITERATION) {
    slug = slug.replaceAll(cyr, lat);
  }
  slug = slug.replaceAll(/[^a-z\d]+/gu, "-").replaceAll(/^-+|-+$/gu, "");
  return slug;
}

/**
 * Derive a short hex suffix from a UUID for use in collision-resolved slugs.
 *
 * Takes the first {@link SHORT_SUFFIX_LENGTH} hex characters of the UUID with
 * dashes removed (always lowercase). E.g.:
 * `"550e8400-e29b-41d4-a716-446655440000"` → `"550e84"`.
 *
 * This value is deterministic and order-independent — safe to use in both the
 * app insert path and the SQL backfill (`substr(replace(id::text,'-',''),1,6)`).
 */
export function shortSuffix(uuid: string): string {
  return uuid.replaceAll("-", "").slice(0, SHORT_SUFFIX_LENGTH).toLowerCase();
}

/**
 * Returns `true` when `value` looks like a canonical UUID
 * (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`, case-insensitive).
 *
 * Used by the slug-or-UUID resolver to choose the correct SQL branch without
 * passing a slug string to a `::uuid` PostgreSQL parameter (which would throw
 * `invalid input syntax for type uuid` and produce a 500 instead of a 404).
 */
export function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value);
}
