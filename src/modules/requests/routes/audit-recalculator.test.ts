import { expect, it } from "vitest";

import { NoopAuditPatchRecalculator } from "./audit-recalculator.js";

it("NoopAuditPatchRecalculator should report recalculated status", async () => {
  const recalculator = new NoopAuditPatchRecalculator();

  await expect(
    recalculator.recalculateForPatch({
      affectedEntityType: "player_stat",
      patch: { kills: 12 },
      reason: "Manual correction",
      recalculationStatus: "pending",
      requestId: "request-1",
    }),
  ).resolves.toEqual({ status: "recalculated" });
});
