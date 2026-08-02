"use client";

import type { SecretHealthItem } from "@/services/administration-security-service";
import { SecurityStatusCard } from "@/components/administration/security-status-card";

type SecretHealthCardProps = {
  items: SecretHealthItem[];
};

export function SecretHealthCard({ items }: SecretHealthCardProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Display only — secret values are never shown. Statuses: Healthy, Warning, Expired, Missing.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <SecurityStatusCard
            key={item.key}
            label={item.label}
            status={item.status}
            detail={item.detail}
          />
        ))}
      </div>
    </div>
  );
}
