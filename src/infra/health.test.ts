import { expect, test } from "vitest";

import { checkAll, createStaticHealthCheck } from "./health.js";

test("checkAll should capture thrown health check failures when dependency probes throw", async () => {
  const summary = await checkAll({
    broken: {
      async check() {
        throw new Error("connection refused");
      },
      close: () => Promise.resolve(),
    },
    ok: createStaticHealthCheck(),
  });

  expect(summary.ready).toBe(false);
  expect(summary.checks).toMatchObject({
    broken: {
      message: "health check failed",
      status: "error",
    },
    ok: {
      status: "ok",
    },
  });
});

test("createStaticHealthCheck should expose a no-op close function for uniform dependency cleanup", async () => {
  const check = createStaticHealthCheck();

  await expect(check.close()).resolves.toBeUndefined();
});
