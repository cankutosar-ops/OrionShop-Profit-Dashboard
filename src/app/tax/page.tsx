import { PageHeader } from "@/components/layout/page-header";
import { TaxProfilePanel } from "@/components/tax/tax-profile-panel";

export const dynamic = "force-dynamic";

export default function TaxPage() {
  return <><PageHeader title="Tax Engine" description="Company tax profile and source readiness" showFilters={false} /><TaxProfilePanel /></>;
}
