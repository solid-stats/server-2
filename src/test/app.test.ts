import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

describe("buildApp", () => {
  it("serves liveness", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });

  it("serves readiness, metrics, and OpenAPI", async () => {
    const app = await buildApp();

    const ready = await app.inject({ method: "GET", url: "/ready" });
    const metrics = await app.inject({ method: "GET", url: "/metrics" });
    const openapi = await app.inject({ method: "GET", url: "/openapi.json" });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: "ready" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain("server2_process_cpu_user_seconds_total");
    expect(openapi.statusCode).toBe(200);
    expect(openapi.json()).toMatchObject({
      openapi: "3.0.3",
      info: { title: "server-2" }
    });

    await app.close();
  });
});
