/* eslint-disable camelcase, no-magic-numbers, unicorn/no-null */
//
// normalize.test.ts — guards the snapshot normalizer's value handling.
//
// Pure unit test (no infra): lives under src/test/golden so it runs with
// `pnpm test:golden` alongside the suites whose snapshots it protects. The Date
// branch is the regression this permanently pins: pg returns timestamptz columns
// as JS Date, and a missing Date branch silently collapsed them to "{}" (REVIEW #1).
import { describe, expect, it } from "vitest";

import { UuidMap, normalizeValue } from "./normalize.js";

describe("normalizeValue", () => {
  it("round-trips a Date to its UTC ISO string (never {} — REVIEW #1)", () => {
    const date = new Date("2026-05-09T00:00:00.000Z");

    const result = normalizeValue(date, new UuidMap());

    expect(result).toBe("2026-05-09T00:00:00.000Z");
  });

  it("maps a uuid string through the stable token map", () => {
    const uuids = new UuidMap(),
      uuid = "11111111-1111-1111-1111-111111111111";

    expect(normalizeValue(uuid, uuids)).toBe("uuid:1");
    // Same uuid → same token; a different uuid → next token.
    expect(normalizeValue(uuid, uuids)).toBe("uuid:1");
    expect(normalizeValue("22222222-2222-2222-2222-222222222222", uuids)).toBe(
      "uuid:2",
    );
  });

  it("leaves a non-uuid primitive untouched", () => {
    expect(normalizeValue("golden", new UuidMap())).toBe("golden");
    expect(normalizeValue(123, new UuidMap())).toBe(123);
    expect(normalizeValue(null, new UuidMap())).toBeNull();
  });

  it("redacts a now()-driven timestamp column inside an object by key", () => {
    const result = normalizeValue(
      { created_at: new Date("2026-05-09T00:00:00.000Z"), name: "x" },
      new UuidMap(),
    );

    // created_at is in TIMESTAMP_KEYS → redacted; name survives.
    expect(result).toEqual({ created_at: "<ts>", name: "x" });
  });

  it("keeps a deterministic Date column (not in TIMESTAMP_KEYS) as its ISO value", () => {
    const result = normalizeValue(
      { replay_timestamp: new Date("2026-05-09T00:00:00.000Z") },
      new UuidMap(),
    );

    expect(result).toEqual({
      replay_timestamp: "2026-05-09T00:00:00.000Z",
    });
  });
});
