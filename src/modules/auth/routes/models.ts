export interface AuthRouteOptions {
  cookie: SessionCookieOptions;
  publicBaseUrl: string;
  sessions: SessionStore;
  steam: SteamOpenIdAdapter;
  users: AuthUserRepository;
}

export interface SessionCookieOptions {
  name: string;
  ttlSeconds: number;
}

export interface SteamLoginUrlInput {
  realm: string;
  returnTo: string;
}

export interface SteamOpenIdAdapter {
  loginUrl(input: SteamLoginUrlInput): URL;
  verifyCallback(
    query: Readonly<Record<string, string>>,
  ): Promise<SteamIdentity>;
}

export interface SteamIdentity {
  displayName: string;
  steamId: string;
}

export interface AuthUser {
  displayName: string;
  id: string;
  roles: string[];
  steamId: string;
}

export interface AuthUserRepository {
  findById(id: string): Promise<AuthUser | null>;
  listUsers(): Promise<AuthUser[]>;
  setUserRoles(id: string, roles: string[]): Promise<AuthUser | null>;
  upsertSteamUser(identity: SteamIdentity): Promise<AuthUser>;
}

export interface AuthSession {
  expiresAt: Date;
  id: string;
  userId: string;
}

export interface SessionStore {
  create(userId: string, ttlSeconds: number): Promise<AuthSession>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<AuthSession | null>;
}
