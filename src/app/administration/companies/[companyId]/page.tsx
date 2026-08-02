import { CompanyWorkspacePanel } from "@/components/administration/company-workspace-panel";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ companyId: string }>;
};

export default async function AdministrationCompanyWorkspacePage({ params }: PageProps) {
  const { companyId } = await params;
  return <CompanyWorkspacePanel companyId={companyId} />;
}
