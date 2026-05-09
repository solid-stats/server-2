import type {
  SteamIdentity,
  SteamLoginUrlInput,
  SteamOpenIdAdapter,
} from "../../../auth/routes/models.js";

export const steamId = "76561198000000701";

export class FakeRequestSteamAdapter implements SteamOpenIdAdapter {
  public identity: SteamIdentity = {
    displayName: "Request User",
    steamId,
  };

  public lastLoginInput: SteamLoginUrlInput | undefined;

  public loginUrl(input: SteamLoginUrlInput): URL {
    this.lastLoginInput = input;
    return new URL("https://steamcommunity.com/openid/login?request=1");
  }

  public verifyCallback(): Promise<SteamIdentity> {
    return Promise.resolve(this.identity);
  }
}
