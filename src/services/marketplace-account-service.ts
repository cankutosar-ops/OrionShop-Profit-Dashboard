import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import {
  decryptCredential,
  encryptCredential,
} from "@/lib/credentials/encryption";
import type {
  Company,
  CompanyWithAccounts,
  MarketplaceAccountPublic,
  SyncStatus,
} from "@/types/database";

const ACCOUNT_PUBLIC_COLUMNS =
  "id, company_id, marketplace, account_name, seller_id, api_key_encrypted, is_active, is_default, sync_enabled, last_sync_at, last_successful_sync_at, last_sync_status, created_at, updated_at";

function getClient(client?: SupabaseClient): SupabaseClient {
  return client ?? createServerClient();
}

function toPublicAccount(
  row: {
    id: string;
    company_id: string;
    marketplace: MarketplaceAccountPublic["marketplace"];
    account_name: string;
    seller_id: string | null;
    api_key_encrypted: string;
    is_active: boolean;
    is_default: boolean;
    sync_enabled: boolean;
    last_sync_at: string | null;
    last_successful_sync_at: string | null;
    last_sync_status: SyncStatus | null;
    created_at: string;
    updated_at: string;
  }
): MarketplaceAccountPublic {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    marketplace: row.marketplace,
    account_name: row.account_name,
    seller_id: row.seller_id,
    is_active: row.is_active,
    is_default: row.is_default,
    sync_enabled: row.sync_enabled,
    last_sync_at: row.last_sync_at,
    last_successful_sync_at: row.last_successful_sync_at,
    last_sync_status: row.last_sync_status,
    has_api_key: Boolean(row.api_key_encrypted?.trim()),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function clearOtherDefaultCompanies(companyId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("companies")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .neq("id", companyId);
}

async function clearOtherDefaultAccounts(companyId: string, accountId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("marketplace_accounts")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .neq("id", accountId);
}

export async function listCompanies(client?: SupabaseClient): Promise<CompanyWithAccounts[]> {
  const supabase = getClient(client);
  const { data: companies, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .order("name");

  if (companyError) throw new Error(`Failed to list companies: ${companyError.message}`);

  const { data: accounts, error: accountError } = await supabase
    .from("marketplace_accounts")
    .select(ACCOUNT_PUBLIC_COLUMNS)
    .order("account_name");

  if (accountError) throw new Error(`Failed to list marketplace accounts: ${accountError.message}`);

  const accountsByCompany = new Map<string, MarketplaceAccountPublic[]>();
  for (const row of accounts ?? []) {
    const companyId = String(row.company_id);
    const list = accountsByCompany.get(companyId) ?? [];
    list.push(toPublicAccount(row));
    accountsByCompany.set(companyId, list);
  }

  return (companies ?? []).map((company) => ({
    ...(company as Company),
    id: String(company.id),
    accounts: accountsByCompany.get(String(company.id)) ?? [],
  }));
}

export async function getCompanyById(
  companyId: string,
  client?: SupabaseClient
): Promise<CompanyWithAccounts | null> {
  const companies = await listCompanies(client);
  return companies.find((c) => c.id === companyId) ?? null;
}

export async function createCompany(input: {
  name: string;
  country?: string | null;
  currency?: string;
  timezone?: string;
  language?: string;
  is_default?: boolean;
}): Promise<Company> {
  const supabase = createAdminClient();
  const isDefault = input.is_default ?? false;

  const { data, error } = await supabase
    .from("companies")
    .insert({
      name: input.name.trim(),
      country: input.country?.trim() || null,
      currency: input.currency?.trim() || "RUB",
      timezone: input.timezone?.trim() || "Europe/Moscow",
      language: input.language?.trim() || "ru",
      is_default: isDefault,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create company: ${error.message}`);

  if (isDefault) {
    await clearOtherDefaultCompanies(String(data.id));
  }

  return { ...(data as Company), id: String(data.id) };
}

export async function updateCompany(
  companyId: string,
  input: Partial<{
    name: string;
    country: string | null;
    currency: string;
    timezone: string;
    language: string;
    is_default: boolean;
  }>
): Promise<Company> {
  const supabase = createAdminClient();
  const patch: {
    updated_at: string;
    name?: string;
    country?: string | null;
    currency?: string;
    timezone?: string;
    language?: string;
    is_default?: boolean;
  } = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.country !== undefined) patch.country = input.country?.trim() || null;
  if (input.currency !== undefined) patch.currency = input.currency.trim();
  if (input.timezone !== undefined) patch.timezone = input.timezone.trim();
  if (input.language !== undefined) patch.language = input.language.trim();
  if (input.is_default !== undefined) patch.is_default = input.is_default;

  const { data, error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", companyId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update company: ${error.message}`);

  if (input.is_default) {
    await clearOtherDefaultCompanies(companyId);
  }

  return { ...(data as Company), id: String(data.id) };
}

export async function deleteCompany(companyId: string): Promise<void> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("companies")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) <= 1) {
    throw new Error("Cannot delete the last company");
  }

  const { error } = await supabase.from("companies").delete().eq("id", companyId);
  if (error) throw new Error(`Failed to delete company: ${error.message}`);
}

