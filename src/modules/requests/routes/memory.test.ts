import { describe, expect, it } from "vitest";

import { InMemoryPlayerRequestRepository } from "./memory.js";

describe("InMemoryPlayerRequestRepository", () => {
  it("Sorts requests by creation time and scopes them by requester", async () => {
    const repository = new InMemoryPlayerRequestRepository(),
      first = await repository.create({
        description: "First",
        requesterUserId: "user-1",
        type: "identity_correction",
      }),
      second = await repository.create({
        description: "Second",
        requesterUserId: "user-1",
        type: "steam_link",
      });

    await repository.create({
      description: "Other",
      requesterUserId: "user-2",
      type: "stats_correction",
    });

    await expect(repository.listForRequester("user-1")).resolves.toEqual([
      first,
      second,
    ]);
    await expect(
      repository.findForRequester(first.id, "user-2"),
    ).resolves.toBeNull();
  });
});
