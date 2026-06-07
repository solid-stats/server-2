import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Matches a full Steam64 identifier (`7656119` + 10 digits). Mirrors the
 * `STEAM64_PATTERN` in `src/test/integration/steamid-leak-guard.test.ts`. The
 * `u` flag keeps the regex Unicode-safe; `g` is intentionally omitted so
 * `String.prototype.match` returns the first match (or `null`) with no shared
 * `lastIndex` state. This static sweep is a DB-free defense-in-depth layer over
 * the published artifact, complementing the real-pg runtime leak guard.
 */
const STEAM64_PATTERN = /7656119\d{10}/u;

const FROZEN_VERSION = "1.0.0";

/**
 * Top-level pagination-metadata properties that the PUBLIC `/stats/*` cursor
 * contract must NEVER expose. (Offset pagination — `page`/`pageSize`/`total` —
 * is reserved for the internal `/operations/*` operator surface, which is NOT
 * part of the public `web` contract and is intentionally out of scope here.)
 */
const FORBIDDEN_PAGINATION_KEYS = ["page", "pageSize", "total"] as const;

/**
 * `/stats/leaderboards` exposes three nested cursor sub-envelopes — `bounty`,
 * `playersByKills`, `squadsByKills`. The nested-list coverage proof asserts the
 * one-level recursion reaches at least this many list envelopes for that path.
 */
const LEADERBOARD_SUB_ENVELOPES = 3;

type Json = Record<string, unknown>;

function asJson(value: unknown): Json | undefined {
  return typeof value === "object" && value !== null
    ? (value as Json)
    : undefined;
}

async function loadArtifact(): Promise<Json> {
  const raw = await readFile(
    resolve("openapi/server-2.openapi.json"),
    "utf8",
  );
  return JSON.parse(raw) as Json;
}

/**
 * Resolve the GET 200 `application/json` response schema for a path's
 * operations object, if present.
 */
function getJsonResponseSchema(ops: Json): Json | undefined {
  const get = asJson(ops["get"]);
  const responses = asJson(get?.["responses"]);
  const ok = asJson(responses?.["200"]);
  const content = asJson(ok?.["content"]);
  const json = asJson(content?.["application/json"]);
  return asJson(json?.["schema"]);
}

/**
 * Determine whether a response schema is a list response — one exposing a
 * TOP-LEVEL `items` property (either declared in `properties` or `required`).
 */
function isListSchema(schema: Json): boolean {
  const properties = asJson(schema["properties"]);
  const required = Array.isArray(schema["required"])
    ? (schema["required"] as unknown[])
    : [];
  return (
    (properties !== undefined && "items" in properties) ||
    required.includes("items")
  );
}

/**
 * Collect every cursor list envelope reachable from a `/stats/*` GET 200
 * response, recursing AT MOST ONE level into direct child object schemas.
 *
 * The top-level response is collected when it is itself a list envelope
 * (`/stats/players`, `/stats/squads`, `/stats/bounty`, `/stats/replays`,
 * `/stats/replays/{id}/events`). For composite responses like
 * `/stats/leaderboards` — `{ bounty, playersByKills, rotationId, squadsByKills }`
 * — the top level is NOT a list, so we descend exactly one level and collect
 * each direct child that is itself a list envelope (each of `bounty`,
 * `playersByKills`, `squadsByKills` exposes `hasMore`/`items`/`nextCursor`).
 *
 * Recursion is capped at one level on purpose: it must reach the nested
 * leaderboard cursor envelopes WITHOUT descending into per-item domain stats
 * (e.g. `stats.deaths.total`), which live under each envelope's `items` schema
 * and are NOT pagination metadata.
 */
function collectListSchemas(schema: Json): Json[] {
  const lists: Json[] = [];
  if (isListSchema(schema)) {
    lists.push(schema);
  }
  const properties = asJson(schema["properties"]);
  for (const child of Object.values(properties ?? {})) {
    const childSchema = asJson(child);
    if (childSchema !== undefined && isListSchema(childSchema)) {
      lists.push(childSchema);
    }
  }
  return lists;
}

/**
 * Collect `"<key>"` offenders for a single list envelope whose TOP-LEVEL
 * `properties` includes a forbidden offset pagination key.
 */
function listOffenderKeys(listSchema: Json): string[] {
  const offenders: string[] = [];
  const properties = asJson(listSchema["properties"]);
  if (properties === undefined) {
    return offenders;
  }
  for (const key of FORBIDDEN_PAGINATION_KEYS) {
    if (key in properties) {
      offenders.push(key);
    }
  }
  return offenders;
}

