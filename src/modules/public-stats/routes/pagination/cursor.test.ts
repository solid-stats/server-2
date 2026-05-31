/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import { type CursorPayload, decodeCursor, encodeCursor } from "./cursor.js";
import { BadCursorError } from "./errors.js";

const ALLOWED_SORTS = ["kills", "teamkills"] as const,
  SAMPLE_ID = "11111111-2222-3333-4444-555555555555",
  SAMPLE_VALUE = 5,
  EXTRA_VALUE = 6,
  ARITY_ONE = 1;

function payload(overrides: Partial<CursorPayload> = {}): CursorPayload {
  return {
    id: SAMPLE_ID,
    order: "desc",
    sort: "kills",
    values: [SAMPLE_VALUE],
    ...overrides,
  };
}

function corrupt(raw: unknown): string {
  return Buffer.from(JSON.stringify(raw), "utf8").toString("base64url");
}

describe("cursor codec round-trip", () => {
  it("decodes an encoded payload to a deep-equal value", () => {
    const original = payload(),
      token = encodeCursor(original);

    expect(decodeCursor(token, ALLOWED_SORTS, 1)).toEqual(original);
  });

  it("round-trips a string sort value", () => {
    const original = payload({ sort: "teamkills", values: ["alpha"] }),
      token = encodeCursor(original);

    expect(decodeCursor(token, ALLOWED_SORTS, 1)).toEqual(original);
  });

  it("round-trips a null sort value", () => {
    const original = payload({ order: "asc", values: [null] }),
      token = encodeCursor(original);

    expect(decodeCursor(token, ALLOWED_SORTS, 1)).toEqual(original);
  });
});

describe("cursor codec reject matrix", () => {
  const cases: { name: string; token: string }[] = [
    { name: "non-base64url garbage", token: "!!!not base64url!!!" },
    { name: "valid base64url of non-JSON", token: Buffer.from("not json", "utf8").toString("base64url") },
    { name: "JSON that is not an object (array)", token: corrupt([SAMPLE_VALUE]) },
    { name: "JSON that is not an object (null)", token: corrupt(null) },
    { name: "JSON that is not an object (string)", token: corrupt("just-a-string") },
    { name: "missing id", token: corrupt({ order: "desc", sort: "kills", values: [SAMPLE_VALUE] }) },
    { name: "non-string id", token: corrupt({ id: SAMPLE_VALUE, order: "desc", sort: "kills", values: [SAMPLE_VALUE] }) },
    { name: "order not asc/desc", token: corrupt({ id: SAMPLE_ID, order: "up", sort: "kills", values: [SAMPLE_VALUE] }) },
    { name: "sort not in allowedSorts", token: corrupt({ id: SAMPLE_ID, order: "desc", sort: "deaths", values: [SAMPLE_VALUE] }) },
    { name: "values not an array", token: corrupt({ id: SAMPLE_ID, order: "desc", sort: "kills", values: SAMPLE_VALUE }) },
    { name: "values wrong arity", token: corrupt({ id: SAMPLE_ID, order: "desc", sort: "kills", values: [SAMPLE_VALUE, EXTRA_VALUE] }) },
    { name: "values element not number|string|null", token: corrupt({ id: SAMPLE_ID, order: "desc", sort: "kills", values: [{}] }) },
  ];

  it.each(cases)("rejects $name with BadCursorError", ({ token }) => {
    expect(() => decodeCursor(token, ALLOWED_SORTS, ARITY_ONE)).toThrow(
      BadCursorError,
    );
  });

  it("never echoes a Steam64 in the error message", () => {
    const leaky = corrupt({
        id: "76561198000000000",
        order: "down",
        sort: "kills",
        values: ["76561198000000000"],
      }),
      message = (() => {
        try {
          decodeCursor(leaky, ALLOWED_SORTS, 1);
          return "";
        } catch (error) {
          return (error as Error).message;
        }
      })();

    expect(message).not.toMatch(/7656119\d{10}/u);
    expect(message.length).toBeGreaterThan(0);
  });
});
