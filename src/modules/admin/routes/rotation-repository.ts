import type {
  AdminRotationRepository,
  AdminRotationRow,
  CreateRotationInput,
  CreateRotationResult,
  DeleteRotationResult,
  RotationConstraintSignal,
  UpdateRotationInput,
  UpdateRotationResult,
} from "./models.js";
import type { Pool, PoolClient } from "pg";

const PG_UNIQUE_VIOLATION = "23505";
const PG_CHECK_VIOLATION = "23514";

interface RotationRow {
  ends_at: string | null;
  id: string;
  name: string;
  slug: string;
  starts_at: string;
}

/**
 * Transactional, Pool-injected admin rotation repository (API-04 / D-04).
 *
 * - Every write runs inside `withClient` (begin/commit/rollback/release), mirroring
 *   `PgRequestWorkflowApplier`.
 * - The slug is ALWAYS server-derived via `slug_base($1)` in SQL — never client-supplied
 *   (mass-assignment guard, T-18-09).
 * - All values are `$n`-bound; no string interpolation (T-18-07).
 * - DB constraints are the source of truth: name UNIQUE (`23505`) → `name_conflict`,
 *   the `ends_at > starts_at` CHECK (`23514`) → `invalid_range` (T-18-10). Slug collision
 *   also surfaces as `23505` (uq_rotations_slug) and is reported as `name_conflict`,
 *   since a colliding slug is a consequence of a colliding name.
 * - Delete only removes EMPTY rotations: a dependency pre-check across
 *   replays/commander_side_stats/bounty_points runs in the SAME transaction; any
 *   dependent row → `has_dependents`, no delete (T-18-08).
 */
export class PgAdminRotationRepository implements AdminRotationRepository {
  public constructor(private readonly pool: Pool) {}

  public async createRotation(
    input: CreateRotationInput,
  ): Promise<CreateRotationResult> {
    try {
      return await this.withClient(async (client) => {
        const result = await client.query<RotationRow>(
          `
            insert into rotations (name, starts_at, ends_at, slug)
            values ($1, $2, $3, slug_base($1))
            returning
              id::text,
              name,
              slug,
              starts_at::text as starts_at,
              ends_at::text as ends_at
          `,
          [input.name, input.startsAt, input.endsAt],
        );
        return {
          rotation: toRotationRow(firstRow(result.rows)),
          status: "created" as const,
        };
      });
    } catch (error) {
      const signal = constraintSignal(error);
      if (signal !== undefined) {
        return { signal, status: "constraint" };
      }
      throw error;
    }
  }

  public async updateRotation(
    id: string,
    input: UpdateRotationInput,
  ): Promise<UpdateRotationResult> {
    try {
      return await this.withClient(async (client) => {
        const result = await client.query<RotationRow>(
          `
            update rotations
            set name = $2, starts_at = $3, ends_at = $4, slug = slug_base($2)
            where id = $1
            returning
              id::text,
              name,
              slug,
              starts_at::text as starts_at,
              ends_at::text as ends_at
          `,
          [id, input.name, input.startsAt, input.endsAt],
        );
        const [row] = result.rows;
        if (row === undefined) {
          return { status: "not_found" as const };
        }
        return {
          rotation: toRotationRow(row),
          status: "updated" as const,
        };
      });
    } catch (error) {
      const signal = constraintSignal(error);
      if (signal !== undefined) {
        return { signal, status: "constraint" };
      }
      throw error;
    }
  }

  public async deleteRotation(id: string): Promise<DeleteRotationResult> {
    return this.withClient(async (client) => {
      const dependents = await client.query(
        `
          select 1 from replays where rotation_id = $1
          union all
          select 1 from commander_side_stats where rotation_id = $1
          union all
          select 1 from bounty_points where rotation_id = $1
          limit 1
        `,
        [id],
      );
      if ((dependents.rowCount ?? 0) > 0) {
        return { status: "has_dependents" };
      }
      const deleted = await client.query(
        "delete from rotations where id = $1",
        [id],
      );
      if ((deleted.rowCount ?? 0) === 0) {
        return { status: "not_found" };
      }
      return { status: "deleted" };
    });
  }

  private async withClient<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await callback(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

function constraintSignal(
  error: unknown,
): RotationConstraintSignal | undefined {
  const code = pgErrorCode(error);
  if (code === PG_UNIQUE_VIOLATION) {
    return "name_conflict";
  }
  if (code === PG_CHECK_VIOLATION) {
    return "invalid_range";
  }
  return undefined;
}

function pgErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function toRotationRow(row: RotationRow): AdminRotationRow {
  return {
    endsAt: row.ends_at,
    id: row.id,
    name: row.name,
    slug: row.slug,
    startsAt: row.starts_at,
  };
}

function firstRow(rows: RotationRow[]): RotationRow {
  const [row] = rows;
  if (row === undefined) {
    throw new Error("expected inserted rotation row");
  }
  return row;
}
