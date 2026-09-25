"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { COMPANY_EXPENSE_RULES, companyExpenseRule } from "@/lib/tax-engine/category-rules";
import type { CompanyExpense, CompanyExpenseCategory, CompanyWithAccounts } from "@/types/database";

type Overview = {
  calculation: { readiness: string; estimatedTaxYtdKopeks: number | null };
  taxableRevenueEvidence: { status: string; reasons: string[] } | null;
  operating: { totalKopeks: number; claimedDeductibleKopeks: number; recognizedKopeks: number;
    reviewKopeks: number; unverifiedKopeks: number; excludedKopeks: number; status: string };
  purchases: { count: number; recognition: string; taxDeductibleKopeks: number | null };
  marketplace: {
    totalBusinessKopeks: number; recognizedKopeks: number; excludedKopeks: number;
    reviewKopeks: number; unverifiedKopeks: number; warning: string;
    categories: Array<{ category: string; businessKopeks: number; recognizedKopeks: number;
      reviewKopeks: number; unverifiedKopeks: number; excludedKopeks: number }>;
  };
  warnings: string[];
};

type Form = { expenseDate: string; category: CompanyExpenseCategory; description: string;
  amount: string; taxDeductible: boolean; userOverrode: boolean;
  evidenceStatus: CompanyExpense["evidence_status"]; documentReference: string;
  paymentStatus: CompanyExpense["payment_status"]; paymentDate: string;
  paidAmount: string; paymentReference: string };

function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
const emptyForm = (): Form => ({ expenseDate: today(), category: "ACCOUNTING", description: "", amount: "",
  taxDeductible: companyExpenseRule("ACCOUNTING")!.checkboxDefault, userOverrode: false,
  evidenceStatus: "UNVERIFIED", documentReference: "", paymentStatus: "UNVERIFIED",
  paymentDate: "", paidAmount: "0", paymentReference: "" });
