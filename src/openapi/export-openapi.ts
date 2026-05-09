import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildApp } from "../app.js";

const outputPath = resolve("openapi/server-2.openapi.json");
const app = await buildApp({ logger: false });

await app.ready();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
