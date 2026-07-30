import { NextResponse } from "next/server";
import { authorize, isAuthzFailure } from "@/lib/security/authorize";
import { createMarketplaceAccount } from "@/services/marketplace-account-service";
import { scheduleAccountLifecycle } from "@/services/account-lifecycle-service";
import type { MarketplaceType } from "@/types/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { company_id, marketplace, account_name, api_key, seller_id, is_active, is_default, sync_enabled } =
      body as {
        company_id?: string;
        marketplace?: MarketplaceType;
        account_name?: string;
        api_key?: string;
        seller_id?: string | null;
        is_active?: boolean;
        is_default?: boolean;
        sync_enabled?: boolean;
      };

    if (!company_id?.trim() || !marketplace || !account_name?.trim() || !api_key?.trim()) {
      return NextResponse.json(
        { error: "company_id, marketplace, account_name and api_key are required" },
        { status: 400 }
      );
    }

    const authz = await authorize(request, { companyId: company_id });
    if (isAuthzFailure(authz)) return authz;

    const account = await createMarketplaceAccount({
      company_id: authz.companyId!,
      marketplace,
      account_name,
      api_key,
      seller_id,
      is_active,
      is_default,
      sync_enabled,
    });

    // Automatic historical finance backfill → incremental (Wildberries only).
    scheduleAccountLifecycle(account.id);

    return NextResponse.json(
      {
        account,
        lifecycle: {
          started: true,
          status: account.sync_lifecycle_status ?? "NEW_ACCOUNT",
          message:
            marketplace === "wildberries"
              ? "Historical finance backfill scheduled"
              : "Non-WB account queued for ACCOUNT_VERIFICATION",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create marketplace account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
