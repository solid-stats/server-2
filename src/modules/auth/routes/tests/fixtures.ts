import type {
  SteamIdentity,
  SteamLoginUrlInput,
  SteamOpenIdAdapter,
} from "../models.js";

export const authCookieName = "solid_session_test",
  authUserId = "00000000-0000-4000-8000-000000000601",
  steamId = "76561198000000001";

export class FakeSteamOpenIdAdapter implements SteamOpenIdAdapter {
  public lastLoginInput: SteamLoginUrlInput | undefined;

  public shouldReject = false;

  public loginUrl(input: SteamLoginUrlInput): URL {
    this.lastLoginInput = input;
    return new URL("https://steamcommunity.com/openid/login?test=1");
  }

  public verifyCallback(): Promise<SteamIdentity> {
    if (this.shouldReject) {
      return Promise.reject(new Error("invalid steam callback"));
    }
    return Promise.resolve({
      displayName: "Steam Alpha",
      steamId,
    });
  }
}
