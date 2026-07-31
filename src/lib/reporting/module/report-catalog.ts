/**
 * Reporting Module catalog.
 * Ready: Profit & Loss, Settlement, Product Profit, Category & Brand Performance.
 */

export type ReportStatus = "ready" | "placeholder";

export type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  href: string;
  status: ReportStatus;
};

export const REPORTING_CATALOG: ReportDefinition[] = [
  {
    id: "profit-loss",
    title: "Profit & Loss",
    description: "Financial Engine P&L — Net Sales through Net Profit and margin.",
    href: "/reports/profit-loss",
    status: "ready",
  },
  {
    id: "settlement",
    title: "Settlement",
    description: "WB settlement money flow — Sales, fees, deductions, Net Transfer.",
    href: "/reports/settlement",
    status: "ready",
  },
  {
    id: "product-profit",
    title: "Product Profit",
    description: "Product-level profitability from the Financial Engine.",
    href: "/reports/product-profit-v2",
    status: "ready",
  },
  {
    id: "category-performance",
    title: "Category Performance",
    description: "Category rollups from Financial Engine product rows.",
    href: "/reports/category-performance",
    status: "ready",
  },
  {
    id: "brand-performance",
    title: "Brand Performance",
    description: "Brand rollups from Financial Engine product rows.",
    href: "/reports/brand-performance",
    status: "ready",
  },
];

export function getReportDefinition(id: string): ReportDefinition | undefined {
  return REPORTING_CATALOG.find((r) => r.id === id);
}
