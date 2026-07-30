import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import { createCostRecord, type CostInput } from "@/services/cost-service";

function parseCostInput(body: unknown): CostInput {
  const data = body as Record<string, unknown>;
  const supplier_article = String(data.supplier_article ?? "").trim();
  const cost = Number(data.cost);
  const effective_from = String(data.effective_from ?? "").trim();

  if (!supplier_article) {
    throw new Error("supplier_article is required");
  }
  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error("cost must be a non-negative number");
  }
  if (!effective_from) {
    throw new Error("effective_from is required (YYYY-MM-DD)");
  }

  return { supplier_article, cost, effective_from };
}

export async function POST(request: Request) {
  try {
    const authz = await authorizeRequestScope(request, {
      allowDefaultAccount: true,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const body = await request.json();
    const input = parseCostInput(body);
    const record = await createCostRecord(input, authz.marketplaceAccountId!);
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create cost";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
