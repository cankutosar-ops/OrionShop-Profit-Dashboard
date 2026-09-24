"use client";

import { useEffect, useState } from "react";
import { DEFAULT_TAX_MODEL_FORM, TaxModelFields, type TaxModelForm } from "@/components/tax/tax-model-fields";
import type { CompanyTaxProfile, CompanyWithAccounts } from "@/types/database";

export function TaxProfilePanel() {
  const [companies, setCompanies] = useState<CompanyWithAccounts[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [profiles, setProfiles] = useState<CompanyTaxProfile[]>([]);
  const [today, setToday] = useState("");
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
          customObject: model.custom_tax_object, customRate: Number(model.custom_tax_rate), effectiveFrom }),
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
        {current ? <p className="mt-2 text-sm">{current.tax_object === "USN_INCOME" ? "УСН Доходы" : "УСН Доходы минус Расходы"} · {current.tax_rate}% · effective {current.effective_from}</p>
          : <p className="mt-2 text-sm text-muted-foreground">TAX_PROFILE_MISSING — existing company tax model has not been confirmed.</p>}
        <p className="mt-2 text-sm text-muted-foreground">Tax calculation unavailable: the gross taxable-income source requires validation. V4 profitability is unchanged.</p>
      </section>
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
        <ul className="mt-2 space-y-1">{profiles.map((p) => <li key={p.id}>{p.effective_from} – {p.effective_to ?? "open"}: {p.tax_object} {p.tax_rate}%</li>)}</ul>
      </section> : null}
    </div>
  );
}
