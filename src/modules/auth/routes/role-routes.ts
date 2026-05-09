import { Type } from "@sinclair/typebox";

import type { AuthRouteOptions } from "./models.js";
import type { FastifyInstance } from "fastify";

const NOT_FOUND = 404;

const UserResponse = Type.Object({
    displayName: Type.String(),
    id: Type.String({ format: "uuid" }),
    roles: Type.Array(Type.String()),
    steamId: Type.String(),
  }),
  RolesBody = Type.Object({
    roles: Type.Array(
      Type.Union([Type.Literal("admin"), Type.Literal("moderator")]),
    ),
  }),
  UserIdParameters = Type.Object({
    id: Type.String({ format: "uuid" }),
  }),
  NotFoundResponse = Type.Object({
    message: Type.String(),
  });

interface UserIdParametersType {
  id: string;
}

interface RolesBodyType {
  roles: ("admin" | "moderator")[];
}

export function registerRoleRoutes(
  app: FastifyInstance,
  options: AuthRouteOptions,
): void {
  app.get(
    "/admin/users",
    {
      schema: {
        response: { 200: Type.Array(UserResponse) },
        tags: ["admin"],
      },
    },
    async () => options.users.listUsers(),
  );

  app.put<{
    Body: RolesBodyType;
    Params: UserIdParametersType;
  }>(
    "/admin/users/:id/roles",
    {
      schema: {
        body: RolesBody,
        params: UserIdParameters,
        response: { 200: UserResponse, 404: NotFoundResponse },
        tags: ["admin"],
      },
    },
    async (request, reply) => {
      const user = await options.users.setUserRoles(
        request.params.id,
        request.body.roles,
      );
      return user ?? reply.code(NOT_FOUND).send({ message: "user not found" });
    },
  );
}
