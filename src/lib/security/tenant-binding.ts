/**
 * Sprint 7.1.A — Tenant binding helpers (SEC-006).
 * URL/body account ids must belong to the claimed company when both are present.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export class TenantBindingError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "TenantBindingError";
  }
}

/**
 * When both companyId and marketplaceAccountId are provided, verify ownership.
 * Returns the canonical company_id for the account.
 */
export async function assertAccountBelongsToCompany(
  marketplaceAccountId: string,
  companyId?: string | null
): Promise<{ marketplaceAccountId: string; companyId: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marketplace_accounts")
    .select("id, company_id")
    .eq("id", marketplaceAccountId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify marketplace account: ${error.message}`);
  }
  if (!data?.id) {
    throw new TenantBindingError("Marketplace account not found");
  }

  const accountCompanyId = String(data.company_id);
  if (companyId && String(companyId) !== accountCompanyId) {
    throw new TenantBindingError(
      "Marketplace account does not belong to the specified company"
    );
  }

  return {
    marketplaceAccountId: String(data.id),
    companyId: accountCompanyId,
  };
}
