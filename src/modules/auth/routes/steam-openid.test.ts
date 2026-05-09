import { afterEach, describe, expect, it, vi } from "vitest";

import { extractSteamId, SteamOpenIdClient } from "./steam-openid.js";

describe("SteamOpenIdClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds Steam OpenID login URLs", () => {
    const client = new SteamOpenIdClient(),
      url = client.loginUrl({
        realm: "http://localhost:3000",
        returnTo: "http://localhost:3000/auth/steam/callback",
      });

    expect(url.origin).toBe("https://steamcommunity.com");
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.return_to")).toBe(
      "http://localhost:3000/auth/steam/callback",
    );
  });

  it("verifies OpenID callbacks and extracts Steam IDs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("is_valid:true"))),
    );

    const client = new SteamOpenIdClient(),
      identity = await client.verifyCallback({
        "openid.claimed_id":
          "https://steamcommunity.com/openid/id/76561198000000001",
        "openid.mode": "id_res",
      });

    expect(identity).toEqual({
      displayName: "Steam 76561198000000001",
      steamId: "76561198000000001",
    });
    expect(extractSteamId("bad")).toBeUndefined();
  });

  it("rejects callbacks without a Steam ID or valid signature", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("is_valid:false"))),
    );

    const client = new SteamOpenIdClient();

    await expect(client.verifyCallback({})).rejects.toThrow(
      "Steam OpenID callback did not include a Steam ID.",
    );
    await expect(
      client.verifyCallback({
        "openid.claimed_id":
          "https://steamcommunity.com/openid/id/76561198000000001",
      }),
    ).rejects.toThrow("Steam OpenID signature verification failed.");
  });
});
