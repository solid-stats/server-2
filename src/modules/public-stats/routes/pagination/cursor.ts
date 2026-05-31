import { BadCursorError } from "./errors.js";

/**
 * Opaque keyset cursor payload. Encoded as base64url of its JSON form — UNSIGNED:
 * the cursor carries no secret, so integrity is enforced by structural
 * validation on decode (shape, `order` enum, `sort` against the endpoint
 * whitelist, `values` arity + primitive types), never by a signature.
 */
export interface CursorPayload {
  sort: string;
  order: "asc" | "desc";
  values: (number | string | null)[];
  id: string;
}

/**
 * Encode a cursor payload to a base64url token using Node's built-in Buffer
 * (zero new dependencies; `base64url` is native since Node 15).
 */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function isPrimitiveSortValue(value: unknown): value is number | string | null {
  return (
    value === null || typeof value === "number" || typeof value === "string"
  );
}

/**
 * Decode and structurally validate a base64url cursor token.
 *
 * Throws {@link BadCursorError} on any failure branch (malformed base64url,
 * non-JSON, non-object, bad/absent `id`, `order` outside {"asc","desc"}, `sort`
 * not in `allowedSorts`, `values` not an array, wrong arity, or a non-primitive
 * `values` element). Never returns a partially-valid payload and never throws a
 * raw value. The thrown message is a fixed reason string — it never echoes the
 * decoded input.
 *
 * @param allowedSorts - the endpoint's sort whitelist; the encoded `sort` must
 *   belong to it (also guards against resuming a cursor on the wrong endpoint).
 * @param expectedArity - the sort tuple length (`values.length` must match).
 */
export function decodeCursor(
  token: string,
  allowedSorts: readonly string[],
  expectedArity: number,
): CursorPayload {
  const raw = parseCursorJson(token);
  if (typeof raw !== "object" || raw === null) {
    throw new BadCursorError("bad cursor shape");
  }

  const { id, order, sort, values } = raw as Record<string, unknown>;
  if (typeof id !== "string") {
    throw new BadCursorError("bad cursor id");
  }
  if (order !== "asc" && order !== "desc") {
    throw new BadCursorError("bad cursor order");
  }
  if (typeof sort !== "string" || !allowedSorts.includes(sort)) {
    throw new BadCursorError("bad cursor sort");
  }
  if (!Array.isArray(values) || values.length !== expectedArity) {
    throw new BadCursorError("bad cursor values arity");
  }
  for (const value of values) {
    if (!isPrimitiveSortValue(value)) {
      throw new BadCursorError("bad cursor value type");
    }
  }

  return { id, order, sort, values: values as (number | string | null)[] };
}

function parseCursorJson(token: string): unknown {
  try {
    return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new BadCursorError("malformed cursor");
  }
}
