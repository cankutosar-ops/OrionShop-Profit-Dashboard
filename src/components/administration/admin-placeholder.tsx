import { AdminSection } from "@/components/administration/admin-section";

type AdminPlaceholderProps = {
  title: string;
  description: string;
  comingInSprint: string;
};

/** Empty-state placeholder for future Administration modules. */
export function AdminPlaceholder({
  title,
  description,
  comingInSprint,
}: AdminPlaceholderProps) {
  return (
    <AdminSection>
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{description}</p>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Coming in Sprint {comingInSprint}
        </p>
      </div>
    </AdminSection>
  );
}
