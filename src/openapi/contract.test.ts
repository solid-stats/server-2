import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Contract guard over the EXPORTED OpenAPI artifact (the source of truth `web`
 * generates its client from). Two invariants from Plan 14-03:
 *
 *  1. Every paginated list-response schema speaks the cursor contract
 *     (`items` + `nextCursor` + `hasMore`) and declares NONE of the removed
 *     offset fields (`page`/`pageSize`/`total`). We scope the assertion to the
 *     paginated schema OBJECTS — never a whole-file string grep, because
 *     `total`/`page` legitimately appear in unrelated descriptions/paths
 *     (e.g. `totals`, `/stats/players`).
 *  2. No full Steam64 (`7656119` + 10 digits) appears anywhere in the artifact.
 */

const REMOVED_OFFSET_FIELDS = ["page", "pageSize", "total"],
  STEAM64_PATTERN = /7656119\d{10}/u;

interface SchemaObject {
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Recursively collect every object node that has a `properties` map. */
function collectSchemaObjects(node: unknown, accumulator: SchemaObject[]): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectSchemaObjects(child, accumulator);
    }
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }
  const candidate = node as Record<string, unknown>,
    { properties } = candidate;
  if (typeof properties === "object" && properties !== null) {
    accumulator.push(candidate);
  }
  for (const value of Object.values(candidate)) {
    collectSchemaObjects(value, accumulator);
  }
}

function isPaginatedSchema(schema: SchemaObject): boolean {
  const properties = schema.properties ?? {};
  return (
    "items" in properties &&
    "nextCursor" in properties &&
    "hasMore" in properties
  );
}

const artifact = await readFile(
    resolve("openapi/server-2.openapi.json"),
    "utf8",
  ),
  document: unknown = JSON.parse(artifact),
  schemaObjects: SchemaObject[] = [];
collectSchemaObjects(document, schemaObjects);
const paginatedSchemas = schemaObjects.filter((schema) =>
  isPaginatedSchema(schema),
);

describe("exported OpenAPI pagination contract", () => {
  it("exports at least one paginated list-response schema", () => {
    expect(paginatedSchemas.length).toBeGreaterThan(0);
  });

  it("declares no page/pageSize/total on any paginated list-response schema", () => {
    for (const schema of paginatedSchemas) {
      const properties = schema.properties ?? {};
      for (const removed of REMOVED_OFFSET_FIELDS) {
        expect(properties).not.toHaveProperty(removed);
      }
    }
  });

  it("contains zero full Steam64 anywhere in the artifact", () => {
    expect(artifact).not.toMatch(STEAM64_PATTERN);
  });
});
