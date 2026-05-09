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

  it("Stores request attachments by request id", async () => {
    const repository = new InMemoryPlayerRequestRepository(),
      request = await repository.create({
        description: "Needs evidence",
        requesterUserId: "user-1",
        type: "stats_correction",
      }),
      attachment = await repository.create({
        contentType: "image/png",
        fileName: "proof.png",
        objectKey: "attachments/request/proof.png",
        requestId: request.id,
        sizeBytes: 128,
      }),
      secondAttachment = await repository.create({
        contentType: "text/plain",
        fileName: "notes.txt",
        objectKey: "attachments/request/notes.txt",
        requestId: request.id,
        sizeBytes: 64,
      });

    await expect(repository.listForRequest(request.id)).resolves.toEqual([
      attachment,
      secondAttachment,
    ]);
    await expect(repository.listForRequest("missing")).resolves.toEqual([]);
  });
});
