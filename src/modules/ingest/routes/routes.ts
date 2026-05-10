/* eslint-disable new-cap, no-magic-numbers, unicorn/no-null */
import { Type, type Static } from "@sinclair/typebox";

import {
  type IngestCommandModel,
  registerIngestActionRoutes,
} from "./actions.js";

import type { AuthRouteOptions } from "../../auth/routes/models.js";
import type {
  IngestStagingRecord,
  PageQuery,
  PageResult,
  ParseJobFilters,
  ParseJobHistoryEntry,
  ParseJobRecord,
  StagingFilters,
} from "../types.js";
import type { FastifyInstance } from "fastify";

export { createEmptyIngestCommandModel } from "./actions.js";
export type {
  IngestCommandModel,
  ManualReparseResult,
  RetryParseJobResult,
} from "./actions.js";

export interface IngestReadModel {
  getParseJob(id: string): Promise<ParseJobRecord | null>;
  getStagingRecord(id: string): Promise<IngestStagingRecord | null>;
  listParseJobHistory(jobId: string): Promise<ParseJobHistoryEntry[]>;
  listParseJobs(
    filters: ParseJobFilters,
    page: PageQuery,
  ): Promise<PageResult<ParseJobRecord>>;
  listStagingRecords(
    filters: StagingFilters,
    page: PageQuery,
  ): Promise<PageResult<IngestStagingRecord>>;
}

export interface IngestRouteOptions {
  auth: AuthRouteOptions;
  commands: IngestCommandModel;
  readModel: IngestReadModel;
}

const JsonObject = Type.Record(Type.String(), Type.Unknown()),
  UuidParameters = Type.Object({ id: Type.String({ format: "uuid" }) }),
  PaginationQuery = Type.Object({
    page: Type.Optional(Type.Integer({ default: 1, minimum: 1 })),
    pageSize: Type.Optional(
      Type.Integer({ default: 25, maximum: 100, minimum: 1 }),
    ),
  }),
  StagingQuery = Type.Intersect([
    PaginationQuery,
    Type.Object({
      checksum: Type.Optional(Type.String()),
      replayId: Type.Optional(Type.String({ format: "uuid" })),
      sourceReplayId: Type.Optional(Type.String()),
      sourceSystem: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
    }),
  ]),
  ParseJobQuery = Type.Intersect([
    PaginationQuery,
    Type.Object({
      checksum: Type.Optional(Type.String()),
      jobId: Type.Optional(Type.String({ format: "uuid" })),
      replayId: Type.Optional(Type.String({ format: "uuid" })),
      status: Type.Optional(Type.String()),
    }),
  ]),
  StagingResponse = Type.Object({
    checksum: Type.String(),
    conflictDetails: JsonObject,
    createdAt: Type.String({ format: "date-time" }),
    id: Type.String({ format: "uuid" }),
    objectKey: Type.String(),
    promotionEvidence: JsonObject,
    replayTimestamp: Type.Union([
      Type.String({ format: "date-time" }),
      Type.Null(),
    ]),
    sizeBytes: Type.Number(),
    sourceReplayId: Type.String(),
    sourceSystem: Type.String(),
    status: Type.String(),
    updatedAt: Type.String({ format: "date-time" }),
  }),
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
  ParseJobHistoryResponse = Type.Object({
    action: Type.String(),
    actorUserId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
    details: JsonObject,
    id: Type.String({ format: "uuid" }),
    jobId: Type.String({ format: "uuid" }),
    statusFrom: Type.Union([Type.String(), Type.Null()]),
    statusTo: Type.String(),
  }),
  StagingListResponse = paginated(StagingResponse),
  ParseJobListResponse = paginated(ParseJobResponse),
  ParseJobHistoryListResponse = Type.Array(ParseJobHistoryResponse),
  NotFoundResponse = Type.Object({ message: Type.String() });

type StagingQueryType = Static<typeof StagingQuery>;
type ParseJobQueryType = Static<typeof ParseJobQuery>;
type UuidParametersType = Static<typeof UuidParameters>;

