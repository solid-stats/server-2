import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createOpenApiSchema } from "./schema.js";

const outputPath = resolve("openapi/server-2.openapi.json");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, await createOpenApiSchema());
