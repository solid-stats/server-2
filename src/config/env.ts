import { bool, cleanEnv, host, port, str, url } from "envalid";

export type AppEnvironment = "development" | "test" | "production";

export interface AppConfig {
  env: AppEnvironment;
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  rabbitmqUrl: string;
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = cleanEnv(env, {
    NODE_ENV: str({
      choices: ["development", "test", "production"],
      default: "development",
    }),
    HOST: host({ default: "0.0.0.0" }),
    PORT: port({ default: 3000 }),
    LOG_LEVEL: str({ default: "info" }),
    DATABASE_URL: url(),
    RABBITMQ_URL: url(),
    S3_ENDPOINT: url(),
    S3_REGION: str({ default: "us-east-1" }),
    S3_BUCKET: str(),
    S3_ACCESS_KEY_ID: str(),
    S3_SECRET_ACCESS_KEY: str(),
    S3_FORCE_PATH_STYLE: bool({ default: true }),
  });

  return {
    env: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    rabbitmqUrl: parsed.RABBITMQ_URL,
    s3: {
      endpoint: parsed.S3_ENDPOINT,
      region: parsed.S3_REGION,
      bucket: parsed.S3_BUCKET,
      accessKeyId: parsed.S3_ACCESS_KEY_ID,
      secretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
      forcePathStyle: parsed.S3_FORCE_PATH_STYLE,
    },
  };
}

export function redactConfigForLogs(
  config: AppConfig,
): Record<string, unknown> {
  return {
    env: config.env,
    host: config.host,
    port: config.port,
    logLevel: config.logLevel,
    databaseUrl: redactUrl(config.databaseUrl),
    rabbitmqUrl: redactUrl(config.rabbitmqUrl),
    s3: {
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      bucket: config.s3.bucket,
      accessKeyId: redactValue(config.s3.accessKeyId),
      secretAccessKey: redactValue(config.s3.secretAccessKey),
      forcePathStyle: config.s3.forcePathStyle,
    },
  };
}

function redactUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.username) parsed.username = "redacted";
    if (parsed.password) parsed.password = "redacted";
    return parsed.toString();
  } catch {
    return "redacted";
  }
}

function redactValue(value: string): string {
  return value.length > 0 ? "redacted" : "";
}
