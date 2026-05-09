/* eslint-disable new-cap, unicorn/no-null */
import { Type } from "@sinclair/typebox";

import { expiredSessionCookie, readCookie, sessionCookie } from "./cookies.js";

import type { AuthRouteOptions, AuthUser } from "./models.js";
import type { FastifyInstance } from "fastify";

const UNAUTHORIZED = 401;

const LoginQuery = Type.Object({
    redirectTo: Type.Optional(Type.String()),
  }),
  CallbackQuery = Type.Object({
    "openid.claimed_id": Type.Optional(Type.String()),
    "openid.mode": Type.Optional(Type.String()),
    redirectTo: Type.Optional(Type.String()),
  }),
  UserResponse = Type.Object({
    displayName: Type.String(),
    id: Type.String({ format: "uuid" }),
    roles: Type.Array(Type.String()),
    steamId: Type.String(),
  }),
  SessionResponse = Type.Object({
    authenticated: Type.Boolean(),
    user: Type.Optional(UserResponse),
  }),
  ErrorResponse = Type.Object({
    message: Type.String(),
  });

interface LoginQueryType {
  redirectTo?: string;
}

interface CallbackQueryType {
  "openid.claimed_id"?: string;
  "openid.mode"?: string;
  redirectTo?: string;
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthRouteOptions,
): Promise<void> {
  app.get<{ Querystring: LoginQueryType }>(
    "/auth/steam/login",
    {
      schema: {
        querystring: LoginQuery,
        response: { 302: Type.Null() },
        tags: ["auth"],
      },
    },
    async (request, reply) => {
      const callbackUrl = authCallbackUrl(options, request.query.redirectTo),
        loginUrl = options.steam.loginUrl({
          realm: options.publicBaseUrl,
          returnTo: callbackUrl.toString(),
        });
      return reply.redirect(loginUrl.toString());
    },
  );

  app.get<{ Querystring: CallbackQueryType }>(
    "/auth/steam/callback",
    {
      schema: {
        querystring: CallbackQuery,
        response: { 302: Type.Null(), 401: ErrorResponse },
        tags: ["auth"],
      },
    },
    async (request, reply) => {
      try {
        const identity = await options.steam.verifyCallback(
            definedQuery(request.query),
          ),
          user = await options.users.upsertSteamUser(identity),
          session = await options.sessions.create(
            user.id,
            options.cookie.ttlSeconds,
          );
        reply.header("set-cookie", sessionCookie(options.cookie, session.id));
        return await reply.redirect(safeRedirectPath(request.query.redirectTo));
      } catch {
        return await reply
          .code(UNAUTHORIZED)
          .send({ message: "steam authentication failed" });
      }
    },
  );

  app.get(
    "/auth/session",
    {
      schema: {
        response: { 200: SessionResponse },
        tags: ["auth"],
      },
    },
    async (request) => {
      const user = await currentUser(options, request.headers.cookie);
      return user === null
        ? { authenticated: false }
        : { authenticated: true, user };
    },
  );

  app.post(
    "/auth/logout",
    {
      schema: {
        response: { 200: SessionResponse },
        tags: ["auth"],
      },
    },
    async (request, reply) => {
      const sessionId = readCookie(request.headers.cookie, options.cookie.name);
      if (sessionId !== undefined) {
        await options.sessions.delete(sessionId);
      }
      reply.header("set-cookie", expiredSessionCookie(options.cookie));
      return { authenticated: false };
    },
  );
}

async function currentUser(
  options: AuthRouteOptions,
  cookieHeader: string | undefined,
): Promise<AuthUser | null> {
  const sessionId = readCookie(cookieHeader, options.cookie.name);
  if (sessionId === undefined) {
    return null;
  }

  const session = await options.sessions.get(sessionId);
  return session === null ? null : await options.users.findById(session.userId);
}

function authCallbackUrl(
  options: AuthRouteOptions,
  redirectTo: string | undefined,
): URL {
  const callbackUrl = new URL("/auth/steam/callback", options.publicBaseUrl);
  callbackUrl.searchParams.set("redirectTo", safeRedirectPath(redirectTo));
  return callbackUrl;
}

function safeRedirectPath(value: string | undefined): string {
  if (value === undefined || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function definedQuery(
  query: Readonly<CallbackQueryType>,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (query["openid.claimed_id"] !== undefined) {
    result["openid.claimed_id"] = query["openid.claimed_id"];
  }
  if (query["openid.mode"] !== undefined) {
    result["openid.mode"] = query["openid.mode"];
  }
  if (query.redirectTo !== undefined) {
    result["redirectTo"] = query.redirectTo;
  }
  return result;
}
