/* eslint-disable new-cap */
import { Type } from "@sinclair/typebox";

import { currentUser } from "../../auth/routes/authorization.js";

import type {
  PlayerRequestType,
  ReferencedEntityType,
  RequestRouteOptions,
} from "./models.js";
import type { FastifyInstance } from "fastify";

const CREATED = 201,
  NOT_FOUND = 404,
  UNAUTHORIZED = 401,
  UNPROCESSABLE = 422;

const RequestTypeSchema = Type.Union([
    Type.Literal("identity_correction"),
    Type.Literal("merge_split"),
    Type.Literal("stats_correction"),
    Type.Literal("steam_link"),
  ]),
  ReferenceTypeSchema = Type.Union([
    Type.Literal("player"),
    Type.Literal("replay"),
    Type.Literal("squad"),
    Type.Literal("stat"),
  ]),
  ReferenceSchema = Type.Object({
    id: Type.String({ format: "uuid" }),
    type: ReferenceTypeSchema,
  }),
  CreateRequestBody = Type.Object({
    description: Type.String({ minLength: 1 }),
    reference: Type.Optional(ReferenceSchema),
    type: RequestTypeSchema,
  }),
  RequestResponse = Type.Object({
    createdAt: Type.String({ format: "date-time" }),
    description: Type.String(),
    id: Type.String({ format: "uuid" }),
    reference: Type.Union([ReferenceSchema, Type.Null()]),
    requesterUserId: Type.String({ format: "uuid" }),
    status: Type.Union([
      Type.Literal("approved"),
      Type.Literal("cancelled"),
      Type.Literal("in_review"),
      Type.Literal("rejected"),
      Type.Literal("submitted"),
    ]),
    type: RequestTypeSchema,
    updatedAt: Type.String({ format: "date-time" }),
  }),
  RequestIdParameters = Type.Object({
    id: Type.String({ format: "uuid" }),
  }),
  ErrorResponse = Type.Object({
    message: Type.String(),
  });

interface CreateRequestBodyType {
  description: string;
  reference?: {
    id: string;
    type: ReferencedEntityType;
  };
  type: PlayerRequestType;
}

interface RequestIdParametersType {
  id: string;
}

export async function registerRequestRoutes(
  app: FastifyInstance,
  options: RequestRouteOptions,
): Promise<void> {
  app.post<{ Body: CreateRequestBodyType }>(
    "/requests",
    {
      schema: {
        body: CreateRequestBody,
        response: {
          201: RequestResponse,
          401: ErrorResponse,
          422: ErrorResponse,
        },
        tags: ["requests"],
      },
    },
    async (request, reply) => {
      const user = await currentUser(options.auth, request.headers.cookie);
      if (user === null) {
        return reply.code(UNAUTHORIZED).send({
          message: "authentication required",
        });
      }
      if (
        request.body.reference !== undefined &&
        !(await options.references.exists(request.body.reference))
      ) {
        return reply.code(UNPROCESSABLE).send({
          message: "referenced entity not found",
        });
      }
      const created = await options.requests.create({
        description: request.body.description,
        ...(request.body.reference === undefined
          ? {}
          : { reference: request.body.reference }),
        requesterUserId: user.id,
        type: request.body.type,
      });
      return reply.code(CREATED).send(created);
    },
  );

  app.get(
    "/requests",
    {
      schema: {
        response: {
          200: Type.Array(RequestResponse),
          401: ErrorResponse,
        },
        tags: ["requests"],
      },
    },
    async (request, reply) => {
      const user = await currentUser(options.auth, request.headers.cookie);
      if (user === null) {
        return reply.code(UNAUTHORIZED).send({
          message: "authentication required",
        });
      }
      return options.requests.listForRequester(user.id);
    },
  );

  app.get<{ Params: RequestIdParametersType }>(
    "/requests/:id",
    {
      schema: {
        params: RequestIdParameters,
        response: {
          200: RequestResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        tags: ["requests"],
      },
    },
    async (request, reply) => {
      const user = await currentUser(options.auth, request.headers.cookie);
      if (user === null) {
        return reply.code(UNAUTHORIZED).send({
          message: "authentication required",
        });
      }
      const item = await options.requests.findForRequester(
        request.params.id,
        user.id,
      );
      return (
        item ?? reply.code(NOT_FOUND).send({ message: "request not found" })
      );
    },
  );
}
