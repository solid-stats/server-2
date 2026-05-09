import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "server-2",
        version: "0.1.0"
      }
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });
}
