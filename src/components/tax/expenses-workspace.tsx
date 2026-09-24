"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { COMPANY_EXPENSE_RULES, companyExpenseRule } from "@/lib/tax-engine/category-rules";
import type { CompanyExpense, CompanyExpenseCategory, CompanyWithAccounts } from "@/types/database";

type Overview = {
  calculation: { readiness: string; estimatedTaxYtdKopeks: number | null };
  taxableRevenueEvidence: { status: string; reasons: string[] } | null;
  manual: { totalKopeks: number; claimedPendingEvidenceKopeks: number; verifiedDeductibleKopeks: number; count: number };
  purchases: { count: number; recognition: string; taxDeductibleKopeks: number | null };
  marketplace: {
    totalBusinessKopeks: number; deductibleKopeks: number; nonDeductibleKopeks: number;
    reviewKopeks: number; warning: string;
    categories: Array<{ category: string; businessKopeks: number; deductibleKopeks: number; reviewKopeks: number }>;
  };
  warnings: string[];
};

type Form = { expenseDate: string; category: CompanyExpenseCategory; description: string;
  amount: string; taxDeductible: boolean; userOverrode: boolean };

function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
const emptyForm = (): Form => ({ expenseDate: today(), category: "ACCOUNTING", description: "", amount: "",
  taxDeductible: companyExpenseRule("ACCOUNTING")!.checkboxDefault, userOverrode: false });
