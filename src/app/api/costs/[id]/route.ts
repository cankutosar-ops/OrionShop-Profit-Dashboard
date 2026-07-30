import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import { appendCostRecordChange } from "@/services/cost-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const authz = await authorizeRequestScope(request, {
      allowDefaultAccount: true,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const { id } = await context.params;
    const body = await request.json();
    const cost = Number(body.cost);
    const effective_from = String(body.effective_from ?? "").trim();

    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: "cost must be a non-negative number" }, { status: 400 });
    }
    if (!effective_from) {
      return NextResponse.json(
        { error: "effective_from is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const record = await appendCostRecordChange(
      id,
      { cost, effective_from },
      authz.marketplaceAccountId!
    );
    return NextResponse.json(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update cost";
    const status =
      message.includes("not found") || message.includes("does not belong") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const authz = await authorizeRequestScope(request, {
    allowDefaultAccount: true,
    requireMarketplaceAccount: true,
  });
  if (isAuthzFailure(authz)) return authz;
  return NextResponse.json(
    { error: "Historical cost records cannot be deleted" },
    { status: 405 }
  );
}
