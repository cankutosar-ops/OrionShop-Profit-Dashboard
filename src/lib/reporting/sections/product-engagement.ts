/**
 * Product Engagement Intelligence — placeholder until Sales Funnel sync exists.
 */
import type { ReportSection } from "@/lib/reporting/types";

export type ProductEngagementData = {
  status: "coming-soon";
  favoritesAvailable: false;
  cartAvailable: false;
  message: string;
  explanation: string;
};

export function buildProductEngagementSection(): ReportSection<ProductEngagementData> {
  return {
    id: "product-engagement",
    kind: "product-engagement",
    title: "Product Engagement Intelligence",
    description:
      "Favorites and Cart conversion signals — not available without Sales Funnel",
    data: {
      status: "coming-soon",
      favoritesAvailable: false,
      cartAvailable: false,
      message: "Coming Soon",
      explanation:
        "Requires Wildberries Sales Funnel Analytics integration. Favorites and Cart are not invented from existing sales data.",
    },
  };
}
