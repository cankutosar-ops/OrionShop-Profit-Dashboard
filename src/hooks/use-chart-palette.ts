"use client";

import { useMemo } from "react";
import {
  chartAxisColor,
  chartColor,
  chartGridColor,
  chartSeries,
  CHART_COLOR_FALLBACKS,
} from "@/lib/chart-theme";

export type ChartPalette = {
  color: (index: number) => string;
  series: {
    primary: string;
    secondary: string;
    positive: string;
    warning: string;
    danger: string;
    info: string;
  };
  axis: string;
  grid: string;
};

const SSR_PALETTE: ChartPalette = {
  color: (i: number) =>
    CHART_COLOR_FALLBACKS[
      ((i % CHART_COLOR_FALLBACKS.length) + CHART_COLOR_FALLBACKS.length) %
        CHART_COLOR_FALLBACKS.length
    ],
  series: {
    primary: CHART_COLOR_FALLBACKS[0],
    secondary: CHART_COLOR_FALLBACKS[1],
    positive: CHART_COLOR_FALLBACKS[2],
    warning: CHART_COLOR_FALLBACKS[3],
    danger: CHART_COLOR_FALLBACKS[4],
    info: CHART_COLOR_FALLBACKS[5],
  },
  axis: "#94a3b8",
  grid: "#2a3548",
};

/**
 * Resolve chart token colors on the client.
 * Falls back to Wave 1 token hex values during SSR.
 */
export function useChartPalette(): ChartPalette {
  return useMemo(() => {
    if (typeof document === "undefined") return SSR_PALETTE;
    return {
      color: chartColor,
      series: {
        primary: chartSeries.primary(),
        secondary: chartSeries.secondary(),
        positive: chartSeries.positive(),
        warning: chartSeries.warning(),
        danger: chartSeries.danger(),
        info: chartSeries.info(),
      },
      axis: chartAxisColor(),
      grid: chartGridColor(),
    };
  }, []);
}
