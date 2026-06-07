/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import { type UnknownGapEntry, withGaps } from "./history-gaps.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TestWindow {
  from: string | null;
  to: string | null;
  label: string;
}

function makeKnown(w: TestWindow): { kind: "known"; label: string; from: string | null; to: string | null } {
  return { from: w.from, kind: "known", label: w.label, to: w.to };
}

function gap(from: string | null, to: string | null): UnknownGapEntry {
  return { from, kind: "unknown-gap", to };
}

function known(label: string, from: string | null, to: string | null) {
  return { from, kind: "known", label, to };
}

// ---------------------------------------------------------------------------
// withGaps
// ---------------------------------------------------------------------------

describe("withGaps", () => {
  it("returns empty array for empty input", () => {
    expect(withGaps([], makeKnown)).toStrictEqual([]);
  });

  it("returns just the known entry for a single open window (from=null, to=null) — no gaps", () => {
    const windows: TestWindow[] = [{ from: null, label: "a", to: null }];
    expect(withGaps(windows, makeKnown)).toStrictEqual([known("a", null, null)]);
  });

  it("emits a between-gap when two windows are disjoint (prevTo < nextFrom)", () => {
    // Both windows have known `from` → leading gap prepended before window A.
    // Window B is closed → trailing gap appended after window B.
    const windows: TestWindow[] = [
      { from: "2020-01-01T00:00:00.000Z", label: "a", to: "2020-01-10T00:00:00.000Z" },
      { from: "2020-02-01T00:00:00.000Z", label: "b", to: "2020-03-01T00:00:00.000Z" },
    ];
    expect(withGaps(windows, makeKnown)).toStrictEqual([
      gap(null, "2020-01-01T00:00:00.000Z"),
      known("a", "2020-01-01T00:00:00.000Z", "2020-01-10T00:00:00.000Z"),
      gap("2020-01-10T00:00:00.000Z", "2020-02-01T00:00:00.000Z"),
      known("b", "2020-02-01T00:00:00.000Z", "2020-03-01T00:00:00.000Z"),
      gap("2020-03-01T00:00:00.000Z", null),
    ]);
  });

  it("does NOT emit a between-gap when two windows are adjacent (prevTo === nextFrom)", () => {
    // Both windows have known `from` → leading gap before A.
    // Last window B is closed → trailing gap after B.
    const windows: TestWindow[] = [
      { from: "2020-01-01T00:00:00.000Z", label: "a", to: "2020-02-01T00:00:00.000Z" },
      { from: "2020-02-01T00:00:00.000Z", label: "b", to: "2020-03-01T00:00:00.000Z" },
    ];
    expect(withGaps(windows, makeKnown)).toStrictEqual([
      gap(null, "2020-01-01T00:00:00.000Z"),
      known("a", "2020-01-01T00:00:00.000Z", "2020-02-01T00:00:00.000Z"),
      known("b", "2020-02-01T00:00:00.000Z", "2020-03-01T00:00:00.000Z"),
      gap("2020-03-01T00:00:00.000Z", null),
    ]);
  });

  it("does NOT emit a between-gap when two windows overlap (prevTo > nextFrom)", () => {
    // Both windows have known `from` → leading gap before A.
    // Last window B is closed → trailing gap after B.
    const windows: TestWindow[] = [
      { from: "2020-01-01T00:00:00.000Z", label: "a", to: "2020-02-15T00:00:00.000Z" },
      { from: "2020-02-01T00:00:00.000Z", label: "b", to: "2020-03-01T00:00:00.000Z" },
    ];
    expect(withGaps(windows, makeKnown)).toStrictEqual([
      gap(null, "2020-01-01T00:00:00.000Z"),
      known("a", "2020-01-01T00:00:00.000Z", "2020-02-15T00:00:00.000Z"),
      known("b", "2020-02-01T00:00:00.000Z", "2020-03-01T00:00:00.000Z"),
      gap("2020-03-01T00:00:00.000Z", null),
    ]);
  });

  it("emits a leading-gap {from:null, to:firstFrom} when the first window has a known lower bound", () => {
    const windows: TestWindow[] = [
      { from: "2020-01-05T00:00:00.000Z", label: "a", to: "2020-02-01T00:00:00.000Z" },
    ];
    expect(withGaps(windows, makeKnown)).toStrictEqual([
      gap(null, "2020-01-05T00:00:00.000Z"),
      known("a", "2020-01-05T00:00:00.000Z", "2020-02-01T00:00:00.000Z"),
      gap("2020-02-01T00:00:00.000Z", null),
    ]);
  });

  it("does NOT emit a leading-gap when first window from=null (unknown lower bound)", () => {
    const windows: TestWindow[] = [
      { from: null, label: "a", to: "2020-02-01T00:00:00.000Z" },
    ];
    expect(withGaps(windows, makeKnown)).toStrictEqual([
      known("a", null, "2020-02-01T00:00:00.000Z"),
      gap("2020-02-01T00:00:00.000Z", null),
    ]);
  });

  it("emits a trailing-gap {from:lastTo, to:null} when the last window is closed (to !== null)", () => {
    const windows: TestWindow[] = [
      { from: "2020-01-01T00:00:00.000Z", label: "a", to: "2020-03-01T00:00:00.000Z" },
    ];
    const result = withGaps(windows, makeKnown);
    const last = result.at(-1);
    expect(last).toStrictEqual(gap("2020-03-01T00:00:00.000Z", null));
  });

  it("does NOT emit a trailing-gap when the last window is open (to=null — ongoing)", () => {
    const windows: TestWindow[] = [
      { from: "2020-01-01T00:00:00.000Z", label: "a", to: null },
    ];
    expect(withGaps(windows, makeKnown)).toStrictEqual([
      gap(null, "2020-01-01T00:00:00.000Z"),
      known("a", "2020-01-01T00:00:00.000Z", null),
    ]);
  });

  it("handles a window where both from and to are null (all-unknown bounds)", () => {
    // from=null: no leading gap; to=null: no trailing gap
    const windows: TestWindow[] = [{ from: null, label: "a", to: null }];
    expect(withGaps(windows, makeKnown)).toStrictEqual([
      known("a", null, null),
    ]);
  });

  it("correctly sequences: leading-gap, multiple known entries with between-gap, trailing-gap", () => {
    const windows: TestWindow[] = [
      { from: "2020-01-01T00:00:00.000Z", label: "a", to: "2020-02-01T00:00:00.000Z" },
      { from: "2020-03-01T00:00:00.000Z", label: "b", to: "2020-04-01T00:00:00.000Z" },
    ];
    expect(withGaps(windows, makeKnown)).toStrictEqual([
      gap(null, "2020-01-01T00:00:00.000Z"),
      known("a", "2020-01-01T00:00:00.000Z", "2020-02-01T00:00:00.000Z"),
      gap("2020-02-01T00:00:00.000Z", "2020-03-01T00:00:00.000Z"),
      known("b", "2020-03-01T00:00:00.000Z", "2020-04-01T00:00:00.000Z"),
      gap("2020-04-01T00:00:00.000Z", null),
    ]);
  });
});
