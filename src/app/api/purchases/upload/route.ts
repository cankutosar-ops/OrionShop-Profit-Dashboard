import { NextResponse } from "next/server";
import { parsePurchaseExcel } from "@/lib/purchase-excel";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import { getCompanyById } from "@/services/marketplace-account-service";
import { importPurchaseFromExcel } from "@/services/purchase-service";
import { PURCHASE_CURRENCIES, type PurchaseCurrency } from "@/types/database";

export const dynamic = "force-dynamic";

function parseExchangeRate(
  currency: PurchaseCurrency,
  baseCurrency: string,
  exchangeRateRaw: string
): number | null {
  if (currency === baseCurrency.toUpperCase()) {
    return null;
  }

  if (!exchangeRateRaw) {
    return null;
  }

  const exchangeRate = Number(exchangeRateRaw.replace(",", "."));
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error("Exchange Rate must be a positive number");
  }

  return exchangeRate;
}

function parseHeader(formData: FormData, baseCurrency: string) {
  const purchaseDate = String(formData.get("purchase_date") ?? "").trim();
  const supplier = String(formData.get("supplier") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim().toUpperCase() as PurchaseCurrency;
  const exchangeRateRaw = String(formData.get("exchange_rate") ?? "").trim();
  const invoiceNumber = String(formData.get("invoice_number") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!purchaseDate) {
    throw new Error("Purchase Date is required");
  }
  if (!PURCHASE_CURRENCIES.includes(currency)) {
    throw new Error("Currency must be USD, RUB, TRY, or EUR");
  }

  return {
    purchase_date: purchaseDate,
    supplier,
    currency,
    exchange_rate: parseExchangeRate(currency, baseCurrency, exchangeRateRaw),
    invoice_number: invoiceNumber || null,
    notes: notes || null,
  };
}

export async function POST(request: Request) {
  try {
    const authz = await authorizeRequestScope(request, {
      allowDefaultAccount: true,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const company = authz.companyId ? await getCompanyById(authz.companyId) : null;
    const baseCurrency = (company?.currency || "TRY").toUpperCase();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required (.xlsx)" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json({ error: "Only .xlsx files are supported" }, { status: 400 });
    }

    const header = parseHeader(formData, baseCurrency);
    const buffer = await file.arrayBuffer();
    const parsed = parsePurchaseExcel(buffer);
    const result = await importPurchaseFromExcel(
      {
        marketplace_account_id: authz.marketplaceAccountId!,
        ...header,
      },
      parsed
    );

    if (result.errors.length > 0) {
      console.error("[purchase-import] completed with errors", {
        purchaseId: result.purchaseId,
        productsImported: result.productsImported,
        newProducts: result.newProducts,
        skipped: result.skipped,
        errors: result.errors,
      });
    }

    return NextResponse.json({
      purchaseCreated: true,
      purchaseId: result.purchaseId,
      productsImported: result.productsImported,
      newProducts: result.newProducts,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import purchase";
    console.error("[purchase-import] failed", { error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
