import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import { isIsoDate } from "@/services/tax-profile-service";
import {
  reconcileCompanyPurchaseRecognition,
  saveCompanyPurchaseTaxPolicy,
} from "@/services/purchase-tax-recognition-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authz = await authorizeRequestScope(request, { allowDefaultAccount: true });
    if (isAuthzFailure(authz)) return authz;
    if (!authz.companyId) throw new Error("Company scope is required");
    const body = await request.json();
    if (body.action === "configure_fifo_policy") {
      return NextResponse.json({ policy: await saveCompanyPurchaseTaxPolicy({
        companyId: authz.companyId,
        effectiveFrom: body.effectiveFrom,
        evidenceReference: String(body.evidenceReference ?? ""),
      }) });
    }
    if (body.action !== "reconcile" || !isIsoDate(body.asOfDate)) {
      throw new Error("Valid action and asOfDate are required");
    }
    return NextResponse.json(await reconcileCompanyPurchaseRecognition(authz.companyId, body.asOfDate));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Purchase recognition failed",
    }, { status: 400 });
  }
}
