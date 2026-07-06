/**
 * Keeps validation scripts from leaving rows in production accounts.
 * Strategy: snapshot row IDs before the run, delete anything new in finally.
 */

export const DEFAULT_PRODUCTION_ACCOUNT_IDS = ["2"];

/** Known validate-cost-template.mjs run on account 2 (identified by insert window, not cost value). */
export const LEGACY_COST_TEMPLATE_RUN = {
  script: "validate-cost-template.mjs",
  created_at_from: "2026-06-28T12:56:00.000Z",
  created_at_to: "2026-06-28T13:01:00.000Z",
};

export function getProductionAccountIds() {
  const fromEnv = process.env.VALIDATION_PRODUCTION_ACCOUNT_IDS?.trim();
  if (!fromEnv) return DEFAULT_PRODUCTION_ACCOUNT_IDS;
  return fromEnv.split(",").map((id) => id.trim()).filter(Boolean);
}

export function getValidationAccountId(accountId) {
  // Central hook for account selection; today returns the script argument unchanged.
  return String(accountId ?? "2");
}

export function isProductionAccount(accountId) {
  return getProductionAccountIds().includes(String(accountId));
}

export function assertProductionValidationAllowed(accountId) {
  if (!isProductionAccount(accountId)) return;

  const allowProduction = process.env.VALIDATION_ALLOW_PRODUCTION === "1";
  const confirm = process.env.VALIDATION_CONFIRM === "YES";

  if (allowProduction && confirm) return;

  const missing = [];
  if (!allowProduction) missing.push("VALIDATION_ALLOW_PRODUCTION=1");
  if (!confirm) missing.push("VALIDATION_CONFIRM=YES");

  throw new Error(
    `Account ${accountId} is a production account. Write-capable validation requires both:\n` +
      "  VALIDATION_ALLOW_PRODUCTION=1\n" +
      "  VALIDATION_CONFIRM=YES\n" +
      `Missing: ${missing.join(", ")}`
  );
}

export async function fetchAccountProductIds(supabase, accountId) {
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("marketplace_account_id", accountId);

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);
  return new Set((data ?? []).map((row) => String(row.id)));
}

export async function fetchAccountCostHistoryIds(supabase, accountId) {
  const productIds = await fetchAccountProductIds(supabase, accountId);
  if (productIds.size === 0) return new Set();

  const { data, error } = await supabase.from("product_cost_history").select("id, product_id");
  if (error) throw new Error(`Failed to fetch cost history ids: ${error.message}`);

  return new Set(
    (data ?? [])
      .filter((row) => productIds.has(String(row.product_id)))
      .map((row) => String(row.id))
  );
}

export async function fetchAccountPurchaseIds(supabase, accountId) {
  const { data, error } = await supabase
    .from("purchases")
    .select("id")
    .eq("marketplace_account_id", accountId);

  if (error) throw new Error(`Failed to fetch purchases: ${error.message}`);
  return new Set((data ?? []).map((row) => String(row.id)));
}

export async function deleteCostHistoryIds(supabase, ids) {
  if (ids.length === 0) return 0;

  const chunkSize = 100;
  let deleted = 0;

  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    const chunk = ids.slice(offset, offset + chunkSize);
    const { error, count } = await supabase
      .from("product_cost_history")
      .delete({ count: "exact" })
      .in("id", chunk);

    if (error) throw new Error(`Failed to delete cost history rows: ${error.message}`);
    deleted += count ?? chunk.length;
  }

  return deleted;
}

export async function deletePurchaseIds(supabase, ids) {
  if (ids.length === 0) return 0;

  for (const id of ids) {
    const { error: linesError } = await supabase.from("purchase_lines").delete().eq("purchase_id", id);
    if (linesError) throw new Error(`Failed to delete purchase lines: ${linesError.message}`);
  }

  const { error, count } = await supabase
    .from("purchases")
    .delete({ count: "exact" })
    .in("id", ids);

  if (error) throw new Error(`Failed to delete purchases: ${error.message}`);
  return count ?? ids.length;
}

export function createValidationSession(supabase, accountId) {
  let costHistoryBefore = new Set();
  let purchaseIdsBefore = new Set();
  let started = false;

  return {
    accountId: String(accountId),

    async begin() {
      assertProductionValidationAllowed(accountId);
      costHistoryBefore = await fetchAccountCostHistoryIds(supabase, accountId);
      purchaseIdsBefore = await fetchAccountPurchaseIds(supabase, accountId);
      started = true;
    },

    async cleanup() {
      if (!started) return { costHistoryDeleted: 0, purchasesDeleted: 0 };

      const costHistoryAfter = await fetchAccountCostHistoryIds(supabase, accountId);
      const newCostIds = [...costHistoryAfter].filter((id) => !costHistoryBefore.has(id));
      const costHistoryDeleted = await deleteCostHistoryIds(supabase, newCostIds);

      const purchasesAfter = await fetchAccountPurchaseIds(supabase, accountId);
      const newPurchaseIds = [...purchasesAfter].filter((id) => !purchaseIdsBefore.has(id));
      const purchasesDeleted = await deletePurchaseIds(supabase, newPurchaseIds);

      if (newCostIds.length > 0 || newPurchaseIds.length > 0) {
        console.log(
          `[validation-cleanup] account ${accountId}: removed ${costHistoryDeleted} cost history row(s), ${purchasesDeleted} purchase(s)`
        );
      }

      return { costHistoryDeleted, purchasesDeleted, newCostIds, newPurchaseIds };
    },
  };
}

/** Delete rows from the known legacy validate-cost-template.mjs batch. */
export async function deleteLegacyCostTemplateRun(supabase, accountId, { dryRun = false } = {}) {
  const productIds = await fetchAccountProductIds(supabase, accountId);
  const { created_at_from, created_at_to } = LEGACY_COST_TEMPLATE_RUN;

  const { data, error } = await supabase
    .from("product_cost_history")
    .select("id, product_id, created_at")
    .gte("created_at", created_at_from)
    .lte("created_at", created_at_to);

  if (error) throw new Error(`Failed to query legacy validation batch: ${error.message}`);

  const ids = (data ?? [])
    .filter((row) => productIds.has(String(row.product_id)))
    .map((row) => String(row.id));

  if (dryRun) return { matched: ids.length, deleted: 0, ids };

  const deleted = await deleteCostHistoryIds(supabase, ids);
  return { matched: ids.length, deleted, ids };
}

export async function countLegacyCostTemplateRows(supabase, accountId) {
  const productIds = await fetchAccountProductIds(supabase, accountId);
  const { created_at_from, created_at_to } = LEGACY_COST_TEMPLATE_RUN;

  const { data, error } = await supabase
    .from("product_cost_history")
    .select("id, product_id")
    .gte("created_at", created_at_from)
    .lte("created_at", created_at_to);

  if (error) throw new Error(error.message);

  return (data ?? []).filter((row) => productIds.has(String(row.product_id))).length;
}

/** For multi-phase scripts: delete cost rows created since a snapshot. */
export async function cleanupCostHistorySnapshot(supabase, accountId, beforeIds) {
  assertProductionValidationAllowed(accountId);

  const beforeSet = new Set(beforeIds.map(String));
  const afterIds = await fetchAccountCostHistoryIds(supabase, accountId);
  const newIds = [...afterIds].filter((id) => !beforeSet.has(id));
  const deleted = await deleteCostHistoryIds(supabase, newIds);
  return { deleted, newIds };
}
