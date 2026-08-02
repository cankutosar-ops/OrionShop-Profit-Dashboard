import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import {
  clientIpFromRequest,
  deviceFromRequest,
  maskIp,
  recordAuditEvent,
} from "@/services/administration-audit-service";

export const dynamic = "force-dynamic";

async function signOutWithAudit(request: Request) {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.auth.signOut();
  void recordAuditEvent({
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    module: "authentication",
    action: "logout",
    result: "success",
    eventKind: "login",
    device: deviceFromRequest(request),
    ipMasked: maskIp(clientIpFromRequest(request)),
  });
}

/** Clear the authenticated session cookies. */
export async function POST(request: Request) {
  await signOutWithAudit(request);
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  await signOutWithAudit(request);
  return NextResponse.redirect(new URL("/login", request.url));
}
