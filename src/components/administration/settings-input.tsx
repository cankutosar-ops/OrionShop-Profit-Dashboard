"use client";

type SettingsInputProps = {
  id: string;
  label: string;
  value: string | number;
  type?: "text" | "number";
  min?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function SettingsInput({
  id,
  label,
  value,
  type = "text",
  min,
  step,
  disabled,
  onChange,
}: SettingsInputProps) {
  return (
    <label htmlFor={id} className="text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        min={min}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
