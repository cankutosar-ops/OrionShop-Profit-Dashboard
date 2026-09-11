/**
 * Combined Orion Knowledge Object seeds for materialization.
 */

import { FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS } from "@/lib/orion/seed/financial-engine-objects";
import { DASHBOARD_KNOWLEDGE_OBJECTS } from "@/lib/orion/seed/dashboard-objects";
import { REPORTING_KNOWLEDGE_OBJECTS } from "@/lib/orion/seed/reporting-objects";
import { SMART_PRICING_KNOWLEDGE_OBJECTS } from "@/lib/orion/seed/smart-pricing-objects";
import { ADMINISTRATION_KNOWLEDGE_OBJECTS } from "@/lib/orion/seed/administration-objects";
import { WAREHOUSE_KNOWLEDGE_OBJECTS } from "@/lib/orion/seed/warehouse-objects";

export const ORION_BUSINESS_KNOWLEDGE_OBJECTS = [
  ...FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS,
  ...DASHBOARD_KNOWLEDGE_OBJECTS,
  ...REPORTING_KNOWLEDGE_OBJECTS,
  ...SMART_PRICING_KNOWLEDGE_OBJECTS,
  ...ADMINISTRATION_KNOWLEDGE_OBJECTS,
];

export const ORION_ALL_KNOWLEDGE_OBJECTS = [
  ...ORION_BUSINESS_KNOWLEDGE_OBJECTS,
  ...WAREHOUSE_KNOWLEDGE_OBJECTS,
];

export {
  FINANCIAL_ENGINE_KNOWLEDGE_OBJECTS,
  DASHBOARD_KNOWLEDGE_OBJECTS,
  REPORTING_KNOWLEDGE_OBJECTS,
  SMART_PRICING_KNOWLEDGE_OBJECTS,
  ADMINISTRATION_KNOWLEDGE_OBJECTS,
  WAREHOUSE_KNOWLEDGE_OBJECTS,
};