const rub = (kopeks: number) => `${(kopeks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;

const MARKETPLACE_CATEGORY_LABELS: Record<string, string> = {
  ACCEPTANCE: "Acceptance",
  ACQUIRING: "Acquiring",
  ADJUSTMENT: "Adjustments",
  ADVERTISING: "WB advertising",
  COMMISSION: "Commission",
  COMPENSATION: "Compensation",
  LOGISTICS: "Logistics",
  PENALTY: "Penalties",
  PLATFORM_FEE: "Platform fee / WB remuneration",
  RETURN_LOGISTICS: "Return logistics",
  SETTLEMENT: "Settlement (not an expense)",
  STORAGE: "Storage",
};

function downloadFile(contents: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(rows: Array<Record<string, string | number>>, fileName: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers, ...rows.map((row) => headers.map((header) => row[header]))]
    .map((row) => row.map(csvCell).join(";"))
    .join("\n");
  downloadFile(`\uFEFF${csv}`, fileName, "text/csv;charset=utf-8");
}

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
  const operatingExportRows = expenses.map((expense) => ({
    Date: expense.expense_date,
    Source: "Manual / non-WB",
    Category: companyExpenseRule(expense.category)?.label ?? expense.category,
    Description: expense.description,
    "Amount (RUB)": Number(expense.amount),
    "Tax claim": expense.tax_deductible ? "Claimed" : "No",
    "Document status": expense.evidence_status,
    "Payment status": expense.payment_status,
    "Document reference": expense.document_reference ?? "",
    "Payment reference": expense.payment_reference ?? "",
  }));
  const marketplaceExportRows = (overview?.marketplace.categories ?? []).map((row) => ({
    From: from,
    To: to,
    Source: "Wildberries Finance API",
    Category: MARKETPLACE_CATEGORY_LABELS[row.category] ?? row.category,
    "Business amount (RUB)": row.businessKopeks / 100,
    "Tax recognized (RUB)": row.recognizedKopeks / 100,
    "Tax review (RUB)": row.reviewKopeks / 100,
    "Unverified (RUB)": row.unverifiedKopeks / 100,
    "Excluded (RUB)": row.excludedKopeks / 100,
  }));

  async function downloadWorkbook() {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(operatingExportRows), "Manual expenses");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(marketplaceExportRows), "WB expenses");
    XLSX.writeFile(workbook, `expenses-${from}-${to}.xlsx`);
  }

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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Expense export</p>
          <p className="text-xs text-muted-foreground">Current company and date range · WB and manual expenses remain separate.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => downloadCsv(operatingExportRows, `manual-expenses-${from}-${to}.csv`)} disabled={!operatingExportRows.length} className="rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50">Manual CSV</button>
          <button type="button" onClick={() => downloadCsv(marketplaceExportRows, `wb-expenses-${from}-${to}.csv`)} disabled={!marketplaceExportRows.length} className="rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50">WB CSV</button>
          <button type="button" onClick={() => void downloadWorkbook()} disabled={!operatingExportRows.length && !marketplaceExportRows.length} className="rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Excel workbook</button>
        </div>
      </div>
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
        <p className="text-sm">{overview?.purchases.count ?? 0} purchase headers in this period. Tax recognition: <strong>{overview?.purchases.recognition ?? "UNVERIFIED"}</strong>. Recognized {rub(overview?.purchases.taxDeductibleKopeks ?? 0)}.</p>
        {company?.accounts.length ? <ul className="space-y-1">{company.accounts.map((account) =>
          <li key={account.id}><Link href={`/purchases?company=${companyId}&account=${account.id}`} className="text-sm text-primary underline">Open Purchases for {account.account_name}</Link></li>)}</ul>
          : <p className="text-sm text-muted-foreground">Connect a marketplace account to enter purchases.</p>}
      </section> : null}
      {tab === "operating" ? <div className="space-y-5">
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">Manual entry is only for expenses paid outside Wildberries.</p>
          <p className="mt-1 text-xs text-muted-foreground">WB commission, acquiring, logistics, storage, acceptance, penalties and WB advertising are imported automatically and cannot be entered here.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          Total {rub(overview?.operating.totalKopeks ?? 0)} · Claimed {rub(overview?.operating.claimedDeductibleKopeks ?? 0)} · Recognized {rub(overview?.operating.recognizedKopeks ?? 0)} · Review {rub(overview?.operating.reviewKopeks ?? 0)} · Unverified {rub(overview?.operating.unverifiedKopeks ?? 0)}
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">Document status<select value={form.evidenceStatus} onChange={(e) => setForm({ ...form, evidenceStatus: e.target.value as Form["evidenceStatus"] })} className="block w-full rounded-xl border border-border bg-background px-3 py-2">
              <option value="UNVERIFIED">Unverified</option><option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option>
            </select></label>
            <label className="text-sm">Document reference<input maxLength={200} value={form.documentReference} onChange={(e) => setForm({ ...form, documentReference: e.target.value })} className="block w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
            <label className="text-sm">Payment status<select value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value as Form["paymentStatus"] })} className="block w-full rounded-xl border border-border bg-background px-3 py-2">
              <option value="UNVERIFIED">Unverified</option><option value="UNPAID">Unpaid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="PAID">Paid</option>
            </select></label>
            {form.paymentStatus === "PARTIALLY_PAID" || form.paymentStatus === "PAID" ? <>
              <label className="text-sm">Payment date<input required type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} className="block w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
              <label className="text-sm">Paid amount (RUB)<input required type="number" min="0.01" step="0.01" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: e.target.value })} className="block w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
              <label className="text-sm">Payment reference<input required maxLength={200} value={form.paymentReference} onChange={(e) => setForm({ ...form, paymentReference: e.target.value })} className="block w-full rounded-xl border border-border bg-background px-3 py-2" /></label>
            </> : null}
          </div>
          <p className="text-xs text-muted-foreground">{companyExpenseRule(form.category)?.help} {form.userOverrode ? "Manual override recorded." : "Category default."} Recognition requires verified document evidence and full dated payment evidence.</p>
          <div className="flex gap-2"><button disabled={busy || !companyId} className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Save expense</button>
            {editingId ? <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm()); }} className="rounded-xl border border-border px-4 py-2 text-sm">Cancel</button> : null}</div>
        </form>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Operating Expenses</h2>
          <table className="mt-3 w-full text-left text-sm"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Tax claim</th><th>Evidence</th><th>Actions</th></tr></thead>
            <tbody>{expenses.map((e) => <tr key={e.id} className="border-t border-border"><td>{e.expense_date}</td><td>{companyExpenseRule(e.category)?.label}</td><td>{e.description}</td><td>{Number(e.amount).toLocaleString("ru-RU")} ₽</td><td>{e.tax_deductible ? "Claimed" : "No"}{e.tax_deductible_origin === "USER_OVERRIDE" ? " · override" : ""}</td><td>{e.evidence_status.replaceAll("_", " ")} · {e.payment_status.replaceAll("_", " ")}</td>
              <td><button type="button" onClick={() => { setEditingId(e.id); setForm({ expenseDate: e.expense_date, category: e.category, description: e.description, amount: String(e.amount), taxDeductible: e.tax_deductible, userOverrode: e.tax_deductible_origin === "USER_OVERRIDE", evidenceStatus: e.evidence_status, documentReference: e.document_reference ?? "", paymentStatus: e.payment_status, paymentDate: e.payment_date ?? "", paidAmount: String(e.paid_amount), paymentReference: e.payment_reference ?? "" }); }} className="mr-3 underline">Edit</button>
                <button type="button" disabled={busy} onClick={() => void remove(e.id)} className="underline">Delete</button></td></tr>)}</tbody>
          </table>
        </div>
      </div> : null}
      {tab === "marketplace" ? <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card p-5">
          <div>
            <h2 className="font-semibold">Wildberries expenses</h2>
            <p className="mt-1 text-sm text-muted-foreground">Automatically imported from WB Finance · read only</p>
          </div>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600 dark:text-emerald-400">Automatic source</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["WB business expenses", overview?.marketplace.totalBusinessKopeks ?? 0],
            ["Tax recognized", overview?.marketplace.recognizedKopeks ?? 0],
            ["Needs review", overview?.marketplace.reviewKopeks ?? 0],
            ["Excluded / settlement", overview?.marketplace.excludedKopeks ?? 0],
          ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">{rub(Number(value))}</p>
          </div>)}
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card p-5">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead><tr className="text-muted-foreground"><th className="pb-3">WB expense</th><th className="pb-3 text-right">Business amount</th><th className="pb-3 text-right">Recognized</th><th className="pb-3 text-right">Review</th><th className="pb-3 text-right">Unverified</th><th className="pb-3 text-right">Excluded</th><th className="pb-3 pl-5">Source</th></tr></thead>
            <tbody>{overview?.marketplace.categories.map((row) => <tr key={row.category} className="border-t border-border">
              <td className="py-3 font-medium">{MARKETPLACE_CATEGORY_LABELS[row.category] ?? row.category}</td>
              <td className="py-3 text-right tabular-nums">{rub(row.businessKopeks)}</td>
              <td className="py-3 text-right tabular-nums">{rub(row.recognizedKopeks)}</td>
              <td className="py-3 text-right tabular-nums">{rub(row.reviewKopeks)}</td>
              <td className="py-3 text-right tabular-nums">{rub(row.unverifiedKopeks)}</td>
              <td className="py-3 text-right tabular-nums">{rub(row.excludedKopeks)}</td>
              <td className="py-3 pl-5 text-muted-foreground">WB Finance API</td>
            </tr>)}</tbody>
          </table>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">Tax recognition remains conservative until supporting evidence is verified. Settlement is displayed for reconciliation and is not treated as an expense.</p>
        </div>
      </section> : null}
    </div>
  );
}
