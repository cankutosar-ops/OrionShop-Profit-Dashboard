import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeRecurringExpenses, validateRecurringExpense, type RecurringExpenseRule } from "@/lib/recurring-expenses";

export async function readRecurringExpenses(scope: { companyId: string; accountId: string; from: string; to: string }) {
  const db = await createServerClient();
  const { data, error } = await db.from("company_recurring_expenses").select("*")
    .eq("company_id", scope.companyId).eq("marketplace_account_id", scope.accountId)
    .lte("start_date", scope.to).or(`end_date.is.null,end_date.gte.${scope.from}`)
    .order("start_date").order("id").limit(1001);
  if (error) throw Error("Fixed expenses unavailable");
  if ((data?.length ?? 0) > 1000) throw Error("Fixed expense rule limit exceeded");
  const rules = (data ?? []) as RecurringExpenseRule[];
  return { rules, ...summarizeRecurringExpenses(rules, scope) };
}

/** Called only after canonical company/account authorization in the route. */
export async function createRecurringExpense(scope: { companyId: string; accountId: string }, actor: string, input: Record<string, unknown>) {
  const value = validateRecurringExpense(input);
  const { data, error } = await createAdminClient().from("company_recurring_expenses")
    .insert({ ...value, company_id: scope.companyId, marketplace_account_id: scope.accountId, created_by: actor })
    .select("*").single();
  if (error || !data) throw Error(error?.code === "23505" || error?.code === "23P01"
    ? "An overlapping fixed expense already exists for this category" : "Fixed expense could not be saved");
  return data;
}
