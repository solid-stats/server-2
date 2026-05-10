import { buildApp } from "../app.js";

export async function createOpenApiSchema(): Promise<string> {
  const app = await buildApp({ logger: false });
  try {
    await app.ready();
    return `${JSON.stringify(app.swagger(), undefined, 2)}\n`;
  } finally {
    await app.close();
  }
}