/**
 * Collect `"<path> -> <key>"` offenders for every PUBLIC `/stats/*` GET 200
 * list envelope whose TOP-LEVEL `properties` includes a forbidden offset
 * pagination key. Scoped strictly to `/stats/*`, recursing AT MOST ONE level
 * into composite responses (see `collectListSchemas`):
 *
 *  - `/operations/*` (legit offset pagination) is excluded by the path prefix.
 *  - Top-level list responses (`/stats/players`, …) are inspected.
 *  - Nested cursor envelopes (`/stats/leaderboards` -> `bounty`/`playersByKills`/
 *    `squadsByKills`) are inspected via the one-level recursion.
 *  - The domain stat `...stats.deaths.total` lives deeper, under each envelope's
 *    `items` schema, and is NOT inspected (recursion is capped at one level).
 *
 * `inspected` counts how many `/stats/*` list envelopes were actually walked
 * (including nested leaderboard sub-envelopes), so the assertion can prove it
 * is not vacuous.
 */
function findPaginationOffenders(spec: Json): {
  inspected: number;
  offenders: string[];
} {
  const paths = asJson(spec["paths"]) ?? {};
  const offenders: string[] = [];
  let inspected = 0;

  for (const [path, rawOps] of Object.entries(paths)) {
    if (!path.startsWith("/stats/")) {
      continue;
    }
    const ops = asJson(rawOps);
    if (ops === undefined) {
      continue;
    }
    const schema = getJsonResponseSchema(ops);
    if (schema === undefined) {
      continue;
    }

    for (const listSchema of collectListSchemas(schema)) {
      inspected += 1;
      for (const key of listOffenderKeys(listSchema)) {
        offenders.push(`${path} -> ${key}`);
      }
    }
  }

  return { inspected, offenders };
}

describe("frozen contract", () => {
  it("pins info.version to 1.0.0", async () => {
    const spec = await loadArtifact();
    const info = asJson(spec["info"]);
    expect(info?.["version"]).toBe(FROZEN_VERSION);
  });

  it("emits no full Steam64 anywhere in the artifact", async () => {
    // Match the RAW committed file text, not a JSON parse+stringify round-trip
    // (WR-03). `JSON.parse`/`stringify` route 17-digit integers through float64
    // and can re-serialize a numeric Steam64 to a different value that no longer
    // matches the exact pattern — the same float64 blind spot documented by the
    // runtime guard in `steamid-leak-guard.test.ts`. Scanning the raw bytes the
    // artifact is actually published as gives parity with that runtime guard and
    // removes the redundant parse+stringify.
    const raw = await readFile(
      resolve("openapi/server-2.openapi.json"),
      "utf8",
    );
    expect(raw).not.toMatch(STEAM64_PATTERN);
  });

  it("public /stats/* lists use cursor metadata, never page/pageSize/total", async () => {
    const spec = await loadArtifact();
    const { inspected, offenders } = findPaginationOffenders(spec);

    expect(offenders).toEqual([]);
    // Non-vacuous guard: at least one public list response must have been
    // walked, otherwise the scoped check could pass trivially on an empty set.
    expect(inspected).toBeGreaterThan(0);

    // Coverage proof for the nested-list path (WR-02): the three nested
    // `/stats/leaderboards` cursor sub-envelopes (`bounty`, `playersByKills`,
    // `squadsByKills`) must now be among the inspected set. Top-level list
    // responses contribute the rest, so the count must exceed the
    // top-level-only floor.
    const spec2 = await loadArtifact();
    const leaderboards = asJson(asJson(spec2["paths"])?.["/stats/leaderboards"]);
    expect(leaderboards).toBeDefined();
    if (leaderboards !== undefined) {
      const schema = getJsonResponseSchema(leaderboards);
      expect(schema).toBeDefined();
      if (schema !== undefined) {
        // The top-level leaderboards schema is itself NOT a list envelope, so
        // the only inspected entries from this path come from the one-level
        // recursion into its cursor sub-envelopes.
        expect(isListSchema(schema)).toBe(false);
        const nested = collectListSchemas(schema);
        expect(nested.length).toBeGreaterThanOrEqual(LEADERBOARD_SUB_ENVELOPES);
      }
    }
  });

  it("would report injected page on top-level AND nested /stats/* lists (negative control)", () => {
    // Reasoned negative control per the threat register (T-19-03): proves the
    // scoped walk is not a no-op by feeding it a synthetic spec with a planted
    // top-level `page` on a `/stats/*` list response AND a planted `page` on a
    // nested `/stats/leaderboards`-shaped cursor sub-envelope (WR-02 / IN-01).
    const planted: Json = {
      paths: {
        "/stats/players": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      properties: { items: {}, page: {} },
                      required: ["items"],
                    },
                  },
                },
              },
            },
          },
        },
        "/stats/leaderboards": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      // Composite response: top level is NOT a list envelope;
                      // the offender hides one level deep in a cursor sub-envelope.
                      properties: {
                        bounty: {
                          properties: {
                            items: {},
                            page: {},
                            hasMore: {},
                            nextCursor: {},
                          },
                          required: ["items"],
                        },
                        rotationId: {},
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const { inspected, offenders } = findPaginationOffenders(planted);
    // /stats/players top-level (1) + /stats/leaderboards.bounty nested (1).
    expect(inspected).toBe(2);
    expect(offenders).toEqual([
      "/stats/players -> page",
      "/stats/leaderboards -> page",
    ]);
  });
});