export async function getDefaultCompanyId(client?: SupabaseClient): Promise<string> {
  const supabase = getClient(client);
  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .order("is_default", { ascending: false })
    .order("id")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve default company: ${error.message}`);
  if (data?.id) return String(data.id);

  return ensureDefaultTenant();
}

export async function resolveCompanyId(
  companyParam?: string | null,
  client?: SupabaseClient
): Promise<string> {
  if (companyParam) {
    const company = await getCompanyById(companyParam, client);
    if (company) return company.id;
  }
  return getDefaultCompanyId(client);
}

/** Creates default company + WB account; migrates legacy WB_API_TOKEN into encrypted storage. */
export async function ensureDefaultTenant(): Promise<string> {
  const supabase = createAdminClient();
  const { data: companyRow } = await supabase
    .from("companies")
    .select("id")
    .order("id")
    .limit(1)
    .maybeSingle();

  let companyId = companyRow?.id ? String(companyRow.id) : null;

  if (!companyId) {
    const { data: inserted, error } = await supabase
      .from("companies")
      .insert({
        name: "Default Company",
        country: "RU",
        currency: "RUB",
        timezone: "Europe/Moscow",
        language: "ru",
        is_default: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Failed to create default company: ${error.message}`);
    companyId = String(inserted.id);
  }

  const { data: accountRow } = await supabase
    .from("marketplace_accounts")
    .select("id, api_key_encrypted")
    .eq("company_id", companyId)
    .order("id")
    .limit(1)
    .maybeSingle();

  if (!accountRow) {
    const legacyToken = process.env.WB_API_TOKEN?.trim() ?? "";
    const { error } = await supabase.from("marketplace_accounts").insert({
      company_id: companyId,
      marketplace: "wildberries",
      account_name: "Wildberries Default",
      api_key_encrypted: legacyToken ? encryptCredential(legacyToken) : "",
      is_active: true,
      is_default: true,
      sync_enabled: true,
      last_sync_status: "idle",
    });
    if (error) throw new Error(`Failed to create default marketplace account: ${error.message}`);
  } else if (!accountRow.api_key_encrypted?.trim()) {
    const legacyToken = process.env.WB_API_TOKEN?.trim();
    if (legacyToken) {
      await supabase
        .from("marketplace_accounts")
        .update({
          api_key_encrypted: encryptCredential(legacyToken),
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountRow.id);
    }
  }

  return companyId;
}

export async function resolveMarketplaceAccountId(
  accountParam?: string | null,
  companyParam?: string | null,
  client?: SupabaseClient
): Promise<{ marketplaceAccountId: string; companyId: string }> {
  const companyId = await resolveCompanyId(companyParam, client);

  if (accountParam) {
    const supabase = getClient(client);
    const { data } = await supabase
      .from("marketplace_accounts")
      .select("id, company_id")
      .eq("id", accountParam)
      .maybeSingle();

    if (data) {
      return {
        marketplaceAccountId: String(data.id),
        companyId: String(data.company_id),
      };
    }
  }

  const supabase = getClient(client);
  const { data, error } = await supabase
    .from("marketplace_accounts")
    .select("id, company_id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("id")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve marketplace account: ${error.message}`);
  if (!data?.id) {
    await ensureDefaultTenant();
    return resolveMarketplaceAccountId(null, companyId, client);
  }

  return {
    marketplaceAccountId: String(data.id),
    companyId: String(data.company_id),
  };
}

/** Lightweight sync state for status polling. */
export async function getMarketplaceAccountSyncState(accountId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marketplace_accounts")
    .select("id, last_sync_at, last_successful_sync_at, last_sync_status")
    .eq("id", accountId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch sync state: ${error.message}`);
  if (!data) return null;

  return {
    id: String(data.id),
    last_sync_at: data.last_sync_at,
    last_successful_sync_at: data.last_successful_sync_at,
    last_sync_status: data.last_sync_status,
  };
}

/** Full account row with decrypted API key — admin/sync only. */
export async function getMarketplaceAccountForSync(accountId: string) {
  const { cachedExternalRequest } = await import("@/lib/wb/wb-request-cache");
  return cachedExternalRequest(`account-for-sync:${accountId}`, async () => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("marketplace_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch marketplace account: ${error.message}`);
    if (!data) throw new Error(`Marketplace account not found: ${accountId}`);

    if (data.sync_enabled === false) {
      throw new Error(`Sync is disabled for account "${data.account_name}"`);
    }

    const encrypted = data.api_key_encrypted?.trim();
    if (!encrypted) {
      throw new Error(`Account "${data.account_name}" has no API key configured`);
    }

    let apiKey: string;
    try {
      apiKey = decryptCredential(encrypted);
    } catch {
      throw new Error(`Failed to decrypt API key for "${data.account_name}"`);
    }

    return {
      ...data,
      id: String(data.id),
      company_id: String(data.company_id),
      apiKey,
    };
  });
}

