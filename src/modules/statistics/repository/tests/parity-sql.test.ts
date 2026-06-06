import { describe, expect, it } from "vitest";

import {
  playerStatsSql,
  relationshipsSql,
  squadStatsSql,
  weaponsSql,
  weeksSql,
  type ParitySqlQuery,
} from "../parity-sql.js";

interface SurfaceCase {
  builder: (scope?: { scopeId: string }) => ParitySqlQuery;
  loadBearing: string;
  name: string;
}

const HEADER_PREFIX_LENGTH = 40;

const surfaces: SurfaceCase[] = [
  {
    builder: playerStatsSql,
    loadBearing: "counter_totals",
    name: "playerStatsSql",
  },
  {
    builder: squadStatsSql,
    loadBearing: "select\n  squad.id",
    name: "squadStatsSql",
  },
  {
    builder: relationshipsSql,
    loadBearing: "kill_events",
    name: "relationshipsSql",
  },
  {
    builder: weaponsSql,
    loadBearing: "case when event.event_type",
    name: "weaponsSql",
  },
  { builder: weeksSql, loadBearing: "week desc", name: "weeksSql" },
];

describe("parity-sql builders", () => {
  describe.each(surfaces)("$name", ({ builder, loadBearing }) => {
    it("Unscoped query keeps its load-bearing routing substring", () => {
      const { sql, values } = builder();
      expect(sql.trim()).toContain(loadBearing);
      expect(values).toEqual([]);
    });

    it("Scoped query adds exactly one parameter placeholder and value", () => {
      const scopeId = "00000000-0000-0000-0000-000000000001";
      const { sql, values } = builder({ scopeId });
      const placeholders = sql.match(/\$1\b/gu) ?? [];
      expect(placeholders).toHaveLength(1);
      expect(values).toEqual([scopeId]);
    });

    it("Scoped query is the unscoped query plus one predicate, not an outer wrapper", () => {
      const scopeId = "00000000-0000-0000-0000-000000000001";
      const unscoped = builder().sql;
      const scoped = builder({ scopeId }).sql;
      expect(scoped.length).toBeGreaterThan(unscoped.length);
      // The unscoped select header is preserved verbatim at the start (no outer
      // `select ... from ( <unscoped> )` wrapper that would rewrite the leading SQL).
      const header = unscoped.trimStart().slice(0, HEADER_PREFIX_LENGTH);
      expect(scoped.trimStart().startsWith(header)).toBe(true);
      // The scoped form still keeps the load-bearing substring intact.
      expect(scoped.trim()).toContain(loadBearing);
    });
  });

  it("Scope predicate is parameterized, never string-concatenated", () => {
    const scopeId = "'; drop table players; --";
    for (const { builder } of surfaces) {
      const { sql, values } = builder({ scopeId });
      expect(sql).not.toContain(scopeId);
      expect(values).toEqual([scopeId]);
    }
  });
});
