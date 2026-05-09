import { randomUUID } from "node:crypto";

import type {
  CreateRequestAttachmentUploadInput,
  RequestAttachmentStorage,
  RequestAttachmentUpload,
} from "./models.js";

const DEFAULT_UPLOAD_TTL_MILLISECONDS = 900_000;

export class InMemoryRequestAttachmentStorage implements RequestAttachmentStorage {
  public readonly protocol = "memory";

  public async createUpload(
    input: CreateRequestAttachmentUploadInput,
  ): Promise<RequestAttachmentUpload> {
    const objectKey = `attachments/${input.requestId}/${randomUUID()}-${safeFileName(input.fileName)}`;
    return {
      expiresAt: new Date(
        Date.now() + DEFAULT_UPLOAD_TTL_MILLISECONDS,
      ).toISOString(),
      headers: {
        "content-type": input.contentType,
      },
      objectKey,
      uploadUrl: `${this.protocol}://${objectKey}`,
    };
  }
}

function safeFileName(fileName: string): string {
  return fileName.replaceAll(/[^.\-0-9A-Z_a-z]/gu, "_");
}
