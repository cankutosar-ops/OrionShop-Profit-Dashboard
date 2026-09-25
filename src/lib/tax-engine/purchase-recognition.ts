export const PURCHASE_RECOGNITION_RULE_VERSION = "TAX_PURCHASE_FIFO_V1";

export type PurchaseTaxPolicy = {
  companyId: string;
  allocationMethod: "FIFO";
  paymentPolicy: "FULL_PAYMENT_ONLY";
  returnPolicy: "RETURN_EVENT_DATE";
  effectiveFrom: string;
};

export type PurchaseRecognitionInput = {
  companyId: string;
  vatStatus: "UNKNOWN" | "EXEMPT" | "VAT_APPLICABLE";
  policy: PurchaseTaxPolicy | null;
  purchases: Array<{
    id: string;
    marketplaceAccountId: string;
    purchaseDate: string;
    currency: string;
    invoiceNumber: string | null;
    paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    paymentDate: string | null;
    paidAmount: number;
    paymentReference: string | null;
    paymentFxRate: number | null;
    paymentFxReference: string | null;
  }>;
  lines: Array<{
    id: string;
    purchaseId: string;
    productId: string;
    quantity: number;
    unitCost: number;
  }>;
  sales: Array<{
    id: string;
    marketplaceAccountId: string;
    saleId: string | null;
    srid: string;
    productId: string;
    saleDate: string;
    returnDate: string | null;
    quantity: number;
    isReturn: boolean;
  }>;
};

export type PurchaseRecognitionEvent = {
  eventKey: string;
  companyId: string;
  marketplaceAccountId: string;
  purchaseId: string;
  purchaseLineId: string;
  productId: string;
  sourceSaleRowId: string;
  sourceSaleId: string;
  sourceSrid: string;
  eventType: "RECOGNITION" | "REVERSAL";
  recognitionDate: string;
  quantity: number;
  unitCostRub: number;
  amountRub: number;
  reversalOfEventKey: string | null;
  allocationMethod: "FIFO";
  ruleVersion: typeof PURCHASE_RECOGNITION_RULE_VERSION;
  evidence: Record<string, unknown>;
};

export type PurchaseRecognitionStatus =
  | "NO_PURCHASES"
  | "POLICY_UNCONFIGURED"
  | "RECONCILIATION_REQUIRED"
  | "UNPAID"
  | "UNVERIFIED_FX"
  | "VAT_BASIS_UNVERIFIED"
  | "PAID_NOT_SOLD"
  | "PARTIALLY_RECOGNIZED"
  | "RECOGNIZED";

export type PurchaseRecognitionSummary = {
  recognizedAmount: number;
  unpaidAmount: number;
  paidNotSoldAmount: number;
  fxUnverifiedAmount: null;
  vatUnverifiedAmount: number;
  reversedAmount: number;
  status: PurchaseRecognitionStatus;
  evidence: {
    ruleVersion: typeof PURCHASE_RECOGNITION_RULE_VERSION;
    allocationMethod: "FIFO" | null;
    fullPaymentOnly: true;
    returnRecognition: "RETURN_EVENT_DATE";
    purchaseCount: number;
    lineCount: number;
    eligibleLineCount: number;
    recognitionEventCount: number;
    reversalEventCount: number;
    rejectedUnresolvedSaleCount: number;
    undocumentedPurchaseCount: number;
    fxUnverifiedSourceAmounts: Record<string, number>;
    reasons: string[];
  };
};

type Lot = {
  lineId: string;
  purchaseId: string;
  productId: string;
  accountId: string;
  purchaseDate: string;
  eligibleDate: string;
  quantity: number;
  remaining: number;
  unitCostRub: number;
};

type PendingSale = PurchaseRecognitionInput["sales"][number] & { remaining: number };
type ActiveRecognition = { event: PurchaseRecognitionEvent; remaining: number; lot: Lot };

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const eventDate = (sale: PurchaseRecognitionInput["sales"][number]) =>
  sale.isReturn ? sale.returnDate ?? sale.saleDate : sale.saleDate;