export async function registerIngestRoutes(
  app: FastifyInstance,
  options: IngestRouteOptions,
): Promise<void> {
  app.get<{ Querystring: StagingQueryType }>(
    "/operations/ingest-staging",
    {
      schema: {
        querystring: StagingQuery,
        response: { 200: StagingListResponse },
        tags: ["operations"],
      },
    },
    async (request) =>
      options.readModel.listStagingRecords(
        stagingFilters(request.query),
        page(request.query),
      ),
  );

  app.get<{ Params: UuidParametersType }>(
    "/operations/ingest-staging/:id",
    {
      schema: {
        params: UuidParameters,
        response: { 200: StagingResponse, 404: NotFoundResponse },
        tags: ["operations"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getStagingRecord(request.params.id);
      return (
        item ?? reply.code(404).send({ message: "staging record not found" })
      );
    },
  );

  app.get<{ Querystring: ParseJobQueryType }>(
    "/operations/parse-jobs",
    {
      schema: {
        querystring: ParseJobQuery,
        response: { 200: ParseJobListResponse },
        tags: ["operations"],
      },
    },
    async (request) =>
      options.readModel.listParseJobs(
        parseJobFilters(request.query),
        page(request.query),
      ),
  );

  app.get<{ Params: UuidParametersType }>(
    "/operations/parse-jobs/:id",
    {
      schema: {
        params: UuidParameters,
        response: { 200: ParseJobResponse, 404: NotFoundResponse },
        tags: ["operations"],
      },
    },
    async (request, reply) => {
      const item = await options.readModel.getParseJob(request.params.id);
      return item ?? reply.code(404).send({ message: "parse job not found" });
    },
  );

  app.get<{ Params: UuidParametersType }>(
    "/operations/parse-jobs/:id/history",
    {
      schema: {
        params: UuidParameters,
        response: { 200: ParseJobHistoryListResponse },
        tags: ["operations"],
      },
    },
    async (request) => options.readModel.listParseJobHistory(request.params.id),
  );
  registerIngestActionRoutes(app, options);
}

export function createEmptyIngestReadModel(): IngestReadModel {
  return {
    getParseJob: () => Promise.resolve(null),
    getStagingRecord: () => Promise.resolve(null),
    listParseJobHistory: () => Promise.resolve([]),
    listParseJobs: (_filters, query) => Promise.resolve(emptyPage(query)),
    listStagingRecords: (_filters, query) => Promise.resolve(emptyPage(query)),
  };
}

function paginated<T extends ReturnType<typeof Type.Object>>(item: T) {
  return Type.Object({
    items: Type.Array(item),
    page: Type.Number(),
    pageSize: Type.Number(),
    total: Type.Number(),
  });
}

function page(query: { page?: number; pageSize?: number }): PageQuery {
  return {
    page: Number(query.page),
    pageSize: Number(query.pageSize),
  };
}

function stagingFilters(query: StagingQueryType): StagingFilters {
  const filters: StagingFilters = {};
  assignDefined(filters, "checksum", query.checksum);
  assignDefined(filters, "replayId", query.replayId);
  assignDefined(filters, "sourceReplayId", query.sourceReplayId);
  assignDefined(filters, "sourceSystem", query.sourceSystem);
  assignDefined(filters, "status", query.status as StagingFilters["status"]);
  return filters;
}

function parseJobFilters(query: ParseJobQueryType): ParseJobFilters {
  const filters: ParseJobFilters = {};
  assignDefined(filters, "checksum", query.checksum);
  assignDefined(filters, "jobId", query.jobId);
  assignDefined(filters, "replayId", query.replayId);
  assignDefined(filters, "status", query.status as ParseJobFilters["status"]);
  return filters;
}

function assignDefined<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function emptyPage<T>(query: PageQuery): PageResult<T> {
  return {
    items: [],
    page: query.page,
    pageSize: query.pageSize,
    total: 0,
  };
}
