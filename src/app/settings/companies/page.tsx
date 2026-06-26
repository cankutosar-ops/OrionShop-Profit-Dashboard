import { PageHeader } from "@/components/layout/page-header";
import { CompaniesManager } from "@/components/settings/companies-manager";

export const dynamic = "force-dynamic";

export default function SettingsCompaniesPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage companies and marketplace accounts — each account syncs independently"
        showFilters={false}
      />

      <CompaniesManager />
    </>
  );
}
