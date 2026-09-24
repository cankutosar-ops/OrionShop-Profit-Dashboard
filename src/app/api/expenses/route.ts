import { NextResponse } from "next/server";
import { authorize, isAuthzFailure } from "@/lib/security/authorize";
import { createCompanyExpense, listCompanyExpenses } from "@/services/company-expense-service";
import { isIsoDate } from "@/services/tax-profile-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const authz = await authorize(request, { companyId });
  if (isAuthzFailure(authz)) return authz;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to)) || (from && to && from > to)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  try {
    return NextResponse.json({ expenses: await listCompanyExpenses(companyId, from ?? undefined, to ?? undefined) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Expenses unavailable" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.companyId !== "string") return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const authz = await authorize(request, { companyId: body.companyId });
  if (isAuthzFailure(authz)) return authz;
  try {
    const expense = await createCompanyExpense(body.companyId, authz.user.id, {
      expenseDate: body.expenseDate, category: body.category, description: body.description,
      amount: body.amount, taxDeductible: body.taxDeductible, userOverrode: body.userOverrode,
    });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Expense could not be created" }, { status: 400 });
  }
}
