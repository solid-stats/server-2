/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import {
  CYRILLIC_TRANSLITERATION,
  looksLikeUuid,
  shortSuffix,
  slugify,
} from "./slug.js";

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe("slugify", () => {
  it("lowercases Latin and collapses spaces to dashes", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("trims and collapses leading/trailing non-alnum runs", () => {
    expect(slugify("  --Foo__Bar!!  ")).toBe("foo-bar");
  });

  it("keeps existing digits and Latin characters", () => {
    expect(slugify("Team-7")).toBe("team-7");
  });

  it("returns empty string for an empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns empty string when input produces no alnum characters", () => {
    expect(slugify("!!!")).toBe("");
  });

  it("does not append id-fallback (caller responsibility)", () => {
    // slugify only transforms; callers apply 'p-<hex>' when result is empty
    expect(slugify("!!!")).toBe("");
  });

  // -------------------------------------------------------------------------
  // Cyrillic transliteration fixture table
  // -------------------------------------------------------------------------
  it.each([
    // multi-char sequences (applied BEFORE single-char translate)
    { cyrillic: "ж", expected: "zh" },
    { cyrillic: "ч", expected: "ch" },
    { cyrillic: "ш", expected: "sh" },
    { cyrillic: "щ", expected: "shch" },
    { cyrillic: "ю", expected: "yu" },
    { cyrillic: "я", expected: "ya" },
    { cyrillic: "х", expected: "kh" },
    { cyrillic: "ё", expected: "e" },
    // uppercase variants produce same Latin output via toLowerCase
    { cyrillic: "Ж", expected: "zh" },
    { cyrillic: "Ч", expected: "ch" },
    { cyrillic: "Ш", expected: "sh" },
    { cyrillic: "Щ", expected: "shch" },
    { cyrillic: "Ю", expected: "yu" },
    { cyrillic: "Я", expected: "ya" },
    { cyrillic: "Х", expected: "kh" },
    { cyrillic: "Ё", expected: "e" },
    // single-char transliterations
    { cyrillic: "а", expected: "a" },
    { cyrillic: "б", expected: "b" },
    { cyrillic: "в", expected: "v" },
    { cyrillic: "г", expected: "g" },
    { cyrillic: "д", expected: "d" },
    { cyrillic: "е", expected: "e" },
    { cyrillic: "з", expected: "z" },
    { cyrillic: "и", expected: "i" },
    { cyrillic: "й", expected: "j" },
    { cyrillic: "к", expected: "k" },
    { cyrillic: "л", expected: "l" },
    { cyrillic: "м", expected: "m" },
    { cyrillic: "н", expected: "n" },
    { cyrillic: "о", expected: "o" },
    { cyrillic: "п", expected: "p" },
    { cyrillic: "р", expected: "r" },
    { cyrillic: "с", expected: "s" },
    { cyrillic: "т", expected: "t" },
    { cyrillic: "у", expected: "u" },
    { cyrillic: "ф", expected: "f" },
    { cyrillic: "ц", expected: "ts" },
    { cyrillic: "ы", expected: "y" },
    { cyrillic: "э", expected: "e" },
    { cyrillic: "ь", expected: "" },
    { cyrillic: "ъ", expected: "" },
  ])(
    "transliterates Cyrillic '$cyrillic' to '$expected'",
    ({ cyrillic, expected }) => {
      expect(slugify(cyrillic)).toBe(expected);
    },
  );

  it("transliterates a full Russian name deterministically", () => {
    expect(slugify("Игрок Вася")).toBe("igrok-vasya");
  });

  it("handles mixed Cyrillic and Latin input", () => {
    expect(slugify("Squad-Отряд1")).toBe("squad-otryad1");
  });

  it("CYRILLIC_TRANSLITERATION is an ordered array of [cyr, lat] pairs", () => {
    expect(Array.isArray(CYRILLIC_TRANSLITERATION)).toBe(true);
    for (const pair of CYRILLIC_TRANSLITERATION) {
      expect(Array.isArray(pair)).toBe(true);
      expect(pair).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// shortSuffix
// ---------------------------------------------------------------------------

describe("shortSuffix", () => {
  it("returns the first 6 lowercase hex chars of a UUID (dashes removed)", () => {
    expect(shortSuffix("550e8400-e29b-41d4-a716-446655440000")).toBe("550e84");
  });

  it("is lowercase even when the uuid is uppercase", () => {
    expect(shortSuffix("AABBCC00-0000-0000-0000-000000000000")).toBe("aabbcc");
  });
});

// ---------------------------------------------------------------------------
// looksLikeUuid
// ---------------------------------------------------------------------------

describe("looksLikeUuid", () => {
  it("returns true for a lowercase canonical UUID", () => {
    expect(looksLikeUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("returns true for an uppercase canonical UUID (case-insensitive regex)", () => {
    expect(looksLikeUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  it("returns false for a slug string", () => {
    expect(looksLikeUuid("some-slug")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(looksLikeUuid("")).toBe(false);
  });

  it("returns false for a partial UUID (too short)", () => {
    expect(looksLikeUuid("550e8400")).toBe(false);
  });

  it("returns false for a prefixed slug that contains UUID-like chars", () => {
    expect(looksLikeUuid("p-550e84")).toBe(false);
  });
});