export async function markAccountSyncStarted(accountId: string): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("marketplace_accounts")
    .update({
      last_sync_at: now,
      last_sync_status: "running",
      updated_at: now,
    })
    .eq("id", accountId);

  if (error) throw new Error(`Failed to mark sync started: ${error.message}`);
}

export async function markAccountSyncFinished(
  accountId: string,
  status: SyncStatus
): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const patch: {
    updated_at: string;
    last_sync_at: string;
    last_sync_status: SyncStatus;
    last_successful_sync_at?: string;
  } = {
    updated_at: now,
    last_sync_at: now,
    last_sync_status: status,
  };

  if (status === "success" || status === "partial") {
    patch.last_successful_sync_at = now;
  }

  const { error } = await supabase
    .from("marketplace_accounts")
    .update(patch)
    .eq("id", accountId);

  if (error) throw new Error(`Failed to mark sync finished: ${error.message}`);
}

export async function createMarketplaceAccount(input: {
  company_id: string;
  marketplace: MarketplaceAccountPublic["marketplace"];
  account_name: string;
  api_key: string;
  seller_id?: string | null;
  is_active?: boolean;
  is_default?: boolean;
  sync_enabled?: boolean;
}): Promise<MarketplaceAccountPublic> {
  const supabase = createAdminClient();
  const isDefault = input.is_default ?? false;

  const { data, error } = await supabase
    .from("marketplace_accounts")
    .insert({
      company_id: input.company_id,
      marketplace: input.marketplace,
      account_name: input.account_name.trim(),
      seller_id: input.seller_id?.trim() || null,
      api_key_encrypted: encryptCredential(input.api_key.trim()),
      is_active: input.is_active ?? true,
      is_default: isDefault,
      sync_enabled: input.sync_enabled ?? true,
      last_sync_status: "idle",
    })
    .select(ACCOUNT_PUBLIC_COLUMNS)
    .single();

  if (error) throw new Error(`Failed to create marketplace account: ${error.message}`);

  if (isDefault) {
    await clearOtherDefaultAccounts(input.company_id, String(data.id));
  }

  return toPublicAccount(data);
}

export async function updateMarketplaceAccount(
  accountId: string,
  input: Partial<{
    account_name: string;
    api_key: string;
    seller_id: string | null;
    is_active: boolean;
    is_default: boolean;
    sync_enabled: boolean;
    marketplace: MarketplaceAccountPublic["marketplace"];
  }>
): Promise<MarketplaceAccountPublic> {
  const supabase = createAdminClient();
  const patch: {
    updated_at: string;
    account_name?: string;
    seller_id?: string | null;
    is_active?: boolean;
    is_default?: boolean;
    sync_enabled?: boolean;
    marketplace?: MarketplaceAccountPublic["marketplace"];
    api_key_encrypted?: string;
  } = { updated_at: new Date().toISOString() };

  if (input.account_name !== undefined) patch.account_name = input.account_name.trim();
  if (input.seller_id !== undefined) patch.seller_id = input.seller_id?.trim() || null;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.is_default !== undefined) patch.is_default = input.is_default;
  if (input.sync_enabled !== undefined) patch.sync_enabled = input.sync_enabled;
  if (input.marketplace !== undefined) patch.marketplace = input.marketplace;
  if (input.api_key !== undefined && input.api_key.trim()) {
    patch.api_key_encrypted = encryptCredential(input.api_key.trim());
  }

  const { data, error } = await supabase
    .from("marketplace_accounts")
    .update(patch)
    .eq("id", accountId)
    .select(ACCOUNT_PUBLIC_COLUMNS)
    .single();

  if (error) throw new Error(`Failed to update marketplace account: ${error.message}`);

  if (input.is_default) {
    await clearOtherDefaultAccounts(String(data.company_id), accountId);
  }

  return toPublicAccount(data);
}

export async function deleteMarketplaceAccount(accountId: string): Promise<void> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("marketplace_accounts")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) <= 1) {
    throw new Error("Cannot delete the last marketplace account");
  }

  const { error } = await supabase.from("marketplace_accounts").delete().eq("id", accountId);
  if (error) throw new Error(`Failed to delete marketplace account: ${error.message}`);
}

export async function testMarketplaceAccountConnection(
  accountId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const account = await getMarketplaceAccountForSync(accountId);

    if (account.marketplace === "wildberries") {
      const { WbApiClient } = await import("@/lib/wildberries/api-client");
      const client = new WbApiClient(account.apiKey);
      await client.fetchOrders(new Date(Date.now() - 86400000).toISOString());
      return { ok: true, message: `Connected to ${account.account_name} (Wildberries)` };
    }

    return {
      ok: false,
      message: `Connection test for ${account.marketplace} is not implemented yet`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
