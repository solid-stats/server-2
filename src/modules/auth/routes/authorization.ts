/* eslint-disable unicorn/no-null, unicorn/no-useless-undefined */
import { readCookie } from "./cookies.js";

import type { AuthRouteOptions, AuthUser } from "./models.js";
import type { FastifyReply, FastifyRequest } from "fastify";

export type RequiredRole = "admin" | "moderator";

const FORBIDDEN = 403,
  UNAUTHORIZED = 401;

export async function currentUser(
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

export function requireRole(options: AuthRouteOptions, role: RequiredRole) {
  return requireAnyRole(options, [role]);
}

export function requireAnyRole(
  options: AuthRouteOptions,
  roles: RequiredRole[],
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await currentUser(options, request.headers.cookie);
    if (user === null) {
      return reply.code(UNAUTHORIZED).send({
        message: "authentication required",
      });
    }
    if (!roles.some((role) => user.roles.includes(role))) {
      return reply.code(FORBIDDEN).send({
        message: "required role missing",
      });
    }
    return undefined;
  };
}
