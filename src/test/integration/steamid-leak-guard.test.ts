import { describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";
import { createLoggerOptions } from "../../infra/logging/logger.js";

import type { AppConfig } from "../../config/env.js";

/**
 * Matches a full Steam64 identifier (`7656119` + 10 digits). The acceptance
 * contract for SEC-01/SEC-02 is that this pattern finds ZERO matches across
 * every public response body, captured cursor token, structured log field, and
 * error payload. `u` flag keeps the regex Unicode-safe; `g` is intentionally
 * omitted so `.test` has no shared lastIndex state.
 */
const STEAM64_PATTERN = /7656119\d{10}/u;

/**
 * Reusable guard: serialize any value and assert it carries no full Steam64.
 * Exported for reuse by Plan 14-03's real-pg leak sweep. Proven to catch a
 * planted leak by the negative self-test below — it is not a vacuous assertion.
 */
export function expectNoSteam64(value: unknown): void {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  expect(serialized).not.toMatch(STEAM64_PATTERN);
}

const PUBLIC_LIST_ROUTES = [
    "/stats/players",
    "/stats/squads",
    "/stats/bounty",
    "/stats/leaderboards",
  ],
  PLAYER_ID = "00000000-0000-4000-8000-000000000502",
  SQUAD_ID = "00000000-0000-4000-8000-000000000503",
  PUBLIC_DETAIL_ROUTES = [
    `/stats/players/${PLAYER_ID}`,
    `/stats/squads/${SQUAD_ID}`,
  ];

describe("expectNoSteam64 guard helper", () => {
  it("passes for a payload with no full Steam64", () => {
    expect(() => {
      expectNoSteam64({ steamIds: ["...7890"], value: "safe" });
    }).not.toThrow();
  });

  it("throws when a full Steam64 is planted in an object (negative self-test)", () => {
    expect(() => {
      expectNoSteam64({ steamId: "76561198012347890" });
    }).toThrow();
  });

  it("throws when a full Steam64 is planted in a raw string (negative self-test)", () => {
    expect(() => {
      expectNoSteam64("leak: 76561198012347890 here");
    }).toThrow();
  });
});

describe("steamId leak guard - pino redaction", () => {
  it("redacts every SteamID-bearing log field", () => {
    const options = createLoggerOptions({ logLevel: "info" } as AppConfig);

    if (
      typeof options !== "object" ||
      !("redact" in options) ||
      Array.isArray(options.redact)
    ) {
      throw new TypeError("expected structured logger options with redact config");
    }

    expect(options.redact.paths).toEqual(
      expect.arrayContaining([
        "*.steamId",
        "*.steamIds",
        "*.steam_id",
        "*.steam_ids",
      ]),
    );
  });
});

describe("steamId leak guard - public route sweep", () => {
  it.each([...PUBLIC_LIST_ROUTES, ...PUBLIC_DETAIL_ROUTES])(
    "emits zero full Steam64 over %s response body",
    async (url) => {
      const app = await buildApp();

      try {
        const response = await app.inject({ method: "GET", url });

        expectNoSteam64(response.json());
        expectNoSteam64(response.payload);
      } finally {
        await app.close();
      }
    },
  );

  // Plan 14-03 wires BadCursorError -> 400. Once that error path exists, this
  // case must inject a malformed `cursor=` value, assert a 400, and run
  // expectNoSteam64 over the error body + payload. 14-03 un-skips it.
  it.todo("emits zero full Steam64 over the malformed-cursor 400 error path");
});
