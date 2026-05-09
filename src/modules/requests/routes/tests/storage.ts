import type {
  CreateRequestAttachmentUploadInput,
  RequestAttachmentStorage,
  RequestAttachmentUpload,
} from "../models.js";

export class FakeRequestAttachmentStorage implements RequestAttachmentStorage {
  public lastInput: CreateRequestAttachmentUploadInput | undefined;

  public async createUpload(
    input: CreateRequestAttachmentUploadInput,
  ): Promise<RequestAttachmentUpload> {
    this.lastInput = input;
    return {
      expiresAt: "2026-05-09T17:00:00.000Z",
      headers: {
        "content-type": input.contentType,
      },
      objectKey: `attachments/${input.requestId}/upload-${input.fileName}`,
      uploadUrl: `https://storage.example.test/${input.requestId}/${input.fileName}`,
    };
  }
}
