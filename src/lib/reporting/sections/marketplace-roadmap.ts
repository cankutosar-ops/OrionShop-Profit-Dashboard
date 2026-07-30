/**
 * Future Marketplace Intelligence modules — Coming Soon cards only.
 */
import type { ReportSection } from "@/lib/reporting/types";

export type MarketplaceRoadmapModule = {
  id: string;
  title: string;
  description: string;
  status: "coming-soon";
};

export type MarketplaceRoadmapData = {
  modules: MarketplaceRoadmapModule[];
};

export function buildMarketplaceRoadmapSection(): ReportSection<MarketplaceRoadmapData> {
  return {
    id: "marketplace-roadmap",
    kind: "marketplace-roadmap",
    title: "Coming Soon",
    description: "Future Marketplace Intelligence capabilities — no placeholder metrics",
    data: {
      modules: [
        {
          id: "competitive",
          title: "Competitive Intelligence",
          description:
            "Compare assortment and pricing posture against marketplace peers when external signals are available.",
          status: "coming-soon",
        },
        {
          id: "customer",
          title: "Customer Intelligence",
          description:
            "Repeat-purchase and cohort signals once customer-level marketplace data is integrated.",
          status: "coming-soon",
        },
        {
          id: "pricing",
          title: "Pricing Intelligence",
          description:
            "Price elasticity and fee-aware pricing recommendations beyond Smart Pricing.",
          status: "coming-soon",
        },
        {
          id: "demand-forecasting",
          title: "Demand Forecasting",
          description:
            "Forward-looking demand models — not included in this foundation sprint.",
          status: "coming-soon",
        },
        {
          id: "review",
          title: "Review Intelligence",
          description:
            "Review volume and sentiment impact on conversion when review APIs are connected.",
          status: "coming-soon",
        },
      ],
    },
  };
}
