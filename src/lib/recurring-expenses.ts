/** Management accruals only: a monthly budget is not payment or tax evidence. */
export type RecurringExpenseRule = {
  id: string; company_id: string; marketplace_account_id: string;
  category: "ACCOUNTING" | "PAYROLL" | "OTHER"; description: string;
  monthly_amount: number; start_date: string; end_date: string | null;
};
export type RecurringExpenseLine = {
  id: string; ruleId: string; month: string; category: RecurringExpenseRule["category"];
  description: string; monthlyKopeks: number; amountKopeks: number; days: number; monthDays: number;
};
export type RecurringExpenseSummary = {
  lines: RecurringExpenseLine[]; totalKopeks: number; ruleCount: number;
  basis: "DAILY_MONTHLY_ACCRUAL";
};
export function isoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "1900-01-01" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateRecurringExpense(input: Record<string, unknown>) {
  if (!["ACCOUNTING", "PAYROLL", "OTHER"].includes(String(input.category))) throw Error("Invalid fixed expense category");
  const description = String(input.description ?? "").trim();
  if (!description || description.length > 200) throw Error("Description must be 1–200 characters");
  const amount = Number(input.monthlyAmount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.001) throw Error("Invalid monthly RUB amount");
  if (!isoDate(input.startDate) || !input.startDate.endsWith("-01")) throw Error("Start date must be the first day of a month");
  const end = input.endDate || null;
  if (end !== null && (!isoDate(end) || end < input.startDate)) throw Error("Invalid end date");
  return { category: input.category as RecurringExpenseRule["category"], description,
    monthly_amount: Math.round(amount * 100) / 100, start_date: input.startDate, end_date: end as string | null };
}
export function summarizeRecurringExpenses(rules: readonly RecurringExpenseRule[], scope: {
  companyId: string; accountId: string; from: string; to: string;
}): RecurringExpenseSummary {
  if (!isoDate(scope.from) || !isoDate(scope.to) || scope.from > scope.to ||
      Date.parse(scope.to) - Date.parse(scope.from) > 366 * 5 * 86400000) throw Error("Invalid date range (maximum five years)");
  const lines: RecurringExpenseLine[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    if (String(rule.company_id) !== scope.companyId || String(rule.marketplace_account_id) !== scope.accountId) throw Error("Cross-tenant recurring expense");
    if (seen.has(rule.id)) throw Error("Duplicate recurring expense rule");
    seen.add(rule.id);
    const validated = validateRecurringExpense({ category: rule.category, description: rule.description,
      monthlyAmount: rule.monthly_amount, startDate: rule.start_date, endDate: rule.end_date });
    const first = scope.from > validated.start_date ? scope.from : validated.start_date;
    const last = validated.end_date && validated.end_date < scope.to ? validated.end_date : scope.to;
    if (first > last) continue;
    let month = `${first.slice(0, 7)}-01`;
    while (month <= last) {
      const [year, m] = month.split("-").map(Number);
      const monthDays = new Date(Date.UTC(year, m, 0)).getUTCDate();
      const monthEnd = `${month.slice(0, 7)}-${monthDays}`;
      const start = first > month ? first : month;
      const end = last < monthEnd ? last : monthEnd;
      const startDay = Number(start.slice(8)), endDay = Number(end.slice(8));
      const monthlyKopeks = Math.round(validated.monthly_amount * 100);
      // Distribute remainder kopeks across the first days. Splitting a range
      // never loses or duplicates a kopek; a full month equals the exact rule.
      const daily = Math.floor(monthlyKopeks / monthDays), remainder = monthlyKopeks % monthDays;
      const amountKopeks = daily * (endDay - startDay + 1) +
        Math.max(0, Math.min(endDay, remainder) - startDay + 1);
      lines.push({ id: `${rule.id}:${month.slice(0, 7)}`, ruleId: rule.id,
        month: month.slice(0, 7), category: rule.category, description: rule.description,
        monthlyKopeks, amountKopeks, days: endDay - startDay + 1, monthDays });
      if (end >= last) break;
      month = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10);
    }
  }
  const totalKopeks = lines.reduce((sum, line) => sum + line.amountKopeks, 0);
  if (!Number.isSafeInteger(totalKopeks)) throw Error("Fixed expense total exceeds safe RUB precision");
  return { lines, totalKopeks,
    ruleCount: new Set(lines.map(line => line.ruleId)).size, basis: "DAILY_MONTHLY_ACCRUAL" };
}
