import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { Suspense } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
};

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <Suspense fallback={<div className="h-10 w-64 animate-pulse rounded-xl bg-card" />}>
        <DateRangePicker />
      </Suspense>
    </div>
  );
}
