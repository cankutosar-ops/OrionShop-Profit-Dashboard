"use client";

type SettingsSelectOption = {
  value: string;
  label: string;
};

type SettingsSelectProps = {
  id: string;
  label: string;
  value: string;
  options: SettingsSelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function SettingsSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: SettingsSelectProps) {
  return (
    <label htmlFor={id} className="text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
