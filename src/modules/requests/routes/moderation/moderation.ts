/* eslint-disable new-cap */
import { Type } from "@sinclair/typebox";

import {
  currentUser,
  requireAnyRole,
} from "../../../auth/routes/authorization.js";

import type {
  RequestModerationActionType,
  RequestRouteOptions,
} from "../models.js";
import type { FastifyInstance } from "fastify";

const NOT_FOUND = 404;

const ErrorResponse = Type.Object({
    message: Type.String(),
  }),
  RequestIdParameters = Type.Object({
    id: Type.String({ format: "uuid" }),
  }),
  RequestResponse = Type.Object({
    createdAt: Type.String({ format: "date-time" }),
    description: Type.String(),
    id: Type.String({ format: "uuid" }),
    reference: Type.Union([
      Type.Object({
        id: Type.String({ format: "uuid" }),
        type: Type.Union([
          Type.Literal("player"),
          Type.Literal("replay"),
          Type.Literal("squad"),
          Type.Literal("stat"),
        ]),
      }),
      Type.Null(),
    ]),
    requesterUserId: Type.String({ format: "uuid" }),
    status: Type.Union([
      Type.Literal("approved"),
      Type.Literal("cancelled"),
      Type.Literal("in_review"),
      Type.Literal("rejected"),
      Type.Literal("submitted"),
    ]),
    type: Type.Union([
      Type.Literal("identity_correction"),
      Type.Literal("merge_split"),
      Type.Literal("stats_correction"),
      Type.Literal("steam_link"),
    ]),
    updatedAt: Type.String({ format: "date-time" }),
  }),
  ModerationActionResponse = Type.Object({
    action: Type.Union([Type.Literal("approve"), Type.Literal("reject")]),
    comment: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
    id: Type.String({ format: "uuid" }),
    moderatorUserId: Type.String({ format: "uuid" }),
    requestId: Type.String({ format: "uuid" }),
  }),
  DetailResponse = Type.Object({
    history: Type.Array(ModerationActionResponse),
    request: RequestResponse,
  }),
  DecisionBody = Type.Object({
    comment: Type.String({ minLength: 1 }),
    decision: Type.Union([Type.Literal("approved"), Type.Literal("rejected")]),
  }),
  DecisionResponse = Type.Object({
    action: ModerationActionResponse,
    request: RequestResponse,
  });

interface DecisionBodyType {
  comment: string;
  decision: "approved" | "rejected";
}

interface RequestIdParametersType {
  id: string;
}

export async function registerRequestModerationRoutes(
  app: FastifyInstance,
  options: RequestRouteOptions,
): Promise<void> {
  const moderatorOnly = requireAnyRole(options.auth, ["admin", "moderator"]);

  app.get(
    "/moderation/requests",
    {
      preHandler: moderatorOnly,
      schema: {
        response: {
          200: Type.Array(RequestResponse),
        },
        tags: ["moderation"],
      },
    },
    async () => options.moderation.listForModeration(),
  );

  app.get<{ Params: RequestIdParametersType }>(
    "/moderation/requests/:id",
    {
      preHandler: moderatorOnly,
      schema: {
        params: RequestIdParameters,
        response: {
          200: DetailResponse,
          404: ErrorResponse,
        },
        tags: ["moderation"],
      },
    },
    async (request, reply) => {
      const item = await options.moderation.findForModeration(
        request.params.id,
      );
      if (item === null) {
        return reply.code(NOT_FOUND).send({ message: "request not found" });
      }
      return {
        history: await options.moderation.listActions(item.id),
        request: item,
      };
    },
  );

  app.post<{ Body: DecisionBodyType; Params: RequestIdParametersType }>(
    "/moderation/requests/:id/decision",
    {
      preHandler: moderatorOnly,
      schema: {
        body: DecisionBody,
        params: RequestIdParameters,
        response: {
          200: DecisionResponse,
          404: ErrorResponse,
        },
        tags: ["moderation"],
      },
    },
    async (request, reply) => {
      const user = await currentUser(options.auth, request.headers.cookie);
      /* v8 ignore next 3 */
      if (user === null) {
        throw new Error(
          "Expected moderation pre-handler to authenticate user.",
        );
      }
      const result = await options.moderation.decide({
        action: decisionAction(request.body.decision),
        comment: request.body.comment,
        moderatorUserId: user.id,
        requestId: request.params.id,
      });
      if (result === null) {
        return reply.code(NOT_FOUND).send({ message: "request not found" });
      }
      return result;
    },
  );
}

function decisionAction(
  decision: DecisionBodyType["decision"],
): RequestModerationActionType {
  return decision === "approved" ? "approve" : "reject";
}
