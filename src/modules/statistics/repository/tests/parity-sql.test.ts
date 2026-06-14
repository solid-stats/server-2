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

describe("parity-sql per-type all-time bucket", () => {
  it("playerStatsSql bucket reads exactly the all-time row for the type and selects is_show", () => {
    const { sql, values } = playerStatsSql(undefined, { gameType: "sg" });
    expect(sql).toContain(
      "and stats.rotation_id is null and stats.game_type = $1",
    );
    expect(sql).toContain("coalesce(bool_or(stats.is_show), true) as is_show");
    expect(values).toEqual(["sg"]);
  });

  it("squadStatsSql bucket filters both the squad row and the embedded player rows", () => {
    const { sql, values } = squadStatsSql(undefined, { gameType: "mace" });
    expect(sql).toContain(
      "left join squad_stats stats on stats.squad_id = squad.id\n  and stats.rotation_id is null and stats.game_type = $1",
    );
    expect(sql).toContain(
      "and player_stat.rotation_id is null and player_stat.game_type = $1",
    );
    expect(values).toEqual(["mace"]);
  });

  it("Scoped + bucketed query numbers the bucket placeholder after the scope", () => {
    const scopeId = "00000000-0000-0000-0000-000000000001";
    const { sql, values } = playerStatsSql({ scopeId }, { gameType: "sm" });
    expect(sql).toContain("where player.id = $1::uuid");
    expect(sql).toContain(
      "and stats.rotation_id is null and stats.game_type = $2",
    );
    expect(values).toEqual([scopeId, "sm"]);
  });

  it("Omitting the bucket keeps the type-agnostic projection (no is_show, no game_type filter)", () => {
    for (const builder of [playerStatsSql, squadStatsSql]) {
      const { sql, values } = builder();
      expect(sql).not.toContain("game_type");
      expect(sql).not.toContain("is_show");
      expect(values).toEqual([]);
    }
  });
});
