const LAST_FOUR = 4;

/**
 * Mask a full Steam64 (or any SteamID-shaped string) to a leading-ellipsis
 * last-4 form, e.g. "76561198012347890" -> "...7890". This is the single
 * row->payload choke point (called from `mapPlayerProfile`) that ensures a full
 * Steam64 (`7656119\d{10}`) never leaves the server. Short/edge values yield
 * "..." plus whatever trailing characters are available, never throwing.
 */
export function maskSteamId(steamId: string): string {
  return `...${steamId.slice(-LAST_FOUR)}`;
}
