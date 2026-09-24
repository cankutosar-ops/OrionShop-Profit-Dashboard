import { NextResponse } from "next/server";
import { authorize, isAuthzFailure } from "@/lib/security/authorize";
import { getCompanyTaxFoundation } from "@/services/company-tax-service";
import { isIsoDate } from "@/services/tax-profile-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!companyId || !isIsoDate(from) || !isIsoDate(to) || from > to) {
    return NextResponse.json({ error: "companyId and valid from/to dates are required" }, { status: 400 });
  }
  const authz = await authorize(request, { companyId });
  if (isAuthzFailure(authz)) return authz;
  try {
    return NextResponse.json(await getCompanyTaxFoundation(companyId, from, to));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tax foundation unavailable" }, { status: 500 });
  }
}
