/* eslint-disable new-cap, no-magic-numbers */
import { Type, type Static } from "@sinclair/typebox";

import { currentUser, requireRole } from "../../auth/routes/authorization.js";

import type { AuthRouteOptions } from "../../auth/routes/models.js";
import type { ParseJobRecord } from "../types.js";
import type { FastifyInstance, FastifyRequest } from "fastify";

export type RetryParseJobResult =
  | { kind: "conflict"; message: string }
  | { job: ParseJobRecord; kind: "retried" }
  | { kind: "not_found" };

export type ManualReparseResult =
  | { job: ParseJobRecord; kind: "created" }
  | { kind: "not_found" };

export interface IngestCommandModel {
  createManualReparse(input: {
    actorUserId: string;
    parserContractVersion: string;
    reason?: string;
    replayId: string;
  }): Promise<ManualReparseResult>;
  retryParseJob(input: {
    actorUserId: string;
    jobId: string;
    reason?: string;
  }): Promise<RetryParseJobResult>;
}

const JsonObject = Type.Record(Type.String(), Type.Unknown()),
  UuidParameters = Type.Object({ id: Type.String({ format: "uuid" }) }),
  ParseJobResponse = Type.Object({
    attempts: Type.Number(),
    checksum: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
    error: Type.Union([JsonObject, Type.Null()]),
    finishedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    id: Type.String({ format: "uuid" }),
    objectKey: Type.String(),
    parserContractVersion: Type.String(),
    publishedAt: Type.Union([
      Type.String({ format: "date-time" }),
      Type.Null(),
    ]),
    replayId: Type.String({ format: "uuid" }),
    startedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    status: Type.String(),
    updatedAt: Type.String({ format: "date-time" }),
  }),
  RetryBody = Type.Object({
    reason: Type.Optional(Type.String({ maxLength: 1000, minLength: 1 })),
  }),
  ManualReparseBody = Type.Object({
    parserContractVersion: Type.String({ minLength: 1 }),
    reason: Type.Optional(Type.String({ maxLength: 1000, minLength: 1 })),
  }),
  MessageResponse = Type.Object({ message: Type.String() });

type UuidParametersType = Static<typeof UuidParameters>;
type RetryBodyType = Static<typeof RetryBody>;
type ManualReparseBodyType = Static<typeof ManualReparseBody>;

export function registerIngestActionRoutes(
  app: FastifyInstance,
  options: {
    auth: AuthRouteOptions;
    commands: IngestCommandModel;
  },
): void {
  registerRetryRoute(app, options);
  registerManualReparseRoute(app, options);
}

export function createEmptyIngestCommandModel(): IngestCommandModel {
  return {
    createManualReparse: () => Promise.resolve({ kind: "not_found" }),
    retryParseJob: () => Promise.resolve({ kind: "not_found" }),
  };
}

function registerRetryRoute(
  app: FastifyInstance,
  options: { auth: AuthRouteOptions; commands: IngestCommandModel },
): void {
  app.post<{ Body: RetryBodyType; Params: UuidParametersType }>(
    "/operations/parse-jobs/:id/retry",
    {
      preHandler: requireRole(options.auth, "admin"),
      schema: {
        body: RetryBody,
        params: UuidParameters,
        response: {
          200: ParseJobResponse,
          401: MessageResponse,
          403: MessageResponse,
          404: MessageResponse,
          409: MessageResponse,
        },
        tags: ["operations"],
      },
    },
    async (request, reply) => {
      const actorUserId = await requireActorUserId(options.auth, request),
        result = await options.commands.retryParseJob({
          actorUserId,
          jobId: request.params.id,
          ...reasonInput(request.body.reason),
        });
      if (result.kind === "retried") {
        return result.job;
      }
      if (result.kind === "conflict") {
        return reply.code(409).send({ message: result.message });
      }
      return reply.code(404).send({ message: "parse job not found" });
    },
  );
}

function registerManualReparseRoute(
  app: FastifyInstance,
  options: { auth: AuthRouteOptions; commands: IngestCommandModel },
): void {
  app.post<{ Body: ManualReparseBodyType; Params: UuidParametersType }>(
    "/operations/replays/:id/reparse",
    {
      preHandler: requireRole(options.auth, "admin"),
      schema: {
        body: ManualReparseBody,
        params: UuidParameters,
        response: {
          201: ParseJobResponse,
          401: MessageResponse,
          403: MessageResponse,
          404: MessageResponse,
        },
        tags: ["operations"],
      },
    },
    async (request, reply) => {
      const actorUserId = await requireActorUserId(options.auth, request),
        result = await options.commands.createManualReparse({
          actorUserId,
          parserContractVersion: request.body.parserContractVersion,
          replayId: request.params.id,
          ...reasonInput(request.body.reason),
        });
      if (result.kind === "created") {
        return reply.code(201).send(result.job);
      }
      return reply.code(404).send({ message: "replay not found" });
    },
  );
}

function reasonInput(reason: string | undefined): { reason?: string } {
  return reason === undefined ? {} : { reason };
}

async function requireActorUserId(
  options: AuthRouteOptions,
  request: FastifyRequest,
): Promise<string> {
  const user = (await currentUser(options, request.headers.cookie)) as {
    id: string;
  };
  return user.id;
}
