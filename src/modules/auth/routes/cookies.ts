import type { SessionCookieOptions } from "./models.js";

export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim())
    .map((part) => part.split("="))
    .find(([cookieName]) => cookieName === name)
    ?.slice(1)
    .join("=");
}

export function sessionCookie(
  options: SessionCookieOptions,
  value: string,
): string {
  return [
    `${options.name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${String(options.ttlSeconds)}`,
  ].join("; ");
}

export function expiredSessionCookie(options: SessionCookieOptions): string {
  return [
    `${options.name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}
