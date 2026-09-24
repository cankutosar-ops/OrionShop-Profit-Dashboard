import { NextResponse } from "next/server";
import { authorize, isAuthzFailure } from "@/lib/security/authorize";
import { deleteCompanyExpense, updateCompanyExpense } from "@/services/company-expense-service";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.companyId !== "string") return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const authz = await authorize(request, { companyId: body.companyId });
  if (isAuthzFailure(authz)) return authz;
  const { id } = await context.params;
  try {
    const expense = await updateCompanyExpense(body.companyId, id, authz.user.id, {
      expenseDate: body.expenseDate, category: body.category, description: body.description,
      amount: body.amount, taxDeductible: body.taxDeductible, userOverrode: body.userOverrode,
      evidenceStatus: body.evidenceStatus, documentReference: body.documentReference,
      paymentStatus: body.paymentStatus, paymentDate: body.paymentDate,
      paidAmount: body.paidAmount, paymentReference: body.paymentReference,
    });
    return NextResponse.json({ expense });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Expense could not be updated" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const authz = await authorize(request, { companyId });
  if (isAuthzFailure(authz)) return authz;
  const { id } = await context.params;
  try {
    await deleteCompanyExpense(companyId, id, authz.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Expense could not be deleted" }, { status: 400 });
  }
}
