import { NextResponse } from "next/server";
import { createMarketplaceAccount } from "@/services/marketplace-account-service";
import type { MarketplaceType } from "@/types/database";

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

    const account = await createMarketplaceAccount({
      company_id,
      marketplace,
      account_name,
      api_key,
      seller_id,
      is_active,
      is_default,
      sync_enabled,
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create marketplace account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
