/* eslint-disable camelcase, no-use-before-define, unicorn/no-null -- DB row shapes use snake_case; nullable ends_at mirrors the column */
import { describe, expect, it } from "vitest";

import { PgAdminRotationRepository } from "../rotation-repository.js";

import type { Pool, QueryResult, QueryResultRow } from "pg";

const ROTATION_ROW = {
  ends_at: "2026-02-01T00:00:00+00:00",
  id: "rotation-1",
  name: "Winter 2026",
  slug: "winter-2026",
  starts_at: "2026-01-01T00:00:00+00:00",
};

describe("PgAdminRotationRepository.createRotation", () => {
  it("creates a rotation with a server-derived slug", async () => {
    const client = new ScriptedClient({ rotationRow: ROTATION_ROW }),
      repository = new PgAdminRotationRepository(poolWith(client));

    await expect(
      repository.createRotation({
        endsAt: "2026-02-01T00:00:00+00:00",
        name: "Winter 2026",
        startsAt: "2026-01-01T00:00:00+00:00",
      }),
    ).resolves.toEqual({
      rotation: {
        endsAt: "2026-02-01T00:00:00+00:00",
        id: "rotation-1",
        name: "Winter 2026",
        slug: "winter-2026",
        startsAt: "2026-01-01T00:00:00+00:00",
      },
      status: "created",
    });
    expect(client.sql()).toContain("slug_base($1)");
    expect(client.sql()).toContain("commit");
  });

  it("maps a duplicate name (23505) to a name_conflict signal", async () => {
    const client = new ScriptedClient({ failWith: "23505" }),
      repository = new PgAdminRotationRepository(poolWith(client));

    await expect(
      repository.createRotation(createInput()),
    ).resolves.toEqual({ signal: "name_conflict", status: "constraint" });
    expect(client.sql()).toContain("rollback");
  });

  it("maps a bad date range (23514) to an invalid_range signal", async () => {
    const client = new ScriptedClient({ failWith: "23514" }),
      repository = new PgAdminRotationRepository(poolWith(client));

    await expect(
      repository.createRotation(createInput()),
    ).resolves.toEqual({ signal: "invalid_range", status: "constraint" });
    expect(client.sql()).toContain("rollback");
  });

  it("rethrows unexpected pg errors", async () => {
    const client = new ScriptedClient({ failWith: "08006" }),
      repository = new PgAdminRotationRepository(poolWith(client));

    await expect(repository.createRotation(createInput())).rejects.toThrow();
  });
});

describe("PgAdminRotationRepository.updateRotation", () => {
  it("full-replaces a rotation and regenerates the slug", async () => {
    const client = new ScriptedClient({ rotationRow: ROTATION_ROW }),
      repository = new PgAdminRotationRepository(poolWith(client));

    await expect(
      repository.updateRotation("rotation-1", createInput()),
    ).resolves.toEqual({
      rotation: {
        endsAt: "2026-02-01T00:00:00+00:00",
        id: "rotation-1",
        name: "Winter 2026",
        slug: "winter-2026",
        startsAt: "2026-01-01T00:00:00+00:00",
      },
      status: "updated",
    });
    expect(client.sql()).toContain("set name = $2");
    expect(client.sql()).toContain("slug = slug_base($2)");
  });

  it("returns not_found for an unknown id", async () => {
    const client = new ScriptedClient({ rotationRow: null }),
      repository = new PgAdminRotationRepository(poolWith(client));

    await expect(
      repository.updateRotation("missing", createInput()),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("maps a duplicate name (23505) to a name_conflict signal", async () => {
    const client = new ScriptedClient({ failWith: "23505" }),
      repository = new PgAdminRotationRepository(poolWith(client));

    await expect(
      repository.updateRotation("rotation-1", createInput()),
    ).resolves.toEqual({ signal: "name_conflict", status: "constraint" });
  });
});

describe("PgAdminRotationRepository.deleteRotation", () => {
  it("refuses to delete a rotation with dependents", async () => {
    const client = new ScriptedClient({ dependentRows: 1 }),
      repository = new PgAdminRotationRepository(poolWith(client));

    await expect(repository.deleteRotation("rotation-1")).resolves.toEqual({
      status: "has_dependents",
    });
    expect(client.sql()).toContain("from replays where rotation_id = $1");
    expect(client.sql()).toContain("commander_side_stats");
    expect(client.sql()).toContain("bounty_points");
    expect(client.sql()).not.toContain("delete from rotations");
  });

  it("deletes an empty rotation", async () => {
    const client = new ScriptedClient({ deletedRows: 1, dependentRows: 0 }),
      repository = new PgAdminRotationRepository(poolWith(client));

    await expect(repository.deleteRotation("rotation-1")).resolves.toEqual({
      status: "deleted",
    });
    expect(client.sql()).toContain("delete from rotations where id = $1");
    expect(client.sql()).toContain("commit");
  });

  it("returns not_found when no rotation row is deleted", async () => {
    const client = new ScriptedClient({ deletedRows: 0, dependentRows: 0 }),
      repository = new PgAdminRotationRepository(poolWith(client));

    await expect(repository.deleteRotation("missing")).resolves.toEqual({
      status: "not_found",
    });
  });
});

function createInput() {
  return {
    endsAt: "2026-02-01T00:00:00+00:00",
    name: "Winter 2026",
    startsAt: "2026-01-01T00:00:00+00:00",
  };
}

function poolWith(client: ScriptedClient): Pool {
  return {
    async connect() {
      return client;
    },
  } as unknown as Pool;
}

interface RotationRowShape {
  ends_at: string | null;
  id: string;
  name: string;
  slug: string;
  starts_at: string;
}

interface ScriptedClientOptions {
  deletedRows?: number;
  dependentRows?: number;
  failWith?: string;
  rotationRow?: RotationRowShape | null;
}

class ScriptedClient {
  private readonly queries: string[] = [];

  public constructor(private readonly options: ScriptedClientOptions = {}) {}

  public async query<T extends QueryResultRow>(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<QueryResult<T>> {
    void parameters;
    this.queries.push(sql.trim());
    if (
      this.options.failWith !== undefined &&
      (sql.includes("insert into rotations") ||
        sql.includes("update rotations"))
    ) {
      throw pgError(this.options.failWith);
    }
    if (sql.includes("insert into rotations")) {
      return rows(rotationResult(this.options.rotationRow) as T[]);
    }
    if (sql.includes("update rotations")) {
      return rows(rotationResult(this.options.rotationRow) as T[]);
    }
    if (sql.includes("union all")) {
      return countResult<T>(this.options.dependentRows ?? 0);
    }
    if (sql.includes("delete from rotations")) {
      return countResult<T>(this.options.deletedRows ?? 0);
    }
    return rows<T>([]);
  }

  public release(): void {
    this.queries.push("release");
  }

  public sql(): string {
    return this.queries.join("\n");
  }
}

function rotationResult(row: RotationRowShape | null | undefined): unknown[] {
  if (row === null) {
    return [];
  }
  return [row ?? ROTATION_ROW];
}

function pgError(code: string): Error & { code: string } {
  const error = new Error(`pg error ${code}`) as Error & { code: string };
  error.code = code;
  return error;
}

function rows<T extends QueryResultRow>(data: T[]): QueryResult<T> {
  return {
    command: "",
    fields: [],
    oid: 0,
    rowCount: data.length,
    rows: data,
  };
}

function countResult<T extends QueryResultRow>(count: number): QueryResult<T> {
  return {
    command: "",
    fields: [],
    oid: 0,
    rowCount: count,
    rows: [],
  };
}
