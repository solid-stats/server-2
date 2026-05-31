/**
 * Keyset (seek) predicate builder over a possibly-aggregate, possibly-NULL sort
 * key with a unique `id` tie-breaker.
 *
 * The emitted predicate is the EXPANDED-OR form (not a row-value tuple
 * comparison `(a,b) > ($1,$2)`), because the sort tuple `(S <dir>, id ASC)` is
 * mixed-direction and `S` may be NULL — both break tuple comparison's
 * three-valued logic (14-RESEARCH Pattern 1, Pitfall 2).
 *
 * Placement is the CALLER's decision: for an aggregate sort key (e.g.
 * `sum(...) as kills`) the fragment belongs in `HAVING` (the aggregate is not
 * available in `WHERE`, Pitfall 1); for a stored-column sort key (e.g.
 * `bounty.points`) the same fragment is valid in `WHERE`. The builder only
 * parameterizes — it never decides placement and never interpolates a raw
 * request value (only the fixed `expr` plus `$n` placeholders).
 */
export interface KeysetDescriptor {
  /** Fixed, server-chosen SQL expression for the sort key (never raw input). */
  expr: string;
  /** Whether the bound value placeholder needs an `::int` cast. */
  numeric: boolean;
  /** Whether the sort expression can yield NULL rows (drives the NULL branches). */
  nullable: boolean;
}

/** The last row's sort value + id, decoded from the cursor. */
export interface KeysetCursorState {
  value: number | string | null;
  id: string;
}

/** Placement-independent inputs for {@link buildKeysetPredicate}. */
export interface KeysetOptions {
  /** Decoded cursor state; omit/undefined for the first page. */
  after: KeysetCursorState | undefined;
  /** The unique tie-breaker column appended ASC to make the tuple unique. */
  idColumn: string;
  /** 1-based `$n` index the value placeholder starts at (id takes the next). */
  startParameterIndex: number;
}

export interface KeysetPredicate {
  /** Seek fragment, or `null` for the first page (caller places it in HAVING/WHERE). */
  havingSql: string | null;
  orderBySql: string;
  values: (number | string | null)[];
}

function orderBy(
  expr: string,
  order: "asc" | "desc",
  idColumn: string,
): string {
  const direction = order === "desc" ? "DESC NULLS LAST" : "ASC NULLS FIRST";
  return `${expr} ${direction}, ${idColumn} ASC`;
}

/**
 * Build the seek predicate + stable ORDER BY for a single sort key.
 *
 * First page (`after` undefined): `havingSql = null`, `values = []`, ORDER BY
 * only. With a cursor: a 4-branch expanded-OR predicate using `$n` placeholders
 * starting at `startParamIndex`, and `values` bound as `[value, id]` in the
 * same order as the placeholders.
 */
export function buildKeysetPredicate(
  descriptor: KeysetDescriptor,
  order: "asc" | "desc",
  options: KeysetOptions,
): KeysetPredicate {
  const { after, idColumn, startParameterIndex } = options,
    orderBySql = orderBy(descriptor.expr, order, idColumn);
  if (after === undefined) {
    // eslint-disable-next-line unicorn/no-null -- contract: null means "no HAVING fragment"
    return { havingSql: null, orderBySql, values: [] };
  }

  const sortExpr = descriptor.expr,
    valuePlaceholder = `$${String(startParameterIndex)}${descriptor.numeric ? "::int" : ""}`,
    idPlaceholder = `$${String(startParameterIndex + 1)}`,
    comparison = order === "desc" ? "<" : ">",
    // Branch 2 differs by direction: for DESC (NULLS LAST) a null row comes
    // AFTER a non-null cursor; for ASC (NULLS FIRST) a non-null row comes
    // AFTER a null cursor.
    nullTransitionBranch =
      order === "desc"
        ? `(${sortExpr} IS NULL AND ${valuePlaceholder} IS NOT NULL)`
        : `(${sortExpr} IS NOT NULL AND ${valuePlaceholder} IS NULL)`,
    havingSql = [
      `(${sortExpr} IS NOT NULL AND ${valuePlaceholder} IS NOT NULL AND ${sortExpr} ${comparison} ${valuePlaceholder})`,
      nullTransitionBranch,
      `(${sortExpr} = ${valuePlaceholder} AND ${idColumn} > ${idPlaceholder})`,
      `(${sortExpr} IS NULL AND ${valuePlaceholder} IS NULL AND ${idColumn} > ${idPlaceholder})`,
    ].join("\n  OR ");

  return {
    havingSql: `(\n  ${havingSql}\n)`,
    orderBySql,
    values: [after.value, after.id],
  };
}
