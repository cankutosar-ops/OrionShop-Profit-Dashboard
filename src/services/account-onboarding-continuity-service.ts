/**
 * Durable new-account onboarding continuation for the production worker.
 * The web request starts lifecycle work, while this service guarantees that a
 * terminated request is resumed on later hourly ticks.
 */
import { listWorkerAccounts } from "@/worker/accounts";
import { runNewAccountLifecycle } from "@/services/account-lifecycle-service";
import { runWarehouseEntityHistoricalBackfill } from "@/services/historical-warehouse-orchestrator";

export type AccountOnboardingAdvance = {
  marketplaceAccountId: string;
  lifecycle: string;
  orders: string;
  sales: string;
};

export async function advanceAutomaticAccountOnboarding(input: {
  accountIds?: readonly string[] | null;
  deadlineMs: number;
}): Promise<AccountOnboardingAdvance[]> {
  const accounts = await listWorkerAccounts({ accountIds: input.accountIds });
  const results: AccountOnboardingAdvance[] = [];

  for (const account of accounts) {
    if (Date.now() >= input.deadlineMs) break;
    const lifecycle = await runNewAccountLifecycle(account.id, {
      maxWindowsPerInvocation: 1,
    });

    let orders = "budget_exhausted";
    let sales = "budget_exhausted";
    if (Date.now() < input.deadlineMs) {
      const result = await runWarehouseEntityHistoricalBackfill({
        marketplaceAccountId: account.id,
        entity: "orders",
        trigger: "scheduled",
      });
      orders = result.status;
    }
    if (Date.now() < input.deadlineMs) {
      const result = await runWarehouseEntityHistoricalBackfill({
        marketplaceAccountId: account.id,
        entity: "sales",
        trigger: "scheduled",
      });
      sales = result.status;
    }

    results.push({
      marketplaceAccountId: account.id,
      lifecycle: lifecycle.status ?? lifecycle.message,
      orders,
      sales,
    });
  }

  return results;
}
