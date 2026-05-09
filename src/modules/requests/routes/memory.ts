/* eslint-disable unicorn/no-null */
import { randomUUID } from "node:crypto";

import type {
  CreatePlayerRequestInput,
  CreateRequestAttachmentInput,
  PlayerRequest,
  PlayerRequestRepository,
  RequestAttachment,
  RequestAttachmentRepository,
} from "./models.js";

export class InMemoryPlayerRequestRepository
  implements PlayerRequestRepository, RequestAttachmentRepository
{
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
