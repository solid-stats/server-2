import { randomUUID } from "node:crypto";

import {
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { AppConfig } from "../../config/env.js";
import type {
  CreateRequestAttachmentUploadInput,
  RequestAttachmentStorage,
  RequestAttachmentUpload,
} from "../../modules/requests/routes/models.js";
import type { HealthCheckResult, HealthCheckable } from "../health.js";

const MILLISECONDS_PER_SECOND = 1000,
  REQUEST_ATTACHMENT_UPLOAD_TTL_SECONDS = 900;

export interface StorageClient
  extends HealthCheckable, RequestAttachmentStorage {}

export function createStorageClient(config: AppConfig): StorageClient {
  const client = new S3Client({
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    forcePathStyle: config.s3.forcePathStyle,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
  });

  return {
    async check(): Promise<HealthCheckResult> {
      await client.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
      return { status: "ok" };
    },
    async close(): Promise<void> {
      client.destroy();
    },
    async createUpload(
      input: CreateRequestAttachmentUploadInput,
    ): Promise<RequestAttachmentUpload> {
      const objectKey = `attachments/${input.requestId}/${randomUUID()}-${safeFileName(input.fileName)}`,
        uploadUrl = await getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: config.s3.bucket,
            ContentLength: input.sizeBytes,
            ContentType: input.contentType,
            Key: objectKey,
          }),
          { expiresIn: REQUEST_ATTACHMENT_UPLOAD_TTL_SECONDS },
        );
      return {
        expiresAt: new Date(
          Date.now() +
            REQUEST_ATTACHMENT_UPLOAD_TTL_SECONDS * MILLISECONDS_PER_SECOND,
        ).toISOString(),
        headers: {
          "content-type": input.contentType,
        },
        objectKey,
        uploadUrl,
      };
    },
  };
}

function safeFileName(fileName: string): string {
  return fileName.replaceAll(/[^.\-0-9A-Z_a-z]/gu, "_");
}
