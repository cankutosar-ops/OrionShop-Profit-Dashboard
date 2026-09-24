import { createAdminClient } from "@/lib/supabase/admin";
import {
  planPurchaseRecognition,
  type PurchaseRecognitionInput,
  type PurchaseRecognitionSummary,
} from "@/lib/tax-engine/purchase-recognition";
import { resolveTaxProfile } from "@/services/tax-profile-service";
import type {
  CompanyPurchaseTaxPolicy,
  CompanyTaxProfile,
  Purchase,
  PurchaseLine,
  PurchasePaymentStatus,
  TaxPurchaseRecognitionEvent,
  WbSale,
} from "@/types/database";

const PAGE_SIZE = 500;

async function allPages<T>(
  query: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await query(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Purchase recognition source read failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

async function loadRecognitionInput(companyId: string, asOfDate: string): Promise<PurchaseRecognitionInput> {
  const db = createAdminClient();
  const [{ data: accounts, error: accountError }, { data: policy, error: policyError },
    { data: profiles, error: profileError }] = await Promise.all([
    db.from("marketplace_accounts").select("id").eq("company_id", companyId).order("id"),
    db.from("company_purchase_tax_policies").select("*").eq("company_id", companyId).maybeSingle(),
    db.from("company_tax_profiles").select("*").eq("company_id", companyId)
      .order("effective_from", { ascending: false }),
  ]);
  if (accountError) throw new Error(`Company accounts unavailable: ${accountError.message}`);
  if (policyError) throw new Error(`Purchase tax policy unavailable: ${policyError.message}`);
  if (profileError) throw new Error(`Company tax profile unavailable: ${profileError.message}`);
  const accountIds = (accounts ?? []).map((row) => String(row.id));
  const taxProfile = resolveTaxProfile((profiles ?? []) as CompanyTaxProfile[], asOfDate);
  const purchaseRows = accountIds.length === 0 ? [] : await allPages<Purchase>((from, to) =>
    db.from("purchases").select("*").in("marketplace_account_id", accountIds)
      .lte("purchase_date", asOfDate).order("id").range(from, to)
  );
  const purchaseIds = purchaseRows.map((purchase) => String(purchase.id));
  const lineRows = purchaseIds.length === 0 ? [] : await allPages<PurchaseLine>((from, to) =>
    db.from("purchase_lines").select("*").in("purchase_id", purchaseIds)
      .order("id").range(from, to)
  );
  const productIds = [...new Set(lineRows.map((line) => String(line.product_id)))];
  const saleRows = accountIds.length === 0 || productIds.length === 0 ? [] : await allPages<WbSale>((from, to) =>
    db.from("wb_sales").select("*").in("marketplace_account_id", accountIds)
      .in("product_id", productIds).lte("sale_date", asOfDate).order("sale_date").order("id")
      .range(from, to)
  );
  const row = policy as CompanyPurchaseTaxPolicy | null;
  return {
    companyId,
    vatStatus: taxProfile?.vat_status ?? "UNKNOWN",
    policy: row ? {
      companyId: String(row.company_id),
      allocationMethod: row.allocation_method,
      paymentPolicy: row.payment_policy,
      returnPolicy: row.return_policy,
      effectiveFrom: row.effective_from,
    } : null,
    purchases: purchaseRows.map((purchase) => ({
      id: String(purchase.id),
      marketplaceAccountId: String(purchase.marketplace_account_id),
      purchaseDate: purchase.purchase_date,
      currency: purchase.currency,
      invoiceNumber: purchase.invoice_number,
      paymentStatus: purchase.payment_status,
      paymentDate: purchase.payment_date,
      paidAmount: Number(purchase.paid_amount),
      paymentReference: purchase.payment_reference,
      paymentFxRate: purchase.payment_fx_rate === null ? null : Number(purchase.payment_fx_rate),
      paymentFxReference: purchase.payment_fx_reference,
    })),
    lines: lineRows.map((line) => ({
      id: String(line.id), purchaseId: String(line.purchase_id), productId: String(line.product_id),
      quantity: Number(line.quantity), unitCost: Number(line.unit_cost),
    })),
    sales: saleRows.map((sale) => ({
      id: String(sale.id), marketplaceAccountId: String(sale.marketplace_account_id),
      saleId: sale.sale_id ?? null, srid: sale.srid, productId: String(sale.product_id),
      saleDate: sale.sale_date, returnDate: sale.return_date,
      quantity: Number(sale.quantity), isReturn: sale.is_return,
    })),
  };
}

export async function getCompanyPurchaseRecognition(
  companyId: string,
  asOfDate: string
): Promise<PurchaseRecognitionSummary & { persistedEventCount: number; reconciliationRequired: boolean }> {
  const input = await loadRecognitionInput(companyId, asOfDate);
  const planned = planPurchaseRecognition(input);
  const db = createAdminClient();
  const persisted = await allPages<TaxPurchaseRecognitionEvent>((from, to) =>
    db.from("tax_purchase_recognition_events").select("*").eq("company_id", companyId)
      .lte("recognition_date", asOfDate).order("id").range(from, to)
  );
  const persistedKeys = new Set(persisted.map((event) => event.event_key));
  const reconciliationRequired = planned.events.some((event) => !persistedKeys.has(event.eventKey));
  const gross = persisted.filter((event) => event.event_type === "RECOGNITION")
    .reduce((sum, event) => sum + Number(event.amount_rub), 0);
  const reversals = -persisted.filter((event) => event.event_type === "REVERSAL")
    .reduce((sum, event) => sum + Number(event.amount_rub), 0);
  return {
    ...planned.summary,
    status: reconciliationRequired ? "RECONCILIATION_REQUIRED" : planned.summary.status,
    recognizedAmount: Math.round((gross - reversals) * 100) / 100,
    reversedAmount: Math.round(reversals * 100) / 100,
    evidence: {
      ...planned.summary.evidence,
      reasons: reconciliationRequired
        ? [...planned.summary.evidence.reasons, "Persisted recognition ledger requires reconciliation."]
        : planned.summary.evidence.reasons,
    },
    persistedEventCount: persisted.length,
    reconciliationRequired,
  };
}

export async function reconcileCompanyPurchaseRecognition(companyId: string, asOfDate: string) {
  const input = await loadRecognitionInput(companyId, asOfDate);
  const planned = planPurchaseRecognition(input);
  if (!input.policy) throw new Error("Company FIFO purchase tax policy is not configured");
  if (planned.events.length === 0) return { inserted: 0, summary: planned.summary };
  const rows = planned.events.map((event) => ({
    event_key: event.eventKey,
    company_id: event.companyId,
    marketplace_account_id: event.marketplaceAccountId,
    purchase_id: event.purchaseId,
    purchase_line_id: event.purchaseLineId,
    product_id: event.productId,
    source_sale_row_id: event.sourceSaleRowId,
    source_sale_id: event.sourceSaleId,
    source_srid: event.sourceSrid,
    event_type: event.eventType,
    recognition_date: event.recognitionDate,
    quantity: event.quantity,
    unit_cost_rub: event.unitCostRub,
    amount_rub: event.amountRub,
    reversal_of_event_key: event.reversalOfEventKey,
    allocation_method: event.allocationMethod,
    rule_version: event.ruleVersion,
    evidence: event.evidence,
  }));
  const { data, error } = await createAdminClient().from("tax_purchase_recognition_events")
    .upsert(rows, { onConflict: "event_key", ignoreDuplicates: true }).select("event_key");
  if (error) throw new Error(`Purchase recognition append failed: ${error.message}`);
  return { inserted: data?.length ?? 0, summary: planned.summary };
}

export async function saveCompanyPurchaseTaxPolicy(input: {
  companyId: string;
  effectiveFrom: string;
  evidenceReference: string;
}) {
  if (!/^\d+$/.test(input.companyId) || !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom) ||
    !input.evidenceReference.trim()) throw new Error("Valid explicit policy evidence is required");
  const { data, error } = await createAdminClient().from("company_purchase_tax_policies").insert({
    company_id: input.companyId,
    allocation_method: "FIFO",
    payment_policy: "FULL_PAYMENT_ONLY",
    return_policy: "RETURN_EVENT_DATE",
    effective_from: input.effectiveFrom,
    evidence_reference: input.evidenceReference.trim(),
  }).select("*").single();
  if (error || !data) throw new Error(`Purchase tax policy could not be saved: ${error?.message ?? "no row"}`);
  return data as CompanyPurchaseTaxPolicy;
}

export async function updatePurchasePaymentEvidence(input: {
  purchaseId: string;
  marketplaceAccountId: string;
  paymentStatus: PurchasePaymentStatus;
  paymentDate: string | null;
  paidAmount: number;
  paymentReference: string | null;
  paymentFxRate: number | null;
  paymentFxReference: string | null;
}) {
  const db = createAdminClient();
  const { data: purchase, error: purchaseError } = await db.from("purchases").select("*")
    .eq("id", input.purchaseId).eq("marketplace_account_id", input.marketplaceAccountId).maybeSingle();
  if (purchaseError) throw new Error(`Purchase unavailable: ${purchaseError.message}`);
  if (!purchase) throw new Error("Purchase not found in authorized account");
  const { data: lines, error: lineError } = await db.from("purchase_lines")
    .select("quantity,unit_cost").eq("purchase_id", input.purchaseId);
  if (lineError) throw new Error(`Purchase lines unavailable: ${lineError.message}`);
  const total = (lines ?? []).reduce((sum, line) =>
    sum + Number(line.quantity) * Number(line.unit_cost), 0);
  if (input.paymentStatus === "UNPAID") {
    input.paymentDate = null;
    input.paidAmount = 0;
    input.paymentReference = null;
  } else if (!input.paymentDate || !input.paymentReference?.trim() || input.paidAmount <= 0) {
    throw new Error("Dated payment amount and reference are required");
  }
  if (input.paymentStatus === "PAID" && input.paidAmount + 0.005 < total) {
    throw new Error("PAID requires the full documented purchase amount");
  }
  if (input.paymentStatus === "PARTIALLY_PAID" && input.paidAmount + 0.005 >= total) {
    throw new Error("Use PAID when the full documented purchase amount is paid");
  }
  const fxPairComplete = input.paymentFxRate !== null && Boolean(input.paymentFxReference?.trim());
  if ((input.paymentFxRate !== null || input.paymentFxReference?.trim()) && !fxPairComplete) {
    throw new Error("FX rate and official FX reference must be supplied together");
  }
  const { data, error } = await db.from("purchases").update({
    payment_status: input.paymentStatus,
    payment_date: input.paymentDate,
    paid_amount: input.paidAmount,
    payment_reference: input.paymentReference?.trim() || null,
    payment_fx_rate: input.paymentFxRate,
    payment_fx_reference: input.paymentFxReference?.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq("id", input.purchaseId).eq("marketplace_account_id", input.marketplaceAccountId)
    .select("*").single();
  if (error || !data) throw new Error(`Payment evidence could not be saved: ${error?.message ?? "no row"}`);
  return data as Purchase;
}