const nativeSaleId = (saleId: string | null) =>
  Boolean(saleId && !saleId.startsWith("unresolved:"));

function purchaseTotal(
  purchaseId: string,
  lines: PurchaseRecognitionInput["lines"]
): number {
  return roundMoney(lines
    .filter((line) => line.purchaseId === purchaseId)
    .reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
}

function makeRecognition(
  sale: PendingSale,
  lot: Lot,
  quantity: number,
  date: string
): PurchaseRecognitionEvent {
  const eventKey = `recognition:${sale.marketplaceAccountId}:${sale.id}:${lot.lineId}`;
  return {
    eventKey,
    companyId: "",
    marketplaceAccountId: sale.marketplaceAccountId,
    purchaseId: lot.purchaseId,
    purchaseLineId: lot.lineId,
    productId: lot.productId,
    sourceSaleRowId: sale.id,
    sourceSaleId: sale.saleId!,
    sourceSrid: sale.srid,
    eventType: "RECOGNITION",
    recognitionDate: date,
    quantity,
    unitCostRub: lot.unitCostRub,
    amountRub: roundMoney(quantity * lot.unitCostRub),
    reversalOfEventKey: null,
    allocationMethod: "FIFO",
    ruleVersion: PURCHASE_RECOGNITION_RULE_VERSION,
    evidence: { purchaseDate: lot.purchaseDate, eligibleDate: lot.eligibleDate },
  };
}

export function planPurchaseRecognition(input: PurchaseRecognitionInput): {
  events: PurchaseRecognitionEvent[];
  summary: PurchaseRecognitionSummary;
} {
  const reasons = new Set<string>();
  const purchaseById = new Map(input.purchases.map((purchase) => [purchase.id, purchase]));
  const totals = new Map(input.purchases.map((purchase) => [
    purchase.id,
    purchaseTotal(purchase.id, input.lines),
  ]));
  const lots: Lot[] = [];
  let unpaidAmount = 0;
  let vatUnverifiedAmount = 0;
  let undocumentedPurchaseCount = 0;
  const fxUnverifiedSourceAmounts: Record<string, number> = {};

  if (!input.policy) reasons.add("Company FIFO purchase tax policy is not configured.");
  if (input.vatStatus !== "EXEMPT") reasons.add("VAT basis is not resolved by the effective company tax profile.");

  for (const line of input.lines) {
    const purchase = purchaseById.get(line.purchaseId);
    if (!purchase) throw new Error(`Purchase line ${line.id} has no purchase header`);
    const faceAmount = roundMoney(line.quantity * line.unitCost);
    const documented = Boolean(purchase.invoiceNumber?.trim());
    if (!documented) undocumentedPurchaseCount += 1;
    const total = totals.get(purchase.id) ?? 0;
    const fullyPaid = purchase.paymentStatus === "PAID" && Boolean(purchase.paymentDate) &&
      Boolean(purchase.paymentReference?.trim()) && purchase.paidAmount + 0.005 >= total;
    const isRub = purchase.currency.toUpperCase() === "RUB";
    const fxVerified = isRub || (Boolean(purchase.paymentFxReference?.trim()) &&
      purchase.paymentFxRate !== null && purchase.paymentFxRate > 0);
    const unitCostRub = fxVerified
      ? roundMoney(line.unitCost * (isRub ? 1 : purchase.paymentFxRate!))
      : null;

    if (!fxVerified) {
      fxUnverifiedSourceAmounts[purchase.currency] = roundMoney(
        (fxUnverifiedSourceAmounts[purchase.currency] ?? 0) + faceAmount
      );
      reasons.add("Foreign-currency purchase lacks verified payment FX evidence.");
      continue;
    }
    const rubAmount = roundMoney(line.quantity * unitCostRub!);
    if (input.vatStatus !== "EXEMPT") {
      vatUnverifiedAmount = roundMoney(vatUnverifiedAmount + rubAmount);
      continue;
    }
    if (!fullyPaid || !documented || !input.policy) {
      unpaidAmount = roundMoney(unpaidAmount + rubAmount);
      if (!documented) reasons.add("Purchase document number is missing.");
      if (!fullyPaid) reasons.add("Purchase is not fully paid with dated payment evidence.");
      continue;
    }
    lots.push({
      lineId: line.id,
      purchaseId: purchase.id,
      productId: line.productId,
      accountId: purchase.marketplaceAccountId,
      purchaseDate: purchase.purchaseDate,
      eligibleDate: purchase.paymentDate! > purchase.purchaseDate
        ? purchase.paymentDate! : purchase.purchaseDate,
      quantity: line.quantity,
      remaining: line.quantity,
      unitCostRub: unitCostRub!,
    });
  }

  lots.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate) ||
    a.eligibleDate.localeCompare(b.eligibleDate) || a.lineId.localeCompare(b.lineId));
  const sales = input.sales
    .filter((sale) => sale.quantity > 0 && sale.productId && sale.marketplaceAccountId)
    .sort((a, b) => eventDate(a).localeCompare(eventDate(b)) ||
      Number(a.isReturn) - Number(b.isReturn) || a.id.localeCompare(b.id));
  const unresolved = sales.filter((sale) => !nativeSaleId(sale.saleId)).length;
  const eligibleSales = [...new Map(sales.filter((sale) => nativeSaleId(sale.saleId) &&
    (!input.policy || eventDate(sale) >= input.policy.effectiveFrom))
    .map((sale) => [`${sale.marketplaceAccountId}\0${sale.saleId}`, sale])).values()];
  if (unresolved) reasons.add("Sales with unresolved WB sale identity were rejected.");

  const events: PurchaseRecognitionEvent[] = [];
  const activeBySrid = new Map<string, ActiveRecognition[]>();
  const pendingByProduct = new Map<string, PendingSale[]>();
  const activeLots = new Set<string>();

  const allocate = (date: string, productId?: string) => {
    const productIds = productId ? [productId] : [...pendingByProduct.keys()];
    for (const currentProductId of productIds) {
      const pending = pendingByProduct.get(currentProductId) ?? [];
      for (const sale of pending) {
        while (sale.remaining > 0) {
          const lot = lots.find((candidate) => candidate.productId === currentProductId &&
            activeLots.has(candidate.lineId) && candidate.remaining > 0);
          if (!lot) break;
          const quantity = Math.min(sale.remaining, lot.remaining);
          const event = makeRecognition(sale, lot, quantity, date);
          event.companyId = input.companyId;
          events.push(event);
          const active = activeBySrid.get(sale.srid) ?? [];
          active.push({ event, remaining: quantity, lot });
          activeBySrid.set(sale.srid, active);
          lot.remaining -= quantity;
          sale.remaining -= quantity;
        }
      }
      pendingByProduct.set(currentProductId, pending.filter((sale) => sale.remaining > 0));
    }
  };

  const timeline = [
    ...lots.map((lot) => ({ date: lot.eligibleDate, kind: "LOT" as const, lot })),
    ...eligibleSales.map((sale) => ({ date: eventDate(sale), kind: sale.isReturn ? "RETURN" as const : "SALE" as const, sale })),
  ].sort((a, b) => a.date.localeCompare(b.date) ||
    ({ LOT: 0, SALE: 1, RETURN: 2 }[a.kind] - { LOT: 0, SALE: 1, RETURN: 2 }[b.kind]));

  for (const item of timeline) {
    if (item.kind === "LOT") {
      activeLots.add(item.lot.lineId);
      allocate(item.date, item.lot.productId);
      continue;
    }
    const sale = item.sale;
    if (item.kind === "SALE") {
      const pending = pendingByProduct.get(sale.productId) ?? [];
      pending.push({ ...sale, remaining: sale.quantity });
      pendingByProduct.set(sale.productId, pending);
      allocate(item.date, sale.productId);
      continue;
    }

    let returnRemaining = sale.quantity;
    const pending = pendingByProduct.get(sale.productId) ?? [];
    for (const pendingSale of pending.filter((candidate) => candidate.srid === sale.srid)) {
      const cancelled = Math.min(returnRemaining, pendingSale.remaining);
      pendingSale.remaining -= cancelled;
      returnRemaining -= cancelled;
    }
    pendingByProduct.set(sale.productId, pending.filter((candidate) => candidate.remaining > 0));
    const active = activeBySrid.get(sale.srid) ?? [];
    for (const recognition of [...active].reverse()) {
      if (returnRemaining <= 0) break;
      if (recognition.event.productId !== sale.productId) continue;
      const quantity = Math.min(returnRemaining, recognition.remaining);
      if (quantity <= 0) continue;
      const eventKey = `reversal:${sale.marketplaceAccountId}:${sale.id}:${recognition.event.eventKey}`;
      events.push({
        ...recognition.event,
        eventKey,
        sourceSaleRowId: sale.id,
        sourceSaleId: sale.saleId!,
        sourceSrid: sale.srid,
        eventType: "REVERSAL",
        recognitionDate: item.date,
        quantity,
        amountRub: -roundMoney(quantity * recognition.event.unitCostRub),
        reversalOfEventKey: recognition.event.eventKey,
        evidence: { returnEventDate: item.date, originalSaleId: recognition.event.sourceSaleId },
      });
      recognition.remaining -= quantity;
      recognition.lot.remaining += quantity;
      returnRemaining -= quantity;
    }
    activeBySrid.set(sale.srid, active.filter((recognition) => recognition.remaining > 0));
  }

  const grossRecognized = roundMoney(events
    .filter((event) => event.eventType === "RECOGNITION")
    .reduce((sum, event) => sum + event.amountRub, 0));
  const reversedAmount = roundMoney(-events
    .filter((event) => event.eventType === "REVERSAL")
    .reduce((sum, event) => sum + event.amountRub, 0));
  const recognizedAmount = roundMoney(grossRecognized - reversedAmount);
  const paidNotSoldAmount = roundMoney(lots.reduce(
    (sum, lot) => sum + lot.remaining * lot.unitCostRub, 0
  ));
  const hasFxGap = Object.keys(fxUnverifiedSourceAmounts).length > 0;
  let status: PurchaseRecognitionStatus;
  if (input.purchases.length === 0) status = "NO_PURCHASES";
  else if (!input.policy) status = "POLICY_UNCONFIGURED";
  else if (hasFxGap) status = "UNVERIFIED_FX";
  else if (vatUnverifiedAmount > 0) status = "VAT_BASIS_UNVERIFIED";
  else if (lots.length === 0) status = "UNPAID";
  else if (recognizedAmount <= 0) status = "PAID_NOT_SOLD";
  else if (paidNotSoldAmount > 0) status = "PARTIALLY_RECOGNIZED";
  else status = "RECOGNIZED";

  return {
    events,
    summary: {
      recognizedAmount,
      unpaidAmount,
      paidNotSoldAmount,
      fxUnverifiedAmount: null,
      vatUnverifiedAmount,
      reversedAmount,
      status,
      evidence: {
        ruleVersion: PURCHASE_RECOGNITION_RULE_VERSION,
        allocationMethod: input.policy?.allocationMethod ?? null,
        fullPaymentOnly: true,
        returnRecognition: "RETURN_EVENT_DATE",
        purchaseCount: input.purchases.length,
        lineCount: input.lines.length,
        eligibleLineCount: lots.length,
        recognitionEventCount: events.filter((event) => event.eventType === "RECOGNITION").length,
        reversalEventCount: events.filter((event) => event.eventType === "REVERSAL").length,
        rejectedUnresolvedSaleCount: unresolved,
        undocumentedPurchaseCount,
        fxUnverifiedSourceAmounts,
        reasons: [...reasons],
      },
    },
  };
}
