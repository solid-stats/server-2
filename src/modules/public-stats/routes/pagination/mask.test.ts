import { describe, expect, it } from "vitest";

import { maskSteamId } from "./mask.js";

const STEAM64 = "76561198012347890",
  STEAM64_PATTERN = /7656119\d{10}/u;

describe("maskSteamId", () => {
  it("returns leading-ellipsis + last-4 digits for a full Steam64", () => {
    expect(maskSteamId(STEAM64)).toBe("...7890");
  });

  it("never leaves a full Steam64 in the masked output", () => {
    expect(maskSteamId(STEAM64)).not.toMatch(STEAM64_PATTERN);
  });

  it.each([
    { expected: "...7890", input: "76561198012347890", name: "17-digit Steam64" },
    { expected: "...3456", input: "0123456", name: "7-char value" },
    { expected: "...abcd", input: "wxyzabcd", name: "non-digit trailing chars" },
  ])("masks a $name to $expected", ({ expected, input }) => {
    expect(maskSteamId(input)).toBe(expected);
  });

  it.each([
    { expected: "...abc", input: "abc", name: "3-char value" },
    { expected: "...a", input: "a", name: "1-char value" },
    { expected: "...", input: "", name: "empty value" },
  ])("returns ... plus available trailing chars for a short $name", ({ expected, input }) => {
    expect(maskSteamId(input)).toBe(expected);
  });
});
