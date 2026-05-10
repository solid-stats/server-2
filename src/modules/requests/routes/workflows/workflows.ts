/* eslint-disable new-cap */
import { Type } from "@sinclair/typebox";

import {
  currentUser,
  requireAnyRole,
} from "../../../auth/routes/authorization.js";

import type {
  RequestRouteOptions,
  RequestWorkflowActionType,
} from "../models.js";
import type { FastifyInstance } from "fastify";

const NOT_FOUND = 404,
  UNPROCESSABLE = 422;

const ErrorResponse = Type.Object({
    message: Type.String(),
  }),
  RequestIdParameters = Type.Object({
    id: Type.String({ format: "uuid" }),
  }),
  WorkflowActionSchema = Type.Union([
    Type.Literal("legacy_winner_fix"),
    Type.Literal("link_steam"),
    Type.Literal("merge_players"),
    Type.Literal("split_player"),
  ]),
  WorkflowBody = Type.Object({
    action: WorkflowActionSchema,
    payload: Type.Record(Type.String(), Type.Unknown()),
  }),
  WorkflowResponse = Type.Object({
    action: WorkflowActionSchema,
    createdAt: Type.String({ format: "date-time" }),
    id: Type.String({ format: "uuid" }),
    moderatorUserId: Type.String({ format: "uuid" }),
    payload: Type.Record(Type.String(), Type.Unknown()),
    requestId: Type.String({ format: "uuid" }),
  });

interface RequestIdParametersType {
  id: string;
}

interface WorkflowBodyType {
  action: RequestWorkflowActionType;
  payload: Record<string, unknown>;
}

export async function registerRequestWorkflowRoutes(
  app: FastifyInstance,
  options: RequestRouteOptions,
): Promise<void> {
  const moderatorOnly = requireAnyRole(options.auth, ["admin", "moderator"]);

  app.post<{ Body: WorkflowBodyType; Params: RequestIdParametersType }>(
    "/moderation/requests/:id/workflows",
    {
      preHandler: moderatorOnly,
      schema: {
        body: WorkflowBody,
        params: RequestIdParameters,
        response: {
          200: WorkflowResponse,
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
        parentRequest.status !== "approved" ||
        !workflowMatchesRequest(parentRequest.type, request.body.action)
      ) {
        return reply.code(UNPROCESSABLE).send({
          message: "workflow action does not match an approved request",
        });
      }
      const user = await currentUser(options.auth, request.headers.cookie);
      /* v8 ignore next 3 */
      if (user === null) {
        throw new Error(
          "Expected moderation pre-handler to authenticate user.",
        );
      }
      const input = {
        action: request.body.action,
        moderatorUserId: user.id,
        payload: request.body.payload,
        requestId: parentRequest.id,
      };
      await options.workflowApplier.applyWorkflowAction(input);
      return options.workflows.createWorkflowAction(input);
    },
  );

  app.get<{ Params: RequestIdParametersType }>(
    "/moderation/requests/:id/workflows",
    {
      preHandler: moderatorOnly,
      schema: {
        params: RequestIdParameters,
        response: {
          200: Type.Array(WorkflowResponse),
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
      return options.workflows.listWorkflowActions(parentRequest.id);
    },
  );
}

function workflowMatchesRequest(
  requestType: string,
  action: RequestWorkflowActionType,
): boolean {
  if (action === "legacy_winner_fix") {
    return requestType === "stats_correction";
  }
  if (action === "link_steam") {
    return requestType === "steam_link";
  }
  return requestType === "merge_split";
}
