/**
 * Account enumeration for worker tasks that iterate accounts themselves.
 *
 * Uses the same `filterOperationalMarketplaceAccounts` gate the in-app
 * enumerations use, so the worker can never pick up an account the application
 * considers non-operational.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { filterOperationalMarketplaceAccounts } from "@/lib/marketplace-account-visibility";

export type WorkerAccount = {
  id: string;
  accountName: string;
};

export async function listWorkerAccounts(options?: {
  accountIds?: readonly string[] | null;
}): Promise<WorkerAccount[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marketplace_accounts")
    .select("id, account_name, marketplace, is_active, sync_enabled")
    .eq("marketplace", "wildberries")
    .eq("is_active", true)
    .order("id");

  if (error) throw new Error(`Failed to list marketplace accounts: ${error.message}`);

  const operational = filterOperationalMarketplaceAccounts(data ?? []);
  const requested = options?.accountIds?.map(String) ?? null;

  return operational
    .filter((a) => a.sync_enabled !== false)
    .map((a) => ({ id: String(a.id), accountName: String(a.account_name) }))
    .filter((a) => (requested ? requested.includes(a.id) : true));
}
