import { OrionAssistantPanel } from "@/components/orion/orion-assistant-panel";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = {
  title: "Orion Assistant",
  description: "Verified platform knowledge assistant",
};

export default function OrionPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Orion"
        description="Read-only knowledge plane — Business Rules, Financial Engine, and verified sources."
        showFilters={false}
      />
      <OrionAssistantPanel />
    </div>
  );
}
