"use client";

import { useEffect, useState } from "react";
import { DEFAULT_TAX_MODEL_FORM, TaxModelFields, type TaxModelForm } from "@/components/tax/tax-model-fields";
import type { CompanyTaxProfile, CompanyWithAccounts } from "@/types/database";

type TaxOverview = {
  from: string;
  to: string;
  taxableIncome: { status: string; amountKopeks: number | null };
  calculation: { readiness: string; taxBaseKopeks: number | null;
    estimatedTaxYtdKopeks: number | null; minimumTaxReferenceKopeks: number | null };
  marketplace: { recognizedKopeks: number; reviewKopeks: number; unverifiedKopeks: number };
  operating: { recognizedKopeks: number; reviewKopeks: number; unverifiedKopeks: number };
  purchases: { recognition: string; taxDeductibleKopeks: number };
  calculationStatus: string;
  warnings: string[];
};

const rub = (kopeks: number | null) => kopeks === null ? "Unavailable"
  : `${(kopeks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;

export function TaxProfilePanel() {
  const [companies, setCompanies] = useState<CompanyWithAccounts[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [profiles, setProfiles] = useState<CompanyTaxProfile[]>([]);
  const [today, setToday] = useState("");
  const [overview, setOverview] = useState<TaxOverview | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [model, setModel] = useState<TaxModelForm>(DEFAULT_TAX_MODEL_FORM);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/companies").then((r) => r.json()).then((data) => {
      const rows = (data.companies ?? []) as CompanyWithAccounts[];
      setCompanies(rows);
      const requested = new URLSearchParams(window.location.search).get("company");
      if (rows.length) setCompanyId(rows.find((c) => c.id === requested)?.id ?? rows[0].id);
    }).catch(() => setError("Companies unavailable"));
  }, []);

  async function loadProfiles(id: string) {
    const response = await fetch(`/api/tax/profiles?companyId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Tax profiles unavailable");
    setProfiles(data.profiles ?? []);
    setToday(data.today);
    setEffectiveFrom((data.profiles ?? []).length ? "" : data.today);
    const from = `${data.today.slice(0, 4)}-01-01`;
    const overviewResponse = await fetch(`/api/tax/overview?companyId=${encodeURIComponent(id)}&from=${from}&to=${data.today}`, { cache: "no-store" });
    const overviewData = await overviewResponse.json();
    if (!overviewResponse.ok) throw new Error(overviewData.error ?? "Tax overview unavailable");
    setOverview(overviewData as TaxOverview);
  }

  useEffect(() => {
    if (!companyId) return;
    void loadProfiles(companyId).catch((e) => setError(e.message));
  }, [companyId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/tax/profiles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, model: model.tax_model,
          customObject: model.custom_tax_object, customRate: Number(model.custom_tax_rate),
          effectiveFrom, vatStatus: model.vat_status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Tax profile could not be saved");
      await loadProfiles(companyId);
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  const current = profiles.find((p) => p.effective_from <= today && (!p.effective_to || p.effective_to >= today));
  const tomorrow = today ? new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : "";
  return (
    <div className="space-y-5">
      <label className="block max-w-sm space-y-1 text-sm"><span>Company</span>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2">
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">Current Tax Profile</h2>
        {current ? <p className="mt-2 text-sm">{current.tax_object === "USN_INCOME" ? "УСН Доходы" : "УСН Доходы минус Расходы"} · {current.tax_rate}% · VAT {current.vat_status.replaceAll("_", " ")} · effective {current.effective_from}</p>
          : <p className="mt-2 text-sm text-muted-foreground">TAX_PROFILE_MISSING — existing company tax model has not been confirmed.</p>}
        <p className="mt-2 text-sm text-muted-foreground">The effective profile controls tax calculations. Financial Engine V4 profitability is unchanged.</p>
      </section>
      {overview ? <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold">Tax Engine · {overview.from} to {overview.to}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Revenue verification: <strong>{overview.taxableIncome.status}</strong> · Calculation: {overview.calculationStatus.replaceAll("_", " ")}</p>
        </div>
        {overview.taxableIncome.status !== "VERIFIED" ? <div className="rounded-xl border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
          <strong>Taxable Income: Unverified</strong>
          <p className="mt-1">No final taxable revenue, tax base, or tax amount is published until the Finance evidence contract is complete.</p>
        </div> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Taxable Revenue</p><p className="mt-1 font-semibold">{rub(overview.taxableIncome.amountKopeks)}</p></article>
          <article className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Recognized Marketplace</p><p className="mt-1 font-semibold">{rub(overview.marketplace.recognizedKopeks)}</p></article>
          <article className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Recognized Operating</p><p className="mt-1 font-semibold">{rub(overview.operating.recognizedKopeks)}</p></article>
          <article className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Recognized Purchases</p><p className="mt-1 font-semibold">{rub(overview.purchases.taxDeductibleKopeks)}</p><p className="text-xs text-muted-foreground">{overview.purchases.recognition.replaceAll("_", " ")}</p></article>
          <article className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Needs Review</p><p className="mt-1 font-semibold">{rub(overview.marketplace.reviewKopeks + overview.operating.reviewKopeks)}</p></article>
          <article className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Unverified Expenses</p><p className="mt-1 font-semibold">{rub(overview.marketplace.unverifiedKopeks + overview.operating.unverifiedKopeks)}</p></article>
          <article className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Tax Base</p><p className="mt-1 font-semibold">{rub(overview.calculation.taxBaseKopeks)}</p></article>
          <article className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Estimated Tax</p><p className="mt-1 font-semibold">{rub(overview.calculation.estimatedTaxYtdKopeks)}</p><p className="text-xs text-muted-foreground">Annual 1% reference: {rub(overview.calculation.minimumTaxReferenceKopeks)}</p></article>
        </div>
        {overview.warnings.length ? <div className="text-sm"><h3 className="font-medium">Blockers and review items</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">{[...new Set(overview.warnings)].map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
      </section> : null}
      {companyId ? <form onSubmit={save} className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">{profiles.length ? "Schedule future tax profile" : "Configure tax profile"}</h2>
        <div className="grid gap-4 sm:grid-cols-3"><TaxModelFields value={model} onChange={setModel} />
          <label className="space-y-1.5 text-sm"><span>Effective from</span>
            <input type="date" required min={profiles.length ? tomorrow : undefined} value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Existing elections can only be superseded on a future date. Custom rate eligibility requires accountant confirmation.</p>
        <button disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Save Tax Profile</button>
      </form> : null}
      {profiles.length ? <section className="text-sm"><h2 className="font-semibold">Effective history</h2>
        <ul className="mt-2 space-y-1">{profiles.map((p) => <li key={p.id}>{p.effective_from} – {p.effective_to ?? "open"}: {p.tax_object} {p.tax_rate}% · VAT {p.vat_status.replaceAll("_", " ")}</li>)}</ul>
      </section> : null}
    </div>
  );
}