const rub = (kopeks: number) => `${(kopeks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;

export function ExpensesWorkspace() {
  const [companies, setCompanies] = useState<CompanyWithAccounts[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [tab, setTab] = useState<"purchases" | "operating" | "marketplace">("operating");
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today());
  const [overview, setOverview] = useState<Overview | null>(null);
  const [expenses, setExpenses] = useState<CompanyExpense[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  async function refresh(id: string, start: string, end: string) {
    const q = `companyId=${encodeURIComponent(id)}&from=${start}&to=${end}`;
    const [expenseResponse, taxResponse] = await Promise.all([
      fetch(`/api/expenses?${q}`, { cache: "no-store" }),
      fetch(`/api/tax/overview?${q}`, { cache: "no-store" }),
    ]);
    const [expenseData, taxData] = await Promise.all([expenseResponse.json(), taxResponse.json()]);
    if (!expenseResponse.ok) throw new Error(expenseData.error ?? "Expenses unavailable");
    if (!taxResponse.ok) throw new Error(taxData.error ?? "Tax expense summary unavailable");
    setExpenses(expenseData.expenses ?? []);
    setOverview(taxData as Overview);
  }

  useEffect(() => {
    if (!companyId || !from || !to || from > to) return;
    void refresh(companyId, from, to).catch((e) => setError(e.message));
  }, [companyId, from, to]);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(editingId ? `/api/expenses/${editingId}` : "/api/expenses", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...form, amount: Number(form.amount) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Expense could not be saved");
      setEditingId(null); setForm(emptyForm());
      await refresh(companyId, from, to);
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this expense? The audit history is retained.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/expenses/${id}?companyId=${encodeURIComponent(companyId)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Delete failed");
      await refresh(companyId, from, to);
    } catch (e) { setError(e instanceof Error ? e.message : "Delete failed"); }
    finally { setBusy(false); }
  }

  const company = companies.find((c) => c.id === companyId);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">Company<select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="block rounded-xl border border-border bg-background px-3 py-2">
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label className="text-sm">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block rounded-xl border border-border bg-background px-3 py-2" /></label>
        <label className="text-sm">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block rounded-xl border border-border bg-background px-3 py-2" /></label>
      </div>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      <nav className="flex flex-wrap gap-2" aria-label="Expense sections">
        {([ ["purchases", "Purchases"], ["operating", "Operating Expenses"], ["marketplace", "Marketplace Expenses"] ] as const).map(([key, label]) =>
          <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined}
            className={`rounded-xl px-4 py-2 text-sm ${tab === key ? "bg-primary text-primary-foreground" : "border border-border"}`}>{label}</button>)}
      </nav>
      {overview ? <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <strong>Taxable Income: Unverified</strong> · {overview.calculation.readiness}.
        {overview.taxableRevenueEvidence?.reasons.length ? (
          <p className="mt-1 text-muted-foreground">
            Evidence: {overview.taxableRevenueEvidence.reasons.join(" · ")}
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground">Gross taxable-income evidence requires validation.</p>
        )}
        <p className="mt-1 text-muted-foreground">Financial Engine V4 profitability is unchanged. <Link href="/tax" className="underline">Tax profile settings</Link></p>
      </div> : null}
      {tab === "purchases" ? <section className="rounded-2xl border border-border bg-card p-5 space-y-2">
        <h2 className="font-semibold">Purchases</h2>
        <p className="text-sm">{overview?.purchases.count ?? 0} purchase headers in this period. Tax recognition: <strong>UNVERIFIED</strong>. Payment and resale allocations are not yet proven.</p>
        {company?.accounts.length ? <ul className="space-y-1">{company.accounts.map((account) =>
          <li key={account.id}><Link href={`/purchases?company=${companyId}&account=${account.id}`} className="text-sm text-primary underline">Open Purchases for {account.account_name}</Link></li>)}</ul>
          : <p className="text-sm text-muted-foreground">Connect a marketplace account to enter purchases.</p>}
      </section> : null}
      {tab === "operating" ? <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          Total {rub(overview?.manual.totalKopeks ?? 0)} · Claimed pending evidence {rub(overview?.manual.claimedPendingEvidenceKopeks ?? 0)} · Confirmed tax deduction {rub(overview?.manual.verifiedDeductibleKopeks ?? 0)}
        </div>
        <form onSubmit={save} className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="font-semibold">{editingId ? "Edit" : "Add"} operating expense</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">Date<input required type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className="block w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
            <label className="text-sm">Category<select value={form.category} onChange={(e) => {
              const category = e.target.value as CompanyExpenseCategory;
              setForm({ ...form, category, taxDeductible: companyExpenseRule(category)!.checkboxDefault, userOverrode: false });
            }} className="block w-full rounded-xl border border-border bg-background px-3 py-2">
              {COMPANY_EXPENSE_RULES.map((rule) => <option value={rule.category} key={rule.category}>{rule.label}</option>)}
            </select></label>
            <label className="text-sm">Description<input required maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="block w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
            <label className="text-sm">Amount (RUB)<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="block w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.taxDeductible} onChange={(e) => setForm({ ...form, taxDeductible: e.target.checked, userOverrode: true })} /> Tax Deductible</label>
          <p className="text-xs text-muted-foreground">{companyExpenseRule(form.category)?.help} {form.userOverrode ? "Manual override recorded." : "Category default."} Tax evidence remains unverified.</p>
          <div className="flex gap-2"><button disabled={busy || !companyId} className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Save expense</button>
            {editingId ? <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm()); }} className="rounded-xl border border-border px-4 py-2 text-sm">Cancel</button> : null}</div>
        </form>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Operating Expenses</h2>
          <table className="mt-3 w-full text-left text-sm"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Tax claim</th><th>Actions</th></tr></thead>
            <tbody>{expenses.map((e) => <tr key={e.id} className="border-t border-border"><td>{e.expense_date}</td><td>{companyExpenseRule(e.category)?.label}</td><td>{e.description}</td><td>{Number(e.amount).toLocaleString("ru-RU")} ₽</td><td>{e.tax_deductible ? "Claimed / unverified" : "No"}{e.tax_deductible_origin === "USER_OVERRIDE" ? " · override" : ""}</td>
              <td><button type="button" onClick={() => { setEditingId(e.id); setForm({ expenseDate: e.expense_date, category: e.category, description: e.description, amount: String(e.amount), taxDeductible: e.tax_deductible, userOverrode: e.tax_deductible_origin === "USER_OVERRIDE" }); }} className="mr-3 underline">Edit</button>
                <button type="button" disabled={busy} onClick={() => void remove(e.id)} className="underline">Delete</button></td></tr>)}</tbody>
          </table>
        </div>
      </div> : null}
      {tab === "marketplace" ? <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-semibold">Marketplace Expenses · read only</h2>
        <p className="text-sm">Business expense components {rub(overview?.marketplace.totalBusinessKopeks ?? 0)} · Tax deductible {rub(overview?.marketplace.deductibleKopeks ?? 0)} · Review {rub(overview?.marketplace.reviewKopeks ?? 0)}</p>
        <p className="text-xs text-muted-foreground">{overview?.marketplace.warning}</p>
        <ul className="space-y-2 text-sm">{overview?.marketplace.categories.map((row) =>
          <li key={row.category} className="border-t border-border pt-2">{row.category}: business {rub(row.businessKopeks)} · deductible {rub(row.deductibleKopeks)} · review {rub(row.reviewKopeks)}</li>)}</ul>
      </section> : null}
    </div>
  );
}
