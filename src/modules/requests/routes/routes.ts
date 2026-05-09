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
  CreateAttachmentBody = Type.Object({
    checksum: Type.Optional(Type.String({ minLength: 1 })),
    contentType: Type.String({ minLength: 1 }),
    fileName: Type.String({ minLength: 1 }),
    sizeBytes: Type.Integer({ minimum: 0 }),
  }),
  AttachmentResponse = Type.Object({
    checksum: Type.Union([Type.String(), Type.Null()]),
    contentType: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
    fileName: Type.String(),
    id: Type.String({ format: "uuid" }),
    objectKey: Type.String(),
    requestId: Type.String({ format: "uuid" }),
    sizeBytes: Type.Integer({ minimum: 0 }),
  }),
  AttachmentUploadResponse = Type.Intersect([
    AttachmentResponse,
    Type.Object({
      uploadExpiresAt: Type.String({ format: "date-time" }),
      uploadHeaders: Type.Record(Type.String(), Type.String()),
      uploadUrl: Type.String({ format: "uri" }),
    }),
  ]),
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

interface CreateAttachmentBodyType {
  checksum?: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
}

interface RequestIdParametersType {
  id: string;
}

export async function registerRequestRoutes(
  app: FastifyInstance,
  options: RequestRouteOptions,
): Promise<void> {
  await registerRequestCrudRoutes(app, options);
  await registerRequestAttachmentRoutes(app, options);
}

async function registerRequestCrudRoutes(
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

async function registerRequestAttachmentRoutes(
  app: FastifyInstance,
  options: RequestRouteOptions,
): Promise<void> {
  app.post<{ Body: CreateAttachmentBodyType; Params: RequestIdParametersType }>(
    "/requests/:id/attachments",
    {
      schema: {
        body: CreateAttachmentBody,
        params: RequestIdParameters,
        response: {
          201: AttachmentUploadResponse,
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
      const parentRequest = await options.requests.findForRequester(
        request.params.id,
        user.id,
      );
      if (parentRequest === null) {
        return reply.code(NOT_FOUND).send({ message: "request not found" });
      }
      const upload = await options.attachmentStorage.createUpload({
          contentType: request.body.contentType,
          fileName: request.body.fileName,
          requestId: parentRequest.id,
          sizeBytes: request.body.sizeBytes,
        }),
        attachment = await options.attachments.create({
          ...(request.body.checksum === undefined
            ? {}
            : { checksum: request.body.checksum }),
          contentType: request.body.contentType,
          fileName: request.body.fileName,
          objectKey: upload.objectKey,
          requestId: parentRequest.id,
          sizeBytes: request.body.sizeBytes,
        });
      return reply.code(CREATED).send({
        ...attachment,
        uploadExpiresAt: upload.expiresAt,
        uploadHeaders: upload.headers,
        uploadUrl: upload.uploadUrl,
      });
    },
  );

  app.get<{ Params: RequestIdParametersType }>(
    "/requests/:id/attachments",
    {
      schema: {
        params: RequestIdParameters,
        response: {
          200: Type.Array(AttachmentResponse),
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
      const parentRequest = await options.requests.findForRequester(
        request.params.id,
        user.id,
      );
      if (parentRequest === null) {
        return reply.code(NOT_FOUND).send({ message: "request not found" });
      }
      return options.attachments.listForRequest(parentRequest.id);
    },
  );
}
