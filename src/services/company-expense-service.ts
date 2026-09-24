import { createAdminClient } from "@/lib/supabase/admin";
import { companyExpenseRule } from "@/lib/tax-engine/category-rules";
import { isIsoDate } from "@/services/tax-profile-service";
import type { CompanyExpense, CompanyExpenseCategory } from "@/types/database";

export type ManualExpenseInput = {
  expenseDate: unknown;
  category: unknown;
  description: unknown;
  amount: unknown;
  taxDeductible: unknown;
  userOverrode: unknown;
  evidenceStatus?: unknown;
  documentReference?: unknown;
  paymentStatus?: unknown;
  paymentDate?: unknown;
  paidAmount?: unknown;
  paymentReference?: unknown;
};

export function validateManualExpense(input: ManualExpenseInput) {
  if (!isIsoDate(input.expenseDate)) throw new Error("Valid expense date is required");
  const rule = companyExpenseRule(input.category);
  if (!rule) throw new Error("Invalid expense category");
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!description || description.length > 500) throw new Error("Description must be 1–500 characters");
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99 ||
    Math.abs(Math.round(amount * 100) - amount * 100) > 1e-7) {
    throw new Error("Amount must be positive RUB with at most two decimals");
  }
  if (typeof input.taxDeductible !== "boolean" || typeof input.userOverrode !== "boolean") {
    throw new Error("Deductibility decision is required");
  }
  const selected = input.userOverrode ? input.taxDeductible : rule.checkboxDefault;
  const evidenceStatus = input.evidenceStatus ?? "UNVERIFIED";
  if (!(["UNVERIFIED", "VERIFIED", "REJECTED"] as const).includes(evidenceStatus as never)) {
    throw new Error("Invalid document evidence status");
  }
  const documentReference = typeof input.documentReference === "string"
    ? input.documentReference.trim() : "";
  if (documentReference.length > 200) throw new Error("Document reference must be at most 200 characters");
  if (evidenceStatus === "VERIFIED" && !documentReference) {
    throw new Error("Verified document evidence requires a reference");
  }
  const paymentStatus = input.paymentStatus ?? "UNVERIFIED";
  if (!(["UNVERIFIED", "UNPAID", "PARTIALLY_PAID", "PAID"] as const).includes(paymentStatus as never)) {
    throw new Error("Invalid payment evidence status");
  }
  let paidAmount = Number(input.paidAmount ?? 0);
  let paymentDate = input.paymentDate;
  let paymentReference = typeof input.paymentReference === "string" ? input.paymentReference.trim() : "";
  if (paymentStatus === "UNVERIFIED" || paymentStatus === "UNPAID") {
    paidAmount = 0; paymentDate = null; paymentReference = "";
  } else {
    if (!isIsoDate(paymentDate) || !paymentReference || paymentReference.length > 200 ||
      !Number.isFinite(paidAmount) || paidAmount <= 0 ||
      Math.abs(Math.round(paidAmount * 100) - paidAmount * 100) > 1e-7) {
      throw new Error("Dated payment amount and reference are required");
    }
    if (paymentStatus === "PAID" && Math.round(paidAmount * 100) !== Math.round(amount * 100)) {
      throw new Error("PAID requires the full expense amount");
    }
    if (paymentStatus === "PARTIALLY_PAID" && paidAmount >= amount) {
      throw new Error("Use PAID when the full expense amount is paid");
    }
  }
  return {
    expense_date: input.expenseDate,
    category: rule.category as CompanyExpenseCategory,
    description,
    amount: Math.round(amount * 100) / 100,
    category_default: rule.checkboxDefault,
    tax_deductible: selected,
    tax_deductible_origin: input.userOverrode ? "USER_OVERRIDE" as const : "CATEGORY_DEFAULT" as const,
    evidence_status: evidenceStatus as CompanyExpense["evidence_status"],
    document_reference: documentReference || null,
    payment_status: paymentStatus as CompanyExpense["payment_status"],
    payment_date: isIsoDate(paymentDate) ? paymentDate : null,
    paid_amount: Math.round(paidAmount * 100) / 100,
    payment_reference: paymentReference || null,
  };
}

export async function listCompanyExpenses(companyId: string, from?: string, to?: string): Promise<CompanyExpense[]> {
  const db = createAdminClient();
  const rows: CompanyExpense[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db.from("company_expenses").select("*")
      .eq("company_id", companyId).is("deleted_at", null)
      .order("expense_date", { ascending: false }).order("id", { ascending: false });
    if (from) query = query.gte("expense_date", from);
    if (to) query = query.lte("expense_date", to);
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error(`Expenses unavailable: ${error.message}`);
    rows.push(...((data ?? []) as CompanyExpense[]));
    if ((data?.length ?? 0) < 500) return rows;
  }
}

export async function createCompanyExpense(companyId: string, actor: string, input: ManualExpenseInput): Promise<CompanyExpense> {
  const value = validateManualExpense(input);
  const { data, error } = await createAdminClient().from("company_expenses")
    .insert({ company_id: companyId, ...value, created_by: actor, updated_by: actor }).select("*").single();
  if (error || !data) throw new Error(`Expense could not be created: ${error?.message ?? "no row returned"}`);
  return data as CompanyExpense;
}

export async function updateCompanyExpense(companyId: string, id: string, actor: string, input: ManualExpenseInput): Promise<CompanyExpense> {
  const value = validateManualExpense(input);
  const { data, error } = await createAdminClient().from("company_expenses")
    .update({ ...value, updated_by: actor, updated_at: new Date().toISOString() })
    .eq("id", id).eq("company_id", companyId).is("deleted_at", null).select("*").maybeSingle();
  if (error) throw new Error(`Expense could not be updated: ${error.message}`);
  if (!data) throw new Error("Expense not found in company");
  return data as CompanyExpense;
}

export async function deleteCompanyExpense(companyId: string, id: string, actor: string): Promise<void> {
  const { data, error } = await createAdminClient().from("company_expenses")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), updated_by: actor })
    .eq("id", id).eq("company_id", companyId).is("deleted_at", null).select("id").maybeSingle();
  if (error) throw new Error(`Expense could not be deleted: ${error.message}`);
  if (!data) throw new Error("Expense not found in company");
}
