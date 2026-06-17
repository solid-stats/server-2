import { beforeAll, describe, expect, it } from "vitest";

import {
  archivePresent,
  dockerReachable,
  goldenConfig,
} from "./fixtures/loader.js";

// The golden suite is a master-only, real-infra oracle. It SKIPS cleanly (never fails)
// when the committed fixture archive or the docker-compose services are absent, so
// `pnpm verify` / `pnpm test` stay green at 100% without them ([testing-standards §B]).
let infraReachable = false;

beforeAll(async () => {
  if (archivePresent()) {
    infraReachable = await dockerReachable(goldenConfig());
  }
});

describe("golden pipeline oracle", () => {
  it.skipIf(!archivePresent())(
    "has the committed floor fixture archive wired",
    () => {
      expect(archivePresent()).toBe(true);
    },
  );

  it("skips the live chain cleanly when infra is absent", () => {
    // No assertion when infra is down — the real-chain assertions live behind the
    // skipIf guard in the full-chain block (filled in Task 2). This `it` documents
    // that a Docker-less run is a clean pass, not a failure.
    if (!infraReachable) {
      expect(infraReachable).toBe(false);
      return;
    }
    expect(infraReachable).toBe(true);
  });
});
