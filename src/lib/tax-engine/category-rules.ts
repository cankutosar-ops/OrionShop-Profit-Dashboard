import type { CompanyExpenseCategory } from "@/types/database";

export type CategoryRule = {
  category: CompanyExpenseCategory;
  label: string;
  defaultDecision: "YES" | "NO" | "REVIEW";
  checkboxDefault: boolean;
  allowUserOverride: true;
  help: string;
};

/** Business-intent defaults. A checked box is not proof of paid/documented tax eligibility. */
export const COMPANY_EXPENSE_RULES: readonly CategoryRule[] = [
  { category: "ACCOUNTING", label: "Accounting", defaultDecision: "REVIEW", checkboxDefault: true, allowUserOverride: true, help: "Business service; payment and documents require review." },
  { category: "RENT", label: "Rent", defaultDecision: "REVIEW", checkboxDefault: true, allowUserOverride: true, help: "Business premises, payment and contract require review." },
  { category: "SOFTWARE", label: "Software / SaaS", defaultDecision: "REVIEW", checkboxDefault: true, allowUserOverride: true, help: "Business use, payment and documents require review." },
  { category: "ADVERTISING", label: "Advertising", defaultDecision: "REVIEW", checkboxDefault: true, allowUserOverride: true, help: "Do not duplicate WB advertising charges." },
  { category: "LOGISTICS", label: "Logistics", defaultDecision: "REVIEW", checkboxDefault: true, allowUserOverride: true, help: "Business service and payment require review." },
  { category: "BANKING", label: "Banking / payment services", defaultDecision: "REVIEW", checkboxDefault: true, allowUserOverride: true, help: "Fee statement and payment require review." },
  { category: "PAYROLL", label: "Payroll / salary", defaultDecision: "REVIEW", checkboxDefault: false, allowUserOverride: true, help: "Payroll and contribution rules require separate evidence." },
  { category: "OFFICE", label: "Office", defaultDecision: "REVIEW", checkboxDefault: false, allowUserOverride: true, help: "Business purpose and asset classification require review." },
  { category: "PROFESSIONAL_SERVICES", label: "Professional services", defaultDecision: "REVIEW", checkboxDefault: true, allowUserOverride: true, help: "Contract, payment and business purpose require review." },
  { category: "TAXES_FEES", label: "Taxes / fees", defaultDecision: "REVIEW", checkboxDefault: false, allowUserOverride: true, help: "Different taxes and fees have different treatment." },
  { category: "FINES_PENALTIES", label: "Fines / penalties", defaultDecision: "NO", checkboxDefault: false, allowUserOverride: true, help: "Public fines are not deductible; contractual items need review." },
  { category: "PERSONAL_GROCERIES", label: "Groceries / personal", defaultDecision: "NO", checkboxDefault: false, allowUserOverride: true, help: "Personal purchases are not business expenses." },
  { category: "OTHER", label: "Other", defaultDecision: "REVIEW", checkboxDefault: false, allowUserOverride: true, help: "Tax treatment requires individual review." },
] as const;

export function companyExpenseRule(value: unknown): CategoryRule | null {
  return COMPANY_EXPENSE_RULES.find((rule) => rule.category === value) ?? null;
}
