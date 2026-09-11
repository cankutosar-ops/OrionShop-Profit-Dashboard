import { OrionAssistantPanel } from "@/components/orion/orion-assistant-panel";

export const metadata = {
  title: "Orion Assistant",
  description: "Verified platform knowledge assistant",
};

export default function OrionPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Orion</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only knowledge plane — Business Rules, Financial Engine, and verified sources.
        </p>
      </div>
      <OrionAssistantPanel />
    </div>
  );
}
