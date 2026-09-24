import { PageHeader } from "@/components/layout/page-header";
import { ExpensesWorkspace } from "@/components/tax/expenses-workspace";

export const dynamic = "force-dynamic";

export default function ExpensesPage() {
  return <><PageHeader title="Expenses / Giderler" description="Purchases, operating expenses and WB marketplace costs" showFilters={false} /><ExpensesWorkspace /></>;
}
