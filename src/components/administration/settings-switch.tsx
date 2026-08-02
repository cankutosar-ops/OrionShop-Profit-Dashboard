"use client";

import { cn } from "@/lib/utils";

type SettingsSwitchProps = {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  compact?: boolean;
  onChange: (next: boolean) => void;
};

export function SettingsSwitch({
  id,
  label,
  description,
  checked,
  disabled,
  compact,
  onChange,
}: SettingsSwitchProps) {
  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary" : "bg-muted",
        disabled && "opacity-50"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-ui",
          checked ? "left-5" : "left-0.5"
        )}
      />
    </button>
  );

  if (compact) return control;

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-2.5 sm:col-span-2">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {control}
    </div>
  );
}
