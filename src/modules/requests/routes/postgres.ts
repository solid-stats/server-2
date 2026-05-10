/* eslint-disable max-classes-per-file, max-lines, unicorn/no-null */
import type {
  AuditPatch,
  AuditPatchRepository,
  CreateAuditPatchInput,
  CreatePlayerRequestInput,
  CreateRequestAttachmentInput,
  CreateRequestWorkflowActionInput,
  PlayerRequest,
  PlayerRequestRepository,
  RequestAttachment,
  RequestAttachmentRepository,
  RequestModerationAction,
  RequestModerationRepository,
  RequestReference,
  RequestWorkflowAction,
  RequestWorkflowRepository,
} from "./models.js";
import type { Pool, PoolClient } from "pg";

interface RequestRow {
  created_at: Date;
  description: string;
  id: string;
  referenced_entity_id: string | null;
  referenced_entity_type: RequestReference["type"] | null;
  requester_user_id: string;
  request_type: PlayerRequest["type"];
  status: PlayerRequest["status"];
  updated_at: Date;
}

interface AttachmentRow {
  checksum: string | null;
  content_type: string;
  created_at: Date;
  file_name: string;
  id: string;
  object_key: string;
  request_id: string;
  size_bytes: string;
}

interface ModerationActionRow {
  action_type: RequestModerationAction["action"];
  comment: string;
  created_at: Date;
  id: string;
  moderator_user_id: string;
  request_id: string;
}

interface AuditPatchRow {
  affected_entity_id: string | null;
  affected_entity_type: string;
  created_at: Date;
  id: string;
  patch: Record<string, unknown>;
  reason: string;
  recalculation_status: string;
  request_id: string;
}

interface WorkflowActionRow {
  action: RequestWorkflowAction["action"];
  created_at: Date;
  id: string;
  moderator_user_id: string;
  payload: Record<string, unknown>;
  request_id: string;
}

interface IdRow {
  id: string;
}

