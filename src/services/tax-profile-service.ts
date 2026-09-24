import { createAdminClient } from "@/lib/supabase/admin";
import type { Company, CompanyTaxObject, CompanyTaxProfile } from "@/types/database";

export type TaxModelSelection = "USN_INCOME" | "USN_INCOME_MINUS_EXPENSES" | "CUSTOM";

export function parseTaxModel(input: {
  model: unknown;
  customObject?: unknown;
  customRate?: unknown;
}): { taxObject: CompanyTaxObject; rate: number } {
  if (input.model === "USN_INCOME") return { taxObject: "USN_INCOME", rate: 6 };
  if (input.model === "USN_INCOME_MINUS_EXPENSES") return { taxObject: "USN_INCOME_MINUS_EXPENSES", rate: 15 };
  if (input.model !== "CUSTOM" ||
    (input.customObject !== "USN_INCOME" && input.customObject !== "USN_INCOME_MINUS_EXPENSES")) {
    throw new Error("Choose a valid tax model and tax object");
  }
  const rate = Number(input.customRate);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100 ||
    Math.abs(Math.round(rate * 100) - rate * 100) > 1e-7) {
    throw new Error("Custom rate must be 0.01–100% with at most two decimals");
  }
  return { taxObject: input.customObject, rate };
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function moscowToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export async function listCompanyTaxProfiles(companyId: string): Promise<CompanyTaxProfile[]> {
  const { data, error } = await createAdminClient().from("company_tax_profiles")
    .select("*").eq("company_id", companyId).order("effective_from", { ascending: false });
  if (error) throw new Error(`Tax profiles unavailable: ${error.message}`);
  return (data ?? []) as CompanyTaxProfile[];
}

export function resolveTaxProfile(profiles: CompanyTaxProfile[], date: string): CompanyTaxProfile | null {
  return profiles.find((p) => p.effective_from <= date && (p.effective_to === null || p.effective_to >= date)) ?? null;
}

export async function appendCompanyTaxProfile(input: {
  companyId: string;
  model: unknown;
  customObject?: unknown;
  customRate?: unknown;
  effectiveFrom: unknown;
}): Promise<CompanyTaxProfile> {
  const { taxObject, rate } = parseTaxModel(input);
  if (!isIsoDate(input.effectiveFrom)) throw new Error("Valid effective date is required");
  if (!/^\d+$/.test(input.companyId)) throw new Error("Invalid company ID");
  const { data, error } = await createAdminClient().rpc("orion_append_company_tax_profile", {
    p_company_id: input.companyId, p_tax_object: taxObject,
    p_tax_rate: rate, p_effective_from: input.effectiveFrom,
  });
  if (error || !data) throw new Error(`Tax profile could not be saved: ${error?.message ?? "no row returned"}`);
  return data as CompanyTaxProfile;
}

export async function createCompanyWithTaxProfile(input: {
  name: string; country?: string | null; currency?: string; timezone?: string;
  language?: string; isDefault?: boolean; model: unknown;
  customObject?: unknown; customRate?: unknown;
}): Promise<Company> {
  const { taxObject, rate } = parseTaxModel(input);
  const { data, error } = await createAdminClient().rpc("orion_create_company_with_tax_profile", {
    p_name: input.name, p_country: input.country ?? null,
    p_currency: input.currency ?? "RUB", p_timezone: input.timezone ?? "Europe/Moscow",
    p_language: input.language ?? "ru", p_is_default: input.isDefault ?? false,
    p_tax_object: taxObject, p_tax_rate: rate, p_effective_from: moscowToday(),
  });
  if (error || !data) throw new Error(`Company and tax profile could not be created: ${error?.message ?? "no row returned"}`);
  return data as Company;
}
