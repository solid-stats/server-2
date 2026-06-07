/* eslint-disable new-cap */
import { Type } from "@sinclair/typebox";

import { requireRole } from "../../auth/routes/authorization.js";

import type { AdminRouteOptions, RotationConstraintSignal } from "./models.js";
import type { FastifyInstance, FastifyReply } from "fastify";

const CREATED = 201,
  NO_CONTENT = 204,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE = 422;

const RotationBody = Type.Object({
    endsAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    name: Type.String({ minLength: 1 }),
    startsAt: Type.String({ format: "date-time" }),
  }),
  RotationIdParameters = Type.Object({
    id: Type.String({ format: "uuid" }),
  }),
  RotationResponse = Type.Object({
    endsAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    slug: Type.String(),
    startsAt: Type.String({ format: "date-time" }),
  }),
  ErrorResponse = Type.Object({
    message: Type.String(),
  });

interface RotationBodyType {
  endsAt: string | null;
  name: string;
  startsAt: string;
}

interface RotationIdParametersType {
  id: string;
}

const NAME_CONFLICT_MESSAGE = "rotation name already exists",
  INVALID_RANGE_MESSAGE = "endsAt must be after startsAt",
  HAS_DEPENDENTS_MESSAGE =
    "rotation has dependent replays/stats and cannot be deleted",
  NOT_FOUND_MESSAGE = "rotation not found";

export async function registerAdminRoutes(
  app: FastifyInstance,
  options: AdminRouteOptions,
): Promise<void> {
  const adminOnly = requireRole(options.auth, "admin");

  app.post<{ Body: RotationBodyType }>(
    "/admin/rotations",
    {
      preHandler: adminOnly,
      schema: {
        body: RotationBody,
        response: {
          201: RotationResponse,
          // Fastify emits 400 (error envelope) on body schema validation
          // failure; declare it so the generated OpenAPI contract is complete.
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          409: ErrorResponse,
          422: ErrorResponse,
        },
        tags: ["admin"],
      },
    },
    async (request, reply) => {
      const result = await options.rotations.createRotation({
        endsAt: request.body.endsAt,
        name: request.body.name,
        startsAt: request.body.startsAt,
      });
      if (result.status === "constraint") {
        return replyForSignal(reply, result.signal);
      }
      return reply.code(CREATED).send(result.rotation);
    },
  );

  app.put<{ Body: RotationBodyType; Params: RotationIdParametersType }>(
    "/admin/rotations/:id",
    {
      preHandler: adminOnly,
      schema: {
        body: RotationBody,
        params: RotationIdParameters,
        response: {
          200: RotationResponse,
          // Fastify emits 400 on body/params (incl. malformed :id uuid) schema
          // validation failure; declare it so the OpenAPI contract is complete.
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
          422: ErrorResponse,
        },
        tags: ["admin"],
      },
    },
    async (request, reply) => {
      const result = await options.rotations.updateRotation(request.params.id, {
        endsAt: request.body.endsAt,
        name: request.body.name,
        startsAt: request.body.startsAt,
      });
      if (result.status === "constraint") {
        return replyForSignal(reply, result.signal);
      }
      if (result.status === "not_found") {
        return reply.code(NOT_FOUND).send({ message: NOT_FOUND_MESSAGE });
      }
      return result.rotation;
    },
  );

  app.delete<{ Params: RotationIdParametersType }>(
    "/admin/rotations/:id",
    {
      preHandler: adminOnly,
      schema: {
        params: RotationIdParameters,
        response: {
          204: Type.Null(),
          // Fastify emits 400 on params (malformed :id uuid) schema validation
          // failure; declare it so the OpenAPI contract is complete.
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
        },
        tags: ["admin"],
      },
    },
    async (request, reply) => {
      const result = await options.rotations.deleteRotation(request.params.id);
      if (result.status === "has_dependents") {
        return reply.code(CONFLICT).send({ message: HAS_DEPENDENTS_MESSAGE });
      }
      if (result.status === "not_found") {
        return reply.code(NOT_FOUND).send({ message: NOT_FOUND_MESSAGE });
      }
      return reply.code(NO_CONTENT).send();
    },
  );
}

function replyForSignal(reply: FastifyReply, signal: RotationConstraintSignal) {
  if (signal === "name_conflict") {
    return reply.code(CONFLICT).send({ message: NAME_CONFLICT_MESSAGE });
  }
  return reply.code(UNPROCESSABLE).send({ message: INVALID_RANGE_MESSAGE });
}
