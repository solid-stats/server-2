const STEAM_OPENID_LOGIN = "https://steamcommunity.com/openid/login",
  STEAM_OPENID_PROVIDER = "https://steamcommunity.com/openid",
  OPENID_NS = "http://specs.openid.net/auth/2.0",
  OPENID_IDENTIFIER_SELECT =
    "http://specs.openid.net/auth/2.0/identifier_select",
  STEAM_ID_PATTERN =
    /^https:\/\/steamcommunity\.com\/openid\/id\/(?<steamId>\d+)$/u;

export class SteamOpenIdClient {
  public constructor(
    private readonly loginEndpoint = STEAM_OPENID_LOGIN,
    private readonly providerEndpoint = STEAM_OPENID_PROVIDER,
  ) {}

  public loginUrl(input: { realm: string; returnTo: string }): URL {
    const url = new URL(this.loginEndpoint);
    url.searchParams.set("openid.ns", OPENID_NS);
    url.searchParams.set("openid.mode", "checkid_setup");
    url.searchParams.set("openid.return_to", input.returnTo);
    url.searchParams.set("openid.realm", input.realm);
    url.searchParams.set("openid.identity", OPENID_IDENTIFIER_SELECT);
    url.searchParams.set("openid.claimed_id", OPENID_IDENTIFIER_SELECT);
    return url;
  }

  public async verifyCallback(
    query: Readonly<Record<string, string>>,
  ): Promise<{ displayName: string; steamId: string }> {
    const claimedId = query["openid.claimed_id"],
      steamId = extractSteamId(claimedId);
    if (steamId === undefined) {
      throw new Error("Steam OpenID callback did not include a Steam ID.");
    }
    await this.verifySteamSignature(query);
    return { displayName: `Steam ${steamId}`, steamId };
  }

  private async verifySteamSignature(
    query: Readonly<Record<string, string>>,
  ): Promise<void> {
    const body = new URLSearchParams(query);
    body.set("openid.mode", "check_authentication");

    const response = await fetch(this.providerEndpoint, {
        body,
        method: "POST",
      }),
      verification = await response.text();

    if (!verification.includes("is_valid:true")) {
      throw new Error("Steam OpenID signature verification failed.");
    }
  }
}

export function extractSteamId(
  claimedId: string | undefined,
): string | undefined {
  return claimedId?.match(STEAM_ID_PATTERN)?.groups?.["steamId"];
}
