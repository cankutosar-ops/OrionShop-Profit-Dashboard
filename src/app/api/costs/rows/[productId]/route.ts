import { NextResponse } from "next/server";
import { resolveScopedDateRangeFromUrl } from "@/lib/marketplace-scope";
import { fetchCostManagementRow, updateProductPurchaseCost } from "@/services/cost-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ productId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { productId } = await context.params;
    const scope = await resolveScopedDateRangeFromUrl(new URL(request.url));

    const row = await fetchCostManagementRow(productId, scope);
    if (!row) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch cost row";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { productId } = await context.params;
    const scope = await resolveScopedDateRangeFromUrl(new URL(request.url));

    const body = await request.json();
    const cost = Number(body.cost);

    if (!Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: "cost must be a non-negative number" }, { status: 400 });
    }

    const row = await updateProductPurchaseCost(productId, cost, scope);
    return NextResponse.json(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update cost";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
