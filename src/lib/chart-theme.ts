/**
 * Shared chart theme — Wave 3 Visualization System.
 * Colors resolve from Wave 1 design tokens (--color-chart-*).
 */

export const CHART_TOKEN_KEYS = [
  "--color-chart-1",
  "--color-chart-2",
  "--color-chart-3",
  "--color-chart-4",
  "--color-chart-5",
  "--color-chart-6",
] as const;

/** Fallbacks mirror `globals.css` @theme chart tokens. */
export const CHART_COLOR_FALLBACKS = [
  "#4f46e5",
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#e11d48",
  "#38bdf8",
] as const;

const AXIS_FALLBACK = "#94a3b8";
const GRID_FALLBACK = "#2a3548";

function readCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Chart series color by index (0–5, wraps). */
export function chartColor(index: number): string {
  const i = ((index % CHART_TOKEN_KEYS.length) + CHART_TOKEN_KEYS.length) % CHART_TOKEN_KEYS.length;
  return readCssVar(CHART_TOKEN_KEYS[i], CHART_COLOR_FALLBACKS[i]);
}

/** Named series shortcuts mapped to chart tokens. */
export const chartSeries = {
  primary: () => chartColor(0),
  secondary: () => chartColor(1),
  positive: () => chartColor(2),
  warning: () => chartColor(3),
  danger: () => chartColor(4),
  info: () => chartColor(5),
} as const;

export function chartAxisColor(): string {
  return readCssVar("--color-muted-foreground", AXIS_FALLBACK);
}

export function chartGridColor(): string {
  return readCssVar("--color-border", GRID_FALLBACK);
}

/** Soft area fill — low opacity, no heavy gradients. */
export function chartAreaFill(index: number, opacity = 0.18): string {
  const hex = chartColor(index);
  return hexToRgba(hex, opacity);
}

function hexToRgba(hex: string, opacity: number): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) {
    return `color-mix(in oklab, ${hex} ${Math.round(opacity * 100)}%, transparent)`;
  }
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Shared cartesian margins — consistent across charts. */
export const CHART_MARGIN = {
  default: { top: 8, right: 12, left: 0, bottom: 4 },
  withAngledLabels: { top: 8, right: 12, left: 0, bottom: 56 },
} as const;

export const CHART_ANIMATION_MS = 400;

export const CHART_AXIS = {
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

export const CHART_GRID = {
  strokeDasharray: "3 3",
  vertical: false,
} as const;

export const CHART_BAR_RADIUS: [number, number, number, number] = [6, 6, 0, 0];
export const CHART_STROKE_WIDTH = 1.75;
