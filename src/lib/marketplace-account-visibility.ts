import type { MarketplaceAccountPublic } from "@/types/database";

/**
 * Name patterns for temporary / verification / demo marketplace accounts
 * that should not appear in operational selectors (Dashboard, Inventory, etc.).
 * Settings still lists all accounts via /api/companies.
 */
const NON_OPERATIONAL_ACCOUNT_NAME =
  /verify\s*flow|\bdemo\b|\bsandbox\b|\btemporary\b|\btemp\b|\btest(\s+\d+)?$/i;

/**
 * True when an account should appear in production scope selectors.
 * Active accounts only; excludes known verification/demo naming patterns.
 */
export function isOperationalMarketplaceAccount(
  account: Pick<MarketplaceAccountPublic, "account_name" | "is_active">
): boolean {
  if (!account.is_active) return false;
  return !NON_OPERATIONAL_ACCOUNT_NAME.test(account.account_name.trim());
}

export function filterOperationalMarketplaceAccounts<
  T extends Pick<MarketplaceAccountPublic, "account_name" | "is_active">,
>(accounts: T[]): T[] {
  return accounts.filter(isOperationalMarketplaceAccount);
}
