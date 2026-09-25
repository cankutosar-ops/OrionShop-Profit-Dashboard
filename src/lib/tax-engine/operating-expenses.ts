import type { CompanyExpense } from "@/types/database";

export type OperatingExpenseRecognitionStatus =
  | "RECOGNIZED" | "REVIEW" | "UNVERIFIED" | "EXCLUDED";

export type OperatingExpenseRecognitionLine = {
  expenseId: string;
  date: string;
  category: CompanyExpense["category"];
  amountKopeks: number;
  claimedDeductibleKopeks: number;
  recognizedKopeks: number;
  reviewKopeks: number;
  unverifiedKopeks: number;
  excludedKopeks: number;
  status: OperatingExpenseRecognitionStatus;
  reasons: string[];
};

export type OperatingExpenseRecognitionSummary = {
  totalKopeks: number;
  claimedDeductibleKopeks: number;
  recognizedKopeks: number;
  reviewKopeks: number;
  unverifiedKopeks: number;
  excludedKopeks: number;
  status: "RECOGNIZED" | "REVIEW_REQUIRED" | "UNVERIFIED" | "NO_EXPENSES";
  lines: OperatingExpenseRecognitionLine[];
};

function amountKopeks(row: CompanyExpense): number {
  const amount = Number(row.amount);
  const kopeks = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(kopeks)) {
    throw new Error("Invalid operating expense amount");
  }
  return kopeks;
}

export function summarizeOperatingExpenses(
  rows: readonly CompanyExpense[], companyId: string, from: string, to: string
): OperatingExpenseRecognitionSummary {
  const lines: OperatingExpenseRecognitionLine[] = [];
  for (const row of rows) {
    if (String(row.company_id) !== String(companyId)) {
      throw new Error("Cross-company operating expense fact");
    }
    if (row.deleted_at || row.expense_date < from || row.expense_date > to) continue;
    const amount = amountKopeks(row);
    const reasons: string[] = [];
    let status: OperatingExpenseRecognitionStatus;
    if (!row.tax_deductible || row.evidence_status === "REJECTED") {
      status = "EXCLUDED";
      reasons.push(row.evidence_status === "REJECTED"
        ? "Document evidence was rejected." : "No deductible-expense claim was made.");
    } else {
      const documentVerified = row.evidence_status === "VERIFIED" && Boolean(row.document_reference?.trim());
      const paymentVerified = row.payment_status === "PAID" && Boolean(row.payment_date) &&
        Boolean(row.payment_reference?.trim()) && Math.round(Number(row.paid_amount) * 100) === amount;
      if (documentVerified && paymentVerified) {
        status = "RECOGNIZED";
      } else {
        if (!documentVerified) reasons.push("Verified statutory document evidence is missing.");
        if (!paymentVerified) reasons.push("Full dated payment evidence is missing.");
        const hasSomeEvidence = Boolean(row.document_reference?.trim() || row.payment_reference?.trim() ||
          row.payment_date || row.paid_amount > 0 || row.evidence_status === "VERIFIED");
        status = hasSomeEvidence || row.tax_deductible_origin === "USER_OVERRIDE" ? "REVIEW" : "UNVERIFIED";
      }
    }
    lines.push({
      expenseId: String(row.id), date: row.expense_date, category: row.category,
      amountKopeks: amount,
      claimedDeductibleKopeks: row.tax_deductible ? amount : 0,
      recognizedKopeks: status === "RECOGNIZED" ? amount : 0,
      reviewKopeks: status === "REVIEW" ? amount : 0,
      unverifiedKopeks: status === "UNVERIFIED" ? amount : 0,
      excludedKopeks: status === "EXCLUDED" ? amount : 0,
      status, reasons,
    });
  }
  const sum = (field: keyof Pick<OperatingExpenseRecognitionLine,
    "amountKopeks" | "claimedDeductibleKopeks" | "recognizedKopeks" |
    "reviewKopeks" | "unverifiedKopeks" | "excludedKopeks">) =>
    lines.reduce((total, line) => total + line[field], 0);
  const reviewKopeks = sum("reviewKopeks");
  const unverifiedKopeks = sum("unverifiedKopeks");
  return {
    totalKopeks: sum("amountKopeks"),
    claimedDeductibleKopeks: sum("claimedDeductibleKopeks"),
    recognizedKopeks: sum("recognizedKopeks"),
    reviewKopeks,
    unverifiedKopeks,
    excludedKopeks: sum("excludedKopeks"),
    status: lines.length === 0 ? "NO_EXPENSES"
      : reviewKopeks !== 0 ? "REVIEW_REQUIRED"
        : unverifiedKopeks !== 0 ? "UNVERIFIED" : "RECOGNIZED",
    lines,
  };
}
