import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

import type { AppConfig } from "../../config/env.js";
import type { HealthCheckResult, HealthCheckable } from "../health.js";

export function createStorageClient(config: AppConfig): HealthCheckable {
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
  };
}
