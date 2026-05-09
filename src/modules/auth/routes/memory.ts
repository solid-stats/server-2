/* eslint-disable max-classes-per-file, unicorn/no-null */
import { randomUUID } from "node:crypto";

import type {
  AuthSession,
  AuthUser,
  AuthUserRepository,
  SessionStore,
  SteamIdentity,
} from "./models.js";

const MILLISECONDS_PER_SECOND = 1000;

export class InMemoryAuthUserRepository implements AuthUserRepository {
  private readonly usersById = new Map<string, AuthUser>();

  private readonly usersBySteamId = new Map<string, AuthUser>();

  public constructor(private readonly bootstrapAdminSteamId = "") {}

  public async findById(id: string): Promise<AuthUser | null> {
    return this.usersById.get(id) ?? null;
  }

  public async listUsers(): Promise<AuthUser[]> {
    return [...this.usersById.values()].toSorted((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }

  public async setUserRoles(
    id: string,
    roles: string[],
  ): Promise<AuthUser | null> {
    const user = this.usersById.get(id);
    if (user === undefined) {
      return null;
    }
    const updated = {
      ...user,
      roles: this.bootstrapRoles(user.steamId, roles),
    };
    this.usersById.set(updated.id, updated);
    this.usersBySteamId.set(updated.steamId, updated);
    return updated;
  }

  public async upsertSteamUser(identity: SteamIdentity): Promise<AuthUser> {
    const existing = this.usersBySteamId.get(identity.steamId);
    if (existing !== undefined) {
      const updated = {
        ...existing,
        displayName: identity.displayName,
        roles: this.bootstrapRoles(identity.steamId, existing.roles),
      };
      this.usersById.set(updated.id, updated);
      this.usersBySteamId.set(updated.steamId, updated);
      return updated;
    }

    const created = {
      displayName: identity.displayName,
      id: randomUUID(),
      roles: this.bootstrapRoles(identity.steamId, []),
      steamId: identity.steamId,
    };
    this.usersById.set(created.id, created);
    this.usersBySteamId.set(created.steamId, created);
    return created;
  }

  private bootstrapRoles(steamId: string, roles: string[]): string[] {
    const uniqueRoles = new Set(roles);
    if (steamId === this.bootstrapAdminSteamId) {
      uniqueRoles.add("admin");
    }
    return [...uniqueRoles].toSorted();
  }
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, AuthSession>();

  public async create(
    userId: string,
    ttlSeconds: number,
  ): Promise<AuthSession> {
    const session = {
      expiresAt: new Date(Date.now() + ttlSeconds * MILLISECONDS_PER_SECOND),
      id: randomUUID(),
      userId,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  public async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  public async get(id: string): Promise<AuthSession | null> {
    const session = this.sessions.get(id);
    if (session === undefined) {
      return null;
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    return session;
  }
}
