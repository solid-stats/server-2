/* eslint-disable unicorn/no-null */
import { expect, it } from "vitest";

import { InMemoryPlayerRequestRepository } from "../memory.js";

import { buildRequestsApp, loginCookie } from "./fixtures.js";
import { FakeRequestSteamAdapter } from "./steam.js";
import { FakeRequestAttachmentStorage } from "./storage.js";

const CREATED = 201,
  NOT_FOUND = 404,
  OK = 200,
  UNAUTHORIZED = 401;

async function createRequest(
  app: Awaited<ReturnType<typeof buildRequestsApp>>,
) {
  const cookie = await loginCookie(app),
    response = await app.inject({
      body: {
        description: "Attach screenshot evidence",
        type: "stats_correction",
      },
      headers: { cookie },
      method: "POST",
      url: "/requests",
    }),
    body: { id: string } = response.json();
  return { cookie, requestId: body.id };
}

it("Creates an upload ticket and records an attachment for the request owner", async () => {
  const storage = new FakeRequestAttachmentStorage(),
    app = await buildRequestsApp({ attachmentStorage: storage });

  try {
    const { cookie, requestId } = await createRequest(app),
      created = await app.inject({
        body: {
          checksum: "sha256:request-attachment",
          contentType: "image/png",
          fileName: "proof.png",
          sizeBytes: 128,
        },
        headers: { cookie },
        method: "POST",
        url: `/requests/${requestId}/attachments`,
      }),
      listed = await app.inject({
        headers: { cookie },
        method: "GET",
        url: `/requests/${requestId}/attachments`,
      }),
      withoutChecksum = await app.inject({
        body: {
          contentType: "text/plain",
          fileName: "notes.txt",
          sizeBytes: 64,
        },
        headers: { cookie },
        method: "POST",
        url: `/requests/${requestId}/attachments`,
      });

    expect(created.statusCode).toBe(CREATED);
    expect(created.json()).toMatchObject({
      checksum: "sha256:request-attachment",
      contentType: "image/png",
      fileName: "proof.png",
      objectKey: `attachments/${requestId}/upload-proof.png`,
      requestId,
      sizeBytes: 128,
      uploadHeaders: { "content-type": "image/png" },
      uploadUrl: `https://storage.example.test/${requestId}/proof.png`,
    });
    expect(storage.lastInput).toEqual({
      contentType: "text/plain",
      fileName: "notes.txt",
      requestId,
      sizeBytes: 64,
    });
    expect(listed.statusCode).toBe(OK);
    expect(listed.json()).toMatchObject([
      {
        fileName: "proof.png",
        objectKey: `attachments/${requestId}/upload-proof.png`,
      },
    ]);
    expect(withoutChecksum.statusCode).toBe(CREATED);
    expect(withoutChecksum.json()).toMatchObject({
      checksum: null,
      fileName: "notes.txt",
    });
  } finally {
    await app.close();
  }
});

it("Rejects attachment access for anonymous users and non-owners", async () => {
  const requests = new InMemoryPlayerRequestRepository(),
    firstSteam = new FakeRequestSteamAdapter(),
    firstApp = await buildRequestsApp({ requests, steam: firstSteam });

  try {
    const { requestId } = await createRequest(firstApp),
      anonymousCreate = await firstApp.inject({
        body: {
          contentType: "image/png",
          fileName: "proof.png",
          sizeBytes: 128,
        },
        method: "POST",
        url: `/requests/${requestId}/attachments`,
      }),
      anonymousList = await firstApp.inject({
        method: "GET",
        url: `/requests/${requestId}/attachments`,
      });

    expect(anonymousCreate.statusCode).toBe(UNAUTHORIZED);
    expect(anonymousList.statusCode).toBe(UNAUTHORIZED);

    const secondSteam = new FakeRequestSteamAdapter();
    secondSteam.identity = {
      displayName: "Other User",
      steamId: "76561198000000703",
    };
    const secondApp = await buildRequestsApp({ requests, steam: secondSteam });
    try {
      const secondCookie = await loginCookie(secondApp),
        createResponse = await secondApp.inject({
          body: {
            contentType: "image/png",
            fileName: "proof.png",
            sizeBytes: 128,
          },
          headers: { cookie: secondCookie },
          method: "POST",
          url: `/requests/${requestId}/attachments`,
        }),
        listResponse = await secondApp.inject({
          headers: { cookie: secondCookie },
          method: "GET",
          url: `/requests/${requestId}/attachments`,
        });

      expect(createResponse.statusCode).toBe(NOT_FOUND);
      expect(createResponse.json()).toEqual({ message: "request not found" });
      expect(listResponse.statusCode).toBe(NOT_FOUND);
      expect(listResponse.json()).toEqual({ message: "request not found" });
    } finally {
      await secondApp.close();
    }
  } finally {
    await firstApp.close();
  }
});
