/**
 * Sprint 7.1.A — Emergency containment gate (not application authentication).
 * Sprint 7.1.E — production requires INTERNAL_API_SECRET (not service_role as Bearer).
 *
 * Edge-safe (Web Crypto) so Next.js middleware can mint/verify cookies.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isPlaceholderSecret,
  resolveInternalApiSecret,
  tryResolveInternalApiSecret,
} from "@/lib/security/secrets";

export const CONTAINMENT_COOKIE = "orion_cg";
export const CONTAINMENT_HEADER = "x-orion-internal-secret";

function containmentSigningMaterial(): string {
  return resolveInternalApiSecret();
}

function dayBucket(ms: number): number {
  return Math.floor(ms / 86_400_000);
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(payload: string): Promise<string> {
  const keyData = new TextEncoder().encode(containmentSigningMaterial());
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(sig);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

/** Mint a short-lived containment token (valid ~48h across day buckets). */
export async function mintContainmentToken(nowMs = Date.now()): Promise<string> {
  const day = dayBucket(nowMs);
  const payload = `v1.${day}`;
  const sig = await hmacHex(payload);
  return `${payload}.${sig}`;
}

export async function verifyContainmentToken(
  token: string | undefined | null,
  nowMs = Date.now()
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, dayStr, sig] = parts;
  if (version !== "v1" || !dayStr || !sig) return false;
  const day = Number(dayStr);
  if (!Number.isFinite(day)) return false;

  const today = dayBucket(nowMs);
  if (day !== today && day !== today - 1) return false;

  const payload = `${version}.${dayStr}`;
  const expected = await hmacHex(payload);
  return timingSafeEqualHex(sig, expected);
}

function extractBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

/**
 * True when the caller presents a valid containment cookie or the
 * INTERNAL_API_SECRET Bearer (server-to-server / CLI).
 */
export async function hasContainmentAccess(request: Request): Promise<boolean> {
  try {
    const secret = tryResolveInternalApiSecret();
    if (secret && !isPlaceholderSecret(secret)) {
      const bearer = extractBearer(request);
      const headerSecret = request.headers.get(CONTAINMENT_HEADER)?.trim();
      if (bearer === secret || headerSecret === secret) return true;
    }

    const cookieHeader = request.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${CONTAINMENT_COOKIE}=([^;]+)`));
    const raw = match?.[1] ? decodeURIComponent(match[1]) : null;
    return verifyContainmentToken(raw);
  } catch {
    return false;
  }
}

export function containmentUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Unauthorized",
      code: "CONTAINMENT_GATE",
      message:
        "This endpoint requires a valid application containment token. Open the app in a browser or pass INTERNAL_API_SECRET.",
    },
    { status: 401 }
  );
}

/** Guard for Route Handlers — return a 401 Response when access is denied. */
export async function requireContainmentGate(request: Request): Promise<NextResponse | null> {
  if (await hasContainmentAccess(request)) return null;
  return containmentUnauthorizedResponse();
}

export async function applyContainmentCookie(
  response: NextResponse,
  request?: NextRequest
): Promise<NextResponse> {
  try {
    const token = await mintContainmentToken();
    const secure =
      request?.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
    response.cookies.set({
      name: CONTAINMENT_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
      maxAge: 60 * 60 * 48,
    });
  } catch {
    // Missing signing material — cookie not set; APIs will 401 until env is fixed.
  }
  return response;
}

/** Authorization header value for trusted server→self fetches. */
export function containmentServerAuthHeader(): Record<string, string> {
  const secret = resolveInternalApiSecret();
  return { Authorization: `Bearer ${secret}` };
}
