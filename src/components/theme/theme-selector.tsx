"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { THEME_OPTIONS, type ThemePreference } from "@/lib/theme";

const OPTION_META: Record<
  ThemePreference,
  { label: string; icon: typeof Sun }
> = {
  light: { label: "Light", icon: Sun },
  dark: { label: "Dark", icon: Moon },
  system: { label: "System", icon: Monitor },
};

type ThemeSelectorProps = {
  className?: string;
  /** Compact segmented control for Administration header. */
  size?: "sm" | "md";
};

/**
 * Theme switch — Administration is the first module to expose it.
 * Applies globally via ThemeProvider (shared design tokens).
 */
export function ThemeSelector({ className, size = "sm" }: ThemeSelectorProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const active = (mounted ? theme : "system") as ThemePreference;

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center rounded-[var(--radius-control)] border border-border bg-card p-0.5",
        className
      )}
    >
      {THEME_OPTIONS.map((option) => {
        const meta = OPTION_META[option];
        const Icon = meta.icon;
        const selected = active === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            aria-label={`${meta.label} theme${
              option === "system" && mounted && resolvedTheme
                ? ` (${resolvedTheme})`
                : ""
            }`}
            title={
              option === "system" && mounted && resolvedTheme
                ? `System (${resolvedTheme})`
                : meta.label
            }
            onClick={() => setTheme(option)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] font-medium transition-ui",
              size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs",
              selected
                ? "bg-primary/12 text-primary"
                : "text-muted-foreground hover:bg-card-hover hover:text-foreground"
            )}
          >
            <Icon className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} aria-hidden />
            <span className="hidden sm:inline">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
