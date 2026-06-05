/* eslint-disable unicorn/no-null */
import { describe, expect, it } from "vitest";

import {
  buildKeysetPredicate,
  type KeysetCursorState,
  type KeysetDescriptor,
} from "./keyset.js";

const KILLS: KeysetDescriptor = {
    expr: "coalesce(sum((stats.stats->>'kills')::integer), 0)",
    numeric: true,
    nullable: false,
  },
  NAME: KeysetDescriptor = {
    expr: "players.display_name",
    numeric: false,
    nullable: false,
  },
  NULLABLE: KeysetDescriptor = {
    expr: "some_nullable_expr",
    numeric: true,
    nullable: true,
  },
  ID_COLUMN = "players.id",
  START_INDEX = 3,
  SAMPLE_VALUE = 5,
  SAMPLE_ID = "11111111-2222-3333-4444-555555555555";

function cursor(value: number | string | null): KeysetCursorState {
  return { id: SAMPLE_ID, value };
}

describe("buildKeysetPredicate first page", () => {
  it("emits no HAVING predicate and no values when there is no cursor", () => {
    const result = buildKeysetPredicate(KILLS, "desc", {
      after: undefined,
      idColumn: ID_COLUMN,
      startParameterIndex: START_INDEX,
    });

    expect(result.havingSql).toBeNull();
    expect(result.values).toEqual([]);
  });

  it("orders DESC with NULLS LAST and an id tie-breaker on the first page", () => {
    const result = buildKeysetPredicate(KILLS, "desc", {
      after: undefined,
      idColumn: ID_COLUMN,
      startParameterIndex: START_INDEX,
    });

    expect(result.orderBySql).toBe(
      `${KILLS.expr} DESC NULLS LAST, ${ID_COLUMN} ASC`,
    );
  });

  it("orders ASC with NULLS FIRST and an id tie-breaker on the first page", () => {
    const result = buildKeysetPredicate(KILLS, "asc", {
      after: undefined,
      idColumn: ID_COLUMN,
      startParameterIndex: START_INDEX,
    });

    expect(result.orderBySql).toBe(
      `${KILLS.expr} ASC NULLS FIRST, ${ID_COLUMN} ASC`,
    );
  });
});

describe("buildKeysetPredicate DESC seek", () => {
  const result = buildKeysetPredicate(KILLS, "desc", {
    after: cursor(SAMPLE_VALUE),
    idColumn: ID_COLUMN,
    startParameterIndex: START_INDEX,
  });

  it("binds the value then the id in order", () => {
    expect(result.values).toEqual([SAMPLE_VALUE, SAMPLE_ID]);
  });

  it("uses sequential placeholders starting at startParamIndex", () => {
    expect(result.havingSql).toContain("$3::int");
    expect(result.havingSql).toContain("$4");
  });

  it("emits the four expanded-OR branches with NULLS LAST ordering", () => {
    const sql = result.havingSql ?? "";

    expect(sql).toContain("$3::int IS NOT NULL");
    expect(sql).toContain(`${KILLS.expr} < $3::int`);
    expect(sql).toContain(`${KILLS.expr} IS NULL`);
    expect(sql).toContain(`${ID_COLUMN} > $4`);
    expect(result.orderBySql).toContain("DESC NULLS LAST");
  });

  it("never emits a row-value tuple comparison", () => {
    expect(result.havingSql).not.toContain(") > (");
  });
});

describe("buildKeysetPredicate ASC seek", () => {
  const result = buildKeysetPredicate(KILLS, "asc", {
    after: cursor(SAMPLE_VALUE),
    idColumn: ID_COLUMN,
    startParameterIndex: START_INDEX,
  });

  it("emits NULLS FIRST ordering and a larger-value branch", () => {
    expect(result.orderBySql).toContain("ASC NULLS FIRST");
    expect(result.havingSql).toContain(`${KILLS.expr} > $3::int`);
  });

  it("never emits a row-value tuple comparison", () => {
    expect(result.havingSql).not.toContain(") > (");
  });
});

describe("buildKeysetPredicate value casting", () => {
  it("casts a text sort key's bound value to ::text (not ::int) so PG can type the IS NULL branches", () => {
    const result = buildKeysetPredicate(NAME, "asc", {
      after: cursor("alpha"),
      idColumn: ID_COLUMN,
      startParameterIndex: START_INDEX,
    });

    expect(result.havingSql).not.toContain("::int");
    expect(result.havingSql).toContain("$3::text IS NOT NULL");
  });
});

describe("buildKeysetPredicate nullable sort key", () => {
  const result = buildKeysetPredicate(NULLABLE, "desc", {
    after: cursor(null),
    idColumn: ID_COLUMN,
    startParameterIndex: START_INDEX,
  });

  it("emits explicit IS NULL branches even when the cursor value is null", () => {
    const sql = result.havingSql ?? "";

    expect(sql).toContain(`${NULLABLE.expr} IS NULL`);
    expect(sql).toContain("$3::int IS NULL");
    expect(sql).toContain(`${ID_COLUMN} > $4`);
  });

  it("still binds value and id in order", () => {
    expect(result.values).toEqual([null, SAMPLE_ID]);
  });
});