export class PgPlayerRequestRepository
  implements
    PlayerRequestRepository,
    RequestAttachmentRepository,
    AuditPatchRepository,
    RequestModerationRepository,
    RequestWorkflowRepository
{
  public constructor(private readonly pool: Pool) {}

  public async create(input: CreatePlayerRequestInput): Promise<PlayerRequest>;

  public async create(
    input: CreateRequestAttachmentInput,
  ): Promise<RequestAttachment>;

  public async create(
    input: CreatePlayerRequestInput | CreateRequestAttachmentInput,
  ): Promise<PlayerRequest | RequestAttachment> {
    return isAttachmentInput(input)
      ? await this.createAttachment(input)
      : await this.createRequest(input);
  }

  public async findForRequester(
    id: string,
    requesterUserId: string,
  ): Promise<PlayerRequest | null> {
    const result = await this.pool.query<RequestRow>(
      `${requestSelect()} where id = $1 and requester_user_id = $2`,
      [id, requesterUserId],
    );
    const [row] = result.rows;
    return row === undefined ? null : mapRequest(row);
  }

  public async listForRequester(
    requesterUserId: string,
  ): Promise<PlayerRequest[]> {
    const result = await this.pool.query<RequestRow>(
      `${requestSelect()} where requester_user_id = $1 order by created_at, id`,
      [requesterUserId],
    );
    return result.rows.map((row) => mapRequest(row));
  }

  public async listForRequest(requestId: string): Promise<RequestAttachment[]> {
    const result = await this.pool.query<AttachmentRow>(
      `${attachmentSelect()} where request_id = $1 order by created_at, id`,
      [requestId],
    );
    return result.rows.map((row) => mapAttachment(row));
  }

  public async listForModeration(): Promise<PlayerRequest[]> {
    const result = await this.pool.query<RequestRow>(
      `${requestSelect()} order by created_at, id`,
    );
    return result.rows.map((row) => mapRequest(row));
  }

  public async findForModeration(id: string): Promise<PlayerRequest | null> {
    const result = await this.pool.query<RequestRow>(
      `${requestSelect()} where id = $1`,
      [id],
    );
    const [row] = result.rows;
    return row === undefined ? null : mapRequest(row);
  }

  public async decide(input: {
    action: "approve" | "reject";
    comment: string;
    moderatorUserId: string;
    requestId: string;
  }): Promise<{
    action: RequestModerationAction;
    request: PlayerRequest;
  } | null> {
    return this.withClient(async (client) => {
      const requestResult = await client.query<RequestRow>(
        `
          update requests
          set status = $2,
              updated_at = now()
          where id = $1
          returning id::text, requester_user_id::text, request_type, status,
            description, referenced_entity_type, referenced_entity_id::text,
            created_at, updated_at
        `,
        [input.requestId, input.action === "approve" ? "approved" : "rejected"],
      );
      const [requestRow] = requestResult.rows;
      if (requestRow === undefined) {
        return null;
      }
      const actionResult = await client.query<ModerationActionRow>(
        `
          insert into moderation_actions (
            request_id, moderator_user_id, action_type, comment
          )
          values ($1, $2, $3, $4)
          returning id::text, request_id::text, moderator_user_id::text,
            action_type, coalesce(comment, '') as comment, created_at
        `,
        [input.requestId, input.moderatorUserId, input.action, input.comment],
      );
      return {
        action: mapModerationAction(firstRow(actionResult.rows)),
        request: mapRequest(requestRow),
      };
    });
  }

  public async listActions(
    requestId: string,
  ): Promise<RequestModerationAction[]> {
    const result = await this.pool.query<ModerationActionRow>(
      `${moderationActionSelect()} where request_id = $1 order by created_at, id`,
      [requestId],
    );
    return result.rows.map((row) => mapModerationAction(row));
  }

  public async createAuditPatch(
    input: CreateAuditPatchInput,
  ): Promise<AuditPatch> {
    return this.withClient(async (client) => {
      const action = await client.query<IdRow>(
        `
          select id::text
          from moderation_actions
          where request_id = $1 and action_type = 'approve'
          order by created_at desc, id desc
          limit 1
        `,
        [input.requestId],
      );
      const actionId = firstRow(action.rows).id,
        result = await client.query<AuditPatchRow>(
          `
            insert into audit_patches (
              request_id, moderation_action_id, affected_entity_type,
              affected_entity_id, patch, reason, recalculation_status
            )
            values ($1, $2, $3, $4, $5, $6, $7)
            returning id::text, request_id::text, affected_entity_type,
              affected_entity_id::text, patch, coalesce(reason, '') as reason,
              recalculation_status, created_at
          `,
          [
            input.requestId,
            actionId,
            input.affectedEntityType,
            input.affectedEntityId ?? null,
            input.patch,
            input.reason,
            input.recalculationStatus,
          ],
        );
      return mapAuditPatch(firstRow(result.rows));
    });
  }

  public async listAuditPatchesForRequest(
    requestId: string,
  ): Promise<AuditPatch[]> {
    const result = await this.pool.query<AuditPatchRow>(
      `${auditPatchSelect()} where request_id = $1 order by created_at, id`,
      [requestId],
    );
    return result.rows.map((row) => mapAuditPatch(row));
  }

  public async createWorkflowAction(
    input: CreateRequestWorkflowActionInput,
  ): Promise<RequestWorkflowAction> {
    const result = await this.pool.query<WorkflowActionRow>(
      `
        insert into request_workflow_actions (
          request_id, moderator_user_id, action, payload
        )
        values ($1, $2, $3, $4)
        returning id::text, request_id::text, moderator_user_id::text,
          action, payload, created_at
      `,
      [input.requestId, input.moderatorUserId, input.action, input.payload],
    );
    return mapWorkflowAction(firstRow(result.rows));
  }

  public async listWorkflowActions(
    requestId: string,
  ): Promise<RequestWorkflowAction[]> {
    const result = await this.pool.query<WorkflowActionRow>(
      `${workflowActionSelect()} where request_id = $1 order by created_at, id`,
      [requestId],
    );
    return result.rows.map((row) => mapWorkflowAction(row));
  }

  private async createRequest(
    input: CreatePlayerRequestInput,
  ): Promise<PlayerRequest> {
    const result = await this.pool.query<RequestRow>(
      `
        insert into requests (
          requester_user_id, request_type, description,
          referenced_entity_type, referenced_entity_id
        )
        values ($1, $2, $3, $4, $5)
        returning id::text, requester_user_id::text, request_type, status,
          description, referenced_entity_type, referenced_entity_id::text,
          created_at, updated_at
      `,
      [
        input.requesterUserId,
        input.type,
        input.description,
        input.reference?.type ?? null,
        input.reference?.id ?? null,
      ],
    );
    return mapRequest(firstRow(result.rows));
  }

  private async createAttachment(
    input: CreateRequestAttachmentInput,
  ): Promise<RequestAttachment> {
    const result = await this.pool.query<AttachmentRow>(
      `
        insert into request_attachments (
          request_id, object_key, checksum, size_bytes, content_type, metadata
        )
        values ($1, $2, $3, $4, $5, $6)
        returning id::text, request_id::text, object_key, checksum,
          size_bytes::text, content_type, metadata->>'fileName' as file_name,
          created_at
      `,
      [
        input.requestId,
        input.objectKey,
        input.checksum ?? null,
        input.sizeBytes,
        input.contentType,
        { fileName: input.fileName },
      ],
    );
    return mapAttachment(firstRow(result.rows));
  }

  private async withClient<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await callback(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

export class PgReferenceValidator {
  public constructor(private readonly pool: Pool) {}

  public async exists(reference: RequestReference): Promise<boolean> {
    const result = await this.pool.query<IdRow>(
      `select id::text from ${referenceTable(reference.type)} where id = $1`,
      [reference.id],
    );
    return result.rowCount === 1;
  }
}

function requestSelect(): string {
  return `
    select id::text, requester_user_id::text, request_type, status,
      description, referenced_entity_type, referenced_entity_id::text,
      created_at, updated_at
    from requests
  `;
}

function attachmentSelect(): string {
  return `
    select id::text, request_id::text, object_key, checksum, size_bytes::text,
      coalesce(content_type, '') as content_type,
      metadata->>'fileName' as file_name,
      created_at
    from request_attachments
  `;
}

function moderationActionSelect(): string {
  return `
    select id::text, request_id::text, moderator_user_id::text,
      action_type, coalesce(comment, '') as comment, created_at
    from moderation_actions
  `;
}

function auditPatchSelect(): string {
  return `
    select id::text, request_id::text, affected_entity_type,
      affected_entity_id::text, patch, coalesce(reason, '') as reason,
      recalculation_status, created_at
    from audit_patches
  `;
}

function workflowActionSelect(): string {
  return `
    select id::text, request_id::text, moderator_user_id::text,
      action, payload, created_at
    from request_workflow_actions
  `;
}

function mapRequest(row: RequestRow): PlayerRequest {
  return {
    createdAt: row.created_at.toISOString(),
    description: row.description,
    id: row.id,
    reference:
      row.referenced_entity_id === null || row.referenced_entity_type === null
        ? null
        : { id: row.referenced_entity_id, type: row.referenced_entity_type },
    requesterUserId: row.requester_user_id,
    status: row.status,
    type: row.request_type,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapAttachment(row: AttachmentRow): RequestAttachment {
  return {
    checksum: row.checksum,
    contentType: row.content_type,
    createdAt: row.created_at.toISOString(),
    fileName: row.file_name,
    id: row.id,
    objectKey: row.object_key,
    requestId: row.request_id,
    sizeBytes: Number(row.size_bytes),
  };
}

function mapModerationAction(
  row: ModerationActionRow,
): RequestModerationAction {
  return {
    action: row.action_type,
    comment: row.comment,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    moderatorUserId: row.moderator_user_id,
    requestId: row.request_id,
  };
}

function mapAuditPatch(row: AuditPatchRow): AuditPatch {
  return {
    affectedEntityId: row.affected_entity_id,
    affectedEntityType: row.affected_entity_type,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    patch: row.patch,
    reason: row.reason,
    recalculationStatus: row.recalculation_status,
    requestId: row.request_id,
  };
}

function mapWorkflowAction(row: WorkflowActionRow): RequestWorkflowAction {
  return {
    action: row.action,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    moderatorUserId: row.moderator_user_id,
    payload: row.payload,
    requestId: row.request_id,
  };
}

function isAttachmentInput(
  input: CreatePlayerRequestInput | CreateRequestAttachmentInput,
): input is CreateRequestAttachmentInput {
  return "objectKey" in input;
}

function referenceTable(type: RequestReference["type"]): string {
  if (type === "player") {
    return "canonical_players";
  }
  if (type === "replay") {
    return "replays";
  }
  if (type === "squad") {
    return "squads";
  }
  return "player_stats";
}

function firstRow<T>(rows: T[]): T {
  return (rows as [T, ...T[]])[0];
}
