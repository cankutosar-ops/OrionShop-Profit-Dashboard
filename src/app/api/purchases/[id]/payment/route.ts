import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import { updatePurchasePaymentEvidence } from "@/services/purchase-tax-recognition-service";
import type { PurchasePaymentStatus } from "@/types/database";

export const dynamic = "force-dynamic";

const PAYMENT_STATUSES = new Set<PurchasePaymentStatus>(["UNPAID", "PARTIALLY_PAID", "PAID"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authz = await authorizeRequestScope(request, {
      allowDefaultAccount: true,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;
    const body = await request.json();
    const paymentStatus = String(body.paymentStatus ?? "") as PurchasePaymentStatus;
    if (!PAYMENT_STATUSES.has(paymentStatus)) throw new Error("Invalid payment status");
    const paidAmount = Number(body.paidAmount ?? 0);
    const paymentFxRate = body.paymentFxRate === null || body.paymentFxRate === "" ||
      body.paymentFxRate === undefined ? null : Number(body.paymentFxRate);
    if (!Number.isFinite(paidAmount) || paidAmount < 0 ||
      (paymentFxRate !== null && (!Number.isFinite(paymentFxRate) || paymentFxRate <= 0))) {
      throw new Error("Payment and FX amounts must be valid positive numbers");
    }
    const { id } = await context.params;
    const purchase = await updatePurchasePaymentEvidence({
      purchaseId: id,
      marketplaceAccountId: authz.marketplaceAccountId!,
      paymentStatus,
      paymentDate: body.paymentDate ? String(body.paymentDate) : null,
      paidAmount,
      paymentReference: body.paymentReference ? String(body.paymentReference) : null,
      paymentFxRate,
      paymentFxReference: body.paymentFxReference ? String(body.paymentFxReference) : null,
    });
    return NextResponse.json({ purchase });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Payment evidence could not be saved",
    }, { status: 400 });
  }
}
