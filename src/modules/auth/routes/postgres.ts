/* eslint-disable max-classes-per-file, unicorn/no-null */
import { randomUUID } from "node:crypto";

import type {
  AuthSession,
  AuthUser,
  AuthUserRepository,
  SessionStore,
  SteamIdentity,
} from "./models.js";
import type { Pool, PoolClient } from "pg";

const MILLISECONDS_PER_SECOND = 1000;

interface AuthUserRow {
  display_name: string;
  id: string;
  roles: string[];
  steam_id: string;
}

interface AuthSessionRow {
  expires_at: Date;
  id: string;
  user_id: string;
}

export class PgAuthUserRepository implements AuthUserRepository {
  public constructor(
    private readonly pool: Pool,
    private readonly bootstrapAdminSteamId = "",
  ) {}

  public async findById(id: string): Promise<AuthUser | null> {
    const result = await this.pool.query<AuthUserRow>(userQuery("u.id = $1"), [
      id,
    ]);
    const [row] = result.rows;
    return row === undefined ? null : mapUser(row);
  }

  public async listUsers(): Promise<AuthUser[]> {
    const result = await this.pool.query<AuthUserRow>(
      `${userQuery("true")} order by u.display_name, u.id`,
    );
    return result.rows.map((row) => mapUser(row));
  }

  public async setUserRoles(
    id: string,
    roles: string[],
  ): Promise<AuthUser | null> {
    return this.withClient(async (client) => {
      const user = await findUserByIdWithClient(client, id);
      if (user === null) {
        return null;
      }
      const effectiveRoles = this.bootstrapRoles(user.steamId, roles);
      await setUserRolesWithClient(client, id, effectiveRoles);
      return await getUserByIdWithClient(client, id);
    });
  }

  public async upsertSteamUser(identity: SteamIdentity): Promise<AuthUser> {
    return this.withClient(async (client) => {
      const result = await client.query<AuthUserRow>(
        `
          insert into users (steam_id, display_name)
          values ($1, $2)
          on conflict (steam_id) do update
            set display_name = excluded.display_name,
                updated_at = now()
          returning id::text, steam_id, display_name, '{}'::text[] as roles
        `,
        [identity.steamId, identity.displayName],
      );
      const user = mapUser(firstRow(result.rows)),
        roles = this.bootstrapRoles(user.steamId, user.roles);
      if (roles.length > 0) {
        await setUserRolesWithClient(client, user.id, roles);
      }
      return await getUserByIdWithClient(client, user.id);
    });
  }

  private bootstrapRoles(steamId: string, roles: string[]): string[] {
    const uniqueRoles = new Set(roles);
    if (steamId === this.bootstrapAdminSteamId) {
      uniqueRoles.add("admin");
    }
    return [...uniqueRoles].toSorted();
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

export class PgSessionStore implements SessionStore {
  public constructor(private readonly pool: Pool) {}

  public async create(
    userId: string,
    ttlSeconds: number,
  ): Promise<AuthSession> {
    const id = randomUUID(),
      expiresAt = new Date(Date.now() + ttlSeconds * MILLISECONDS_PER_SECOND),
      result = await this.pool.query<AuthSessionRow>(
        `
          insert into auth_sessions (id, user_id, expires_at)
          values ($1, $2, $3)
          returning id::text, user_id::text, expires_at
        `,
        [id, userId, expiresAt],
      );
    return mapSession(firstRow(result.rows));
  }

  public async delete(id: string): Promise<void> {
    await this.pool.query("delete from auth_sessions where id = $1", [id]);
  }

  public async get(id: string): Promise<AuthSession | null> {
    const result = await this.pool.query<AuthSessionRow>(
      `
        delete from auth_sessions
        where id = $1 and expires_at <= now()
        returning id::text, user_id::text, expires_at
      `,
      [id],
    );
    if (result.rowCount !== 0) {
      return null;
    }
    const session = await this.pool.query<AuthSessionRow>(
      `
        select id::text, user_id::text, expires_at
        from auth_sessions
        where id = $1
      `,
      [id],
    );
    const [row] = session.rows;
    return row === undefined ? null : mapSession(row);
  }
}

async function ensureRoles(
  client: Pool | PoolClient,
  roles: string[],
): Promise<void> {
  for (const role of roles) {
    await client.query(
      "insert into roles (name) values ($1) on conflict (name) do nothing",
      [role],
    );
  }
}

async function findUserByIdWithClient(
  client: PoolClient,
  id: string,
): Promise<AuthUser | null> {
  const result = await client.query<AuthUserRow>(userQuery("u.id = $1"), [id]);
  const [row] = result.rows;
  return row === undefined ? null : mapUser(row);
}

async function getUserByIdWithClient(
  client: PoolClient,
  id: string,
): Promise<AuthUser> {
  const result = await client.query<AuthUserRow>(userQuery("u.id = $1"), [id]);
  return mapUser(firstRow(result.rows));
}

async function setUserRolesWithClient(
  client: PoolClient,
  id: string,
  roles: string[],
): Promise<void> {
  await ensureRoles(client, roles);
  await client.query(
    "update user_roles set revoked_at = now() where user_id = $1 and revoked_at is null",
    [id],
  );
  for (const role of roles) {
    await client.query(
      `
        insert into user_roles (user_id, role_id)
        select $1, roles.id from roles where roles.name = $2
      `,
      [id, role],
    );
  }
}

function userQuery(where: string): string {
  return `
    select u.id::text, u.steam_id, u.display_name,
      coalesce(
        array_agg(r.name order by r.name)
          filter (where r.name is not null and ur.revoked_at is null),
        '{}'::text[]
      ) as roles
    from users u
    left join user_roles ur on ur.user_id = u.id and ur.revoked_at is null
    left join roles r on r.id = ur.role_id
    where ${where}
    group by u.id, u.steam_id, u.display_name
  `;
}

function mapUser(row: AuthUserRow): AuthUser {
  return {
    displayName: row.display_name,
    id: row.id,
    roles: row.roles,
    steamId: row.steam_id,
  };
}

function mapSession(row: AuthSessionRow): AuthSession {
  return {
    expiresAt: row.expires_at,
    id: row.id,
    userId: row.user_id,
  };
}

function firstRow<T>(rows: T[]): T {
  return (rows as [T, ...T[]])[0];
}
