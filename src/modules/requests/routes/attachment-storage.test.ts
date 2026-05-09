import { expect, it } from "vitest";

import { InMemoryRequestAttachmentStorage } from "./attachment-storage.js";

it("InMemoryRequestAttachmentStorage should create upload tickets with safe object keys", async () => {
  const storage = new InMemoryRequestAttachmentStorage();

  const upload = await storage.createUpload({
    contentType: "image/png",
    fileName: "bad name.png",
    requestId: "request-1",
    sizeBytes: 128,
  });

  expect(upload.headers).toEqual({ "content-type": "image/png" });
  expect(upload.uploadUrl).toContain("attachments/request-1/");
  expect(upload.objectKey).toContain("bad_name.png");
});
