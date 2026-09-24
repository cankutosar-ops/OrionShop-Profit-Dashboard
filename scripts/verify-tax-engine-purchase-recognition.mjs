import assert from "node:assert/strict";
import { planPurchaseRecognition } from "../src/lib/tax-engine/purchase-recognition.ts";

const policy = {
  companyId: "1", allocationMethod: "FIFO", paymentPolicy: "FULL_PAYMENT_ONLY",
  returnPolicy: "RETURN_EVENT_DATE", effectiveFrom: "2026-01-01",
};
const purchase = (overrides = {}) => ({
  id: "10", marketplaceAccountId: "1", purchaseDate: "2026-01-01", currency: "RUB",
  invoiceNumber: "INV-10", paymentStatus: "PAID", paymentDate: "2026-01-02",
  paidAmount: 1000, paymentReference: "BANK-10", paymentFxRate: null,
  paymentFxReference: null, ...overrides,
});
const line = (overrides = {}) => ({
  id: "100", purchaseId: "10", productId: "500", quantity: 10, unitCost: 100, ...overrides,
});
const sale = (overrides = {}) => ({
  id: "1000", marketplaceAccountId: "1", saleId: "S1000", srid: "SR-1", productId: "500",
  saleDate: "2026-01-03", returnDate: null, quantity: 1, isReturn: false, ...overrides,
});
const plan = (overrides = {}) => planPurchaseRecognition({
  companyId: "1", vatStatus: "EXEMPT", policy,
  purchases: [purchase()], lines: [line()], sales: [sale()], ...overrides,
});

