import { NextResponse } from "next/server";
import { authorize, isAuthzFailure } from "@/lib/security/authorize";
import { appendCompanyTaxProfile, listCompanyTaxProfiles, moscowToday } from "@/services/tax-profile-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const authz = await authorize(request, { companyId });
  if (isAuthzFailure(authz)) return authz;
  try {
    return NextResponse.json({ profiles: await listCompanyTaxProfiles(companyId), today: moscowToday() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tax profiles unavailable" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.companyId !== "string") return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const authz = await authorize(request, { companyId: body.companyId });
  if (isAuthzFailure(authz)) return authz;
  try {
    const profile = await appendCompanyTaxProfile({
      companyId: body.companyId, model: body.model,
      customObject: body.customObject, customRate: body.customRate,
      effectiveFrom: body.effectiveFrom,
    });
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tax profile could not be saved" }, { status: 400 });
  }
}
