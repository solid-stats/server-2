/* eslint-disable unicorn/no-null */
import { randomUUID } from "node:crypto";

import type {
  AuditPatch,
  AuditPatchRepository,
  CreatePlayerRequestInput,
  CreateAuditPatchInput,
  CreateRequestAttachmentInput,
  PlayerRequest,
  PlayerRequestRepository,
  RequestAttachment,
  RequestAttachmentRepository,
  RequestModerationAction,
  RequestModerationRepository,
} from "./models.js";

export class InMemoryPlayerRequestRepository
  implements
    PlayerRequestRepository,
    RequestAttachmentRepository,
    AuditPatchRepository,
    RequestModerationRepository
{
  private readonly auditPatches = new Map<string, AuditPatch[]>();

  private readonly actions = new Map<string, RequestModerationAction[]>();

  private readonly attachments = new Map<string, RequestAttachment[]>();

  private readonly requests = new Map<string, PlayerRequest>();

  public async create(input: CreatePlayerRequestInput): Promise<PlayerRequest>;

  public async create(
    input: CreateRequestAttachmentInput,
  ): Promise<RequestAttachment>;

  public async create(
    input: CreatePlayerRequestInput | CreateRequestAttachmentInput,
  ): Promise<PlayerRequest | RequestAttachment> {
    if (isAttachmentInput(input)) {
      return this.createAttachment(input);
    }

    const now = new Date().toISOString(),
      request = {
        createdAt: now,
        description: input.description,
        id: randomUUID(),
        reference: input.reference ?? null,
        requesterUserId: input.requesterUserId,
        status: "submitted" as const,
        type: input.type,
        updatedAt: now,
      };
    this.requests.set(request.id, request);
    return request;
  }

  public async findForRequester(
    id: string,
    requesterUserId: string,
  ): Promise<PlayerRequest | null> {
    const request = this.requests.get(id);
    if (request?.requesterUserId !== requesterUserId) {
      return null;
    }
    return request;
  }

  public async listForRequester(
    requesterUserId: string,
  ): Promise<PlayerRequest[]> {
    return [...this.requests.values()]
      .filter((request) => request.requesterUserId === requesterUserId)
      .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  public async listForRequest(requestId: string): Promise<RequestAttachment[]> {
    return [...(this.attachments.get(requestId) ?? [])].toSorted(
      (left, right) => left.createdAt.localeCompare(right.createdAt),
    );
  }

  public async listForModeration(): Promise<PlayerRequest[]> {
    return [...this.requests.values()].toSorted((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  public async findForModeration(id: string): Promise<PlayerRequest | null> {
    return this.requests.get(id) ?? null;
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
    const request = this.requests.get(input.requestId);
    if (request === undefined) {
      return null;
    }
    const now = new Date().toISOString(),
      updatedRequest = {
        ...request,
        status: input.action === "approve" ? "approved" : "rejected",
        updatedAt: now,
      } as const,
      action = {
        action: input.action,
        comment: input.comment,
        createdAt: now,
        id: randomUUID(),
        moderatorUserId: input.moderatorUserId,
        requestId: input.requestId,
      };
    this.requests.set(input.requestId, updatedRequest);
    this.actions.set(input.requestId, [
      ...(this.actions.get(input.requestId) ?? []),
      action,
    ]);
    return { action, request: updatedRequest };
  }

  public async listActions(
    requestId: string,
  ): Promise<RequestModerationAction[]> {
    return [...(this.actions.get(requestId) ?? [])].toSorted((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  public async createAuditPatch(
    input: CreateAuditPatchInput,
  ): Promise<AuditPatch> {
    const auditPatch = {
        affectedEntityId: input.affectedEntityId ?? null,
        affectedEntityType: input.affectedEntityType,
        createdAt: new Date().toISOString(),
        id: randomUUID(),
        patch: input.patch,
        reason: input.reason,
        recalculationStatus: input.recalculationStatus,
        requestId: input.requestId,
      },
      patches = this.auditPatches.get(input.requestId) ?? [];
    patches.push(auditPatch);
    this.auditPatches.set(input.requestId, patches);
    return auditPatch;
  }

  public async listAuditPatchesForRequest(
    requestId: string,
  ): Promise<AuditPatch[]> {
    return [...(this.auditPatches.get(requestId) ?? [])].toSorted(
      (left, right) => left.createdAt.localeCompare(right.createdAt),
    );
  }

  private createAttachment(
    input: CreateRequestAttachmentInput,
  ): RequestAttachment {
    const attachment = {
        checksum: input.checksum ?? null,
        contentType: input.contentType,
        createdAt: new Date().toISOString(),
        fileName: input.fileName,
        id: randomUUID(),
        objectKey: input.objectKey,
        requestId: input.requestId,
        sizeBytes: input.sizeBytes,
      },
      attachments = this.attachments.get(input.requestId) ?? [];
    attachments.push(attachment);
    this.attachments.set(input.requestId, attachments);
    return attachment;
  }
}

function isAttachmentInput(
  input: CreatePlayerRequestInput | CreateRequestAttachmentInput,
): input is CreateRequestAttachmentInput {
  return "objectKey" in input;
}