{
  const result = plan();
  assert.equal(result.events.length, 1);
  assert.equal(result.summary.recognizedAmount, 100);
  assert.equal(result.summary.paidNotSoldAmount, 900);
  assert.equal(result.events[0].purchaseLineId, "100");
}
{
  const result = plan({ purchases: [purchase({ paymentStatus: "UNPAID", paymentDate: null,
    paidAmount: 0, paymentReference: null })] });
  assert.equal(result.events.length, 0);
  assert.equal(result.summary.recognizedAmount, 0);
  assert.equal(result.summary.unpaidAmount, 1000);
}
{
  const result = plan({ purchases: [purchase({ paymentStatus: "PARTIALLY_PAID", paidAmount: 500 })] });
  assert.equal(result.events.length, 0);
  assert.equal(result.summary.unpaidAmount, 1000);
}
{
  const result = plan({ policy: null });
  assert.equal(result.summary.status, "POLICY_UNCONFIGURED");
  assert.equal(result.events.length, 0);
}
{
  const result = plan({ policy: { ...policy, effectiveFrom: "2026-02-01" } });
  assert.equal(result.events.length, 0, "policy must not be silently applied before its effective date");
}
{
  const result = plan({ vatStatus: "UNKNOWN" });
  assert.equal(result.summary.status, "VAT_BASIS_UNVERIFIED");
  assert.equal(result.summary.vatUnverifiedAmount, 1000);
  assert.equal(result.events.length, 0);
}
{
  const result = plan({
    purchases: [purchase({ currency: "USD", paymentFxRate: null, paymentFxReference: null })],
  });
  assert.equal(result.summary.status, "UNVERIFIED_FX");
  assert.deepEqual(result.summary.evidence.fxUnverifiedSourceAmounts, { USD: 1000 });
  assert.equal(result.events.length, 0);
}
{
  const result = plan({
    purchases: [purchase({ currency: "USD", paidAmount: 1000,
      paymentFxRate: 90, paymentFxReference: "CBR-2026-01-02" })],
  });
  assert.equal(result.summary.recognizedAmount, 9000);
  assert.equal(result.events[0].unitCostRub, 9000);
}
{
  const result = plan({ purchases: [purchase({ invoiceNumber: null })] });
  assert.equal(result.events.length, 0);
  assert.equal(result.summary.evidence.undocumentedPurchaseCount, 1);
}
{
  const result = plan({
    purchases: [
      purchase({ id: "10", purchaseDate: "2026-01-01", paidAmount: 200 }),
      purchase({ id: "11", purchaseDate: "2026-01-02", paidAmount: 300, paymentReference: "BANK-11" }),
    ],
    lines: [line({ id: "100", purchaseId: "10", quantity: 2, unitCost: 100 }),
      line({ id: "101", purchaseId: "11", quantity: 2, unitCost: 150 })],
    sales: [sale({ quantity: 3 })],
  });
  assert.deepEqual(result.events.map((event) => [event.purchaseLineId, event.quantity, event.amountRub]),
    [["100", 2, 200], ["101", 1, 150]]);
}
{
  const result = plan({ sales: [sale({ quantity: 20 })] });
  assert.equal(result.summary.recognizedAmount, 1000);
  assert.equal(result.events[0].quantity, 10);
}
{
  const result = plan({
    purchases: [purchase({ paymentDate: "2026-01-10" })],
    sales: [sale({ saleDate: "2026-01-03" })],
  });
  assert.equal(result.events[0].recognitionDate, "2026-01-10");
}
{
  const result = plan({ sales: [sale(), sale({
    id: "1001", saleId: "R1001", isReturn: true, returnDate: "2026-01-07",
  })] });
  assert.equal(result.events.length, 2);
  assert.equal(result.events[1].eventType, "REVERSAL");
  assert.equal(result.events[1].recognitionDate, "2026-01-07");
  assert.equal(result.events[1].amountRub, -100);
  assert.equal(result.summary.recognizedAmount, 0);
  assert.equal(result.summary.reversedAmount, 100);
}
{
  const result = plan({ sales: [sale(), sale({
    id: "1001", saleId: "R1001", isReturn: true, returnDate: "2026-01-07",
  }), sale({ id: "1002", saleId: "S1002", srid: "SR-2", saleDate: "2026-01-08" })] });
  assert.equal(result.events.filter((event) => event.eventType === "RECOGNITION").length, 2);
  assert.equal(result.summary.recognizedAmount, 100);
}
{
  const a = plan();
  const b = plan();
  assert.deepEqual(a.events, b.events, "re-run must be deterministic and idempotent by event key");
}
{
  const result = plan({ sales: [sale(), sale({ id: "9999" })] });
  assert.equal(result.events.length, 1, "duplicate WB sale identity must not duplicate recognition");
}
{
  const result = plan({ sales: [sale({ saleId: "unresolved:1:SR-1:SALE" })] });
  assert.equal(result.events.length, 0);
  assert.equal(result.summary.evidence.rejectedUnresolvedSaleCount, 1);
}
{
  const result = plan({ sales: [] });
  assert.equal(result.summary.status, "PAID_NOT_SOLD");
  assert.equal(result.summary.paidNotSoldAmount, 1000);
}
{
  const result = plan({ purchases: [], lines: [], sales: [] });
  assert.equal(result.summary.status, "NO_PURCHASES");
}
{
  const result = plan({
    purchases: [purchase({ id: "10", paymentDate: "2026-01-20", paidAmount: 500 }),
      purchase({ id: "11", purchaseDate: "2026-01-02", paymentDate: "2026-01-02",
        paidAmount: 500, paymentReference: "BANK-11" })],
    lines: [line({ id: "100", purchaseId: "10", quantity: 5 }),
      line({ id: "101", purchaseId: "11", quantity: 5 })],
    sales: [sale({ saleDate: "2026-01-10" }),
      sale({ id: "1001", saleId: "S1001", srid: "SR-2", saleDate: "2026-01-21" })],
  });
  assert.equal(result.events[0].purchaseLineId, "101", "oldest eligible paid lot must be used");
  assert.equal(result.events[1].purchaseLineId, "100", "later payment activates older FIFO lot");
}

console.log("Tax Engine Sprint 3B purchase recognition verification passed (20 scenarios).");
