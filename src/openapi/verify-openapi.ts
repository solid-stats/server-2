import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createOpenApiSchema } from "./schema.js";

const schemaPath = resolve("openapi/server-2.openapi.json"),
  committedSchema = await readFile(schemaPath, "utf8"),
  generatedSchema = await createOpenApiSchema();

if (committedSchema !== generatedSchema) {
  process.stderr.write(
    "OpenAPI schema is stale. Run `pnpm run openapi:export` and commit openapi/server-2.openapi.json.\n",
  );
  process.exitCode = 1;
}
