import { NextResponse } from "next/server";
import { authorize, isAuthzFailure } from "@/lib/security/authorize";
import { isoDate } from "@/lib/recurring-expenses";
import { createRecurringExpense, readRecurringExpenses } from "@/services/company-recurring-expense-service";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const companyId = query.get("companyId"), accountId = query.get("accountId");
  const from = query.get("from"), to = query.get("to");
  if (!companyId || !accountId || !isoDate(from) || !isoDate(to) || from > to ||
      Date.parse(to) - Date.parse(from) > 366 * 5 * 86400000) {
    return NextResponse.json({ error: "Valid company, account and date range required (maximum five years)" }, { status: 400 });
  }
  const auth = await authorize(request, { companyId, marketplaceAccountId: accountId, requireMarketplaceAccount: true });
  if (isAuthzFailure(auth)) return auth;
  try {
    const summary = await readRecurringExpenses({ companyId: auth.companyId!, accountId: auth.marketplaceAccountId!, from, to });
    return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Fixed expenses are temporarily unavailable" }, { status: 503 });
  }
}
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.companyId !== "string" || typeof body.accountId !== "string") {
    return NextResponse.json({ error: "Company and account required" }, { status: 400 });
  }
  const auth = await authorize(request, { companyId: body.companyId, marketplaceAccountId: body.accountId, requireMarketplaceAccount: true });
  if (isAuthzFailure(auth)) return auth;
  try {
    const rule = await createRecurringExpense({ companyId: auth.companyId!, accountId: auth.marketplaceAccountId! }, auth.user.id, body);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Fixed expense could not be saved" }, { status: 400 });
  }
}
