import { readFile } from "node:fs/promises";

const [runbook, compose, envExample] = await Promise.all([
  readFile("docs/backup-restore.md", "utf8"),
  readFile("docker-compose.prod.yml", "utf8"),
  readFile(".env.production.example", "utf8"),
]);

const requiredRunbookTerms = [
    "docker-compose.prod.yml",
    "pg_dump",
    "pg_restore",
    "mc mirror",
    "GET /ready",
    "Validation Checklist",
    "postgres-data",
    "minio-data",
  ],
  requiredComposeTerms = ["postgres-data", "minio-data", "postgres", "minio"],
  requiredEnvironmentTerms = [
    "POSTGRES_PASSWORD",
    "MINIO_ROOT_PASSWORD",
    "S3_BUCKET",
  ],
  missing = [
    ...missingTerms("docs/backup-restore.md", runbook, requiredRunbookTerms),
    ...missingTerms("docker-compose.prod.yml", compose, requiredComposeTerms),
    ...missingTerms(
      ".env.production.example",
      envExample,
      requiredEnvironmentTerms,
    ),
  ];

if (missing.length > 0) {
  process.stderr.write(`${missing.join("\n")}\n`);
  process.exitCode = 1;
}

function missingTerms(
  file: string,
  content: string,
  terms: string[],
): string[] {
  return terms
    .filter((term) => !content.includes(term))
    .map((term) => `${file} is missing required backup term: ${term}`);
}
