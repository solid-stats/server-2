/* eslint-disable new-cap */
import { Type } from "@sinclair/typebox";

import { requireAnyRole } from "../../../auth/routes/authorization.js";

import type { RequestRouteOptions } from "../models.js";
import type { FastifyInstance } from "fastify";

const NOT_FOUND = 404,
  UNPROCESSABLE = 422;

const ErrorResponse = Type.Object({
    message: Type.String(),
  }),
  RequestIdParameters = Type.Object({
    id: Type.String({ format: "uuid" }),
  }),
  AuditPatchBody = Type.Object({
    affectedEntityId: Type.Optional(Type.String({ format: "uuid" })),
    affectedEntityType: Type.String({ minLength: 1 }),
    patch: Type.Record(Type.String(), Type.Unknown()),
    reason: Type.String({ minLength: 1 }),
  }),
  AuditPatchResponse = Type.Object({
    affectedEntityId: Type.Union([
      Type.String({ format: "uuid" }),
      Type.Null(),
    ]),
    affectedEntityType: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
    id: Type.String({ format: "uuid" }),
    patch: Type.Record(Type.String(), Type.Unknown()),
    reason: Type.String(),
    recalculationStatus: Type.String(),
    requestId: Type.String({ format: "uuid" }),
  });

interface AuditPatchBodyType {
  affectedEntityId?: string;
  affectedEntityType: string;
  patch: Record<string, unknown>;
  reason: string;
}

interface RequestIdParametersType {
  id: string;
}

export async function registerAuditPatchRoutes(
  app: FastifyInstance,
  options: RequestRouteOptions,
): Promise<void> {
  const moderatorOnly = requireAnyRole(options.auth, ["admin", "moderator"]);

  app.post<{ Body: AuditPatchBodyType; Params: RequestIdParametersType }>(
    "/moderation/requests/:id/audit-patches",
    {
      preHandler: moderatorOnly,
      schema: {
        body: AuditPatchBody,
        params: RequestIdParameters,
        response: {
          200: AuditPatchResponse,
          404: ErrorResponse,
          422: ErrorResponse,
        },
        tags: ["moderation"],
      },
    },
    async (request, reply) => {
      const parentRequest = await options.moderation.findForModeration(
        request.params.id,
      );
      if (parentRequest === null) {
        return reply.code(NOT_FOUND).send({ message: "request not found" });
      }
      if (
        parentRequest.type !== "stats_correction" ||
        parentRequest.status !== "approved"
      ) {
        return reply.code(UNPROCESSABLE).send({
          message: "request must be an approved stats correction",
        });
      }
      const recalculation = await options.auditRecalculator.recalculateForPatch(
        {
          ...(request.body.affectedEntityId === undefined
            ? {}
            : { affectedEntityId: request.body.affectedEntityId }),
          affectedEntityType: request.body.affectedEntityType,
          patch: request.body.patch,
          reason: request.body.reason,
          recalculationStatus: "pending",
          requestId: parentRequest.id,
        },
      );
      return options.auditPatches.createAuditPatch({
        ...(request.body.affectedEntityId === undefined
          ? {}
          : { affectedEntityId: request.body.affectedEntityId }),
        affectedEntityType: request.body.affectedEntityType,
        patch: request.body.patch,
        reason: request.body.reason,
        recalculationStatus: recalculation.status,
        requestId: parentRequest.id,
      });
    },
  );

  app.get<{ Params: RequestIdParametersType }>(
    "/moderation/requests/:id/audit-patches",
    {
      preHandler: moderatorOnly,
      schema: {
        params: RequestIdParameters,
        response: {
          200: Type.Array(AuditPatchResponse),
          404: ErrorResponse,
        },
        tags: ["moderation"],
      },
    },
    async (request, reply) => {
      const parentRequest = await options.moderation.findForModeration(
        request.params.id,
      );
      if (parentRequest === null) {
        return reply.code(NOT_FOUND).send({ message: "request not found" });
      }
      return options.auditPatches.listAuditPatchesForRequest(parentRequest.id);
    },
  );
}
