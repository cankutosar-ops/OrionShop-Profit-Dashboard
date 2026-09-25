"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Purchase, PurchasePaymentStatus } from "@/types/database";

export function PurchasePaymentCard({
  purchase,
  scopeQuery,
}: {
  purchase: Purchase;
  scopeQuery: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<PurchasePaymentStatus>(purchase.payment_status);
  const [date, setDate] = useState(purchase.payment_date ?? "");
  const [amount, setAmount] = useState(String(purchase.paid_amount || ""));
  const [reference, setReference] = useState(purchase.payment_reference ?? "");
  const [fxRate, setFxRate] = useState(String(purchase.payment_fx_rate ?? ""));
  const [fxReference, setFxReference] = useState(purchase.payment_fx_reference ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/purchases/${purchase.id}/payment${scopeQuery ? `?${scopeQuery}` : ""}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentStatus: status,
          paymentDate: status === "UNPAID" ? null : date,
          paidAmount: status === "UNPAID" ? 0 : Number(amount),
          paymentReference: status === "UNPAID" ? null : reference,
          paymentFxRate: fxRate || null,
          paymentFxReference: fxReference || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Payment evidence could not be saved");
      setMessage("Payment evidence saved. Tax recognition remains ledger-backed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment evidence could not be saved");
    } finally {
      setSaving(false);
    }
  }

  const paid = status !== "UNPAID";
  const foreign = purchase.currency !== "RUB";
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 text-xs text-muted-foreground">
          Payment Status
          <select value={status} onChange={(event) => setStatus(event.target.value as PurchasePaymentStatus)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIALLY_PAID">Partially paid</option>
            <option value="PAID">Paid in full</option>
          </select>
        </label>
        <label className="min-w-40 flex-1 text-xs text-muted-foreground">
          Payment Date
          <input type="date" value={date} disabled={!paid} onChange={(event) => setDate(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50" />
        </label>
        <label className="min-w-40 flex-1 text-xs text-muted-foreground">
          Paid Amount ({purchase.currency})
          <input type="number" min="0" step="0.01" value={amount} disabled={!paid}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50" />
        </label>
        <label className="min-w-48 flex-[2] text-xs text-muted-foreground">
          Payment Reference
          <input value={reference} disabled={!paid} onChange={(event) => setReference(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50" />
        </label>
        {foreign && <>
          <label className="min-w-36 flex-1 text-xs text-muted-foreground">
            Official RUB FX Rate
            <input type="number" min="0" step="0.000001" value={fxRate}
              onChange={(event) => setFxRate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
          <label className="min-w-48 flex-[2] text-xs text-muted-foreground">
            FX Evidence Reference
            <input value={fxReference} onChange={(event) => setFxReference(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
        </>}
        <button type="button" onClick={save} disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {saving ? "Saving…" : "Save evidence"}
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Partial payment is retained as evidence but produces zero deductible merchandise cost.
      </p>
      {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}
