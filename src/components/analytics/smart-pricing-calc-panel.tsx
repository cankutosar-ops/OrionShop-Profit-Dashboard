"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  buildSmartPricingCostBreakdown,
  type CostBreakdownRow,
  type SmartPricingCostBreakdown,
} from "@/lib/smart-pricing-calc-breakdown";
import type { SmartPricingComputedRow } from "@/lib/smart-pricing";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type SmartPricingCalcPanelProps = {
  row: SmartPricingComputedRow;
  marketingPercent: number;
  taxPercent: number;
  children: React.ReactNode;
};

const PANEL_WIDTH = 300;

const SECTION_LABEL: Record<NonNullable<CostBreakdownRow["section"]>, string> = {
  marketplace: "Marketplace Fees",
  logistics: "Logistics",
  other: "Costs & Tax",
};

function formatAmountSafe(amount: number): string {
  return Number.isFinite(amount) ? formatCurrency(amount) : "—";
}

function formatPercentSafe(percent: number | null): string {
  return percent !== null && Number.isFinite(percent) ? formatPercent(percent) : "";
}

function CostBreakdownBody({ data }: { data: SmartPricingCostBreakdown }) {
  const blocks: { section?: CostBreakdownRow["section"]; rows: CostBreakdownRow[] }[] =
    [];

  for (const row of data.rows) {
    const prev = blocks[blocks.length - 1];
    if (!prev || prev.section !== row.section) {
      blocks.push({ section: row.section, rows: [row] });
    } else {
      prev.rows.push(row);
    }
  }

  return (
    <div className="min-w-0">
      <p className="mb-2 truncate text-[11px] font-semibold tracking-wide text-foreground">
        {data.title}
      </p>
      <div className="space-y-0">
        {blocks.map((block, blockIndex) => (
          <div key={block.section ?? `block-${blockIndex}`}>
            {block.section ? (
              <p
                className={cn(
                  "mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80",
                  blockIndex > 0 && "mt-2.5 border-t border-border/60 pt-2"
                )}
              >
                {SECTION_LABEL[block.section]}
              </p>
            ) : null}
            {block.rows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[1fr_auto_3.25rem] items-baseline gap-x-3 whitespace-nowrap py-1 text-xs leading-none"
              >
                <span className="truncate text-muted-foreground">{row.label}</span>
                <span className="tabular-nums font-medium text-foreground">
                  {formatAmountSafe(row.amount)}
                </span>
                <span className="text-right tabular-nums text-muted-foreground">
                  {formatPercentSafe(row.percent)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function positionPanel(
  trigger: HTMLElement,
  panel: HTMLElement
): { top: number; left: number } {
  const margin = 8;
  const rect = trigger.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = rect.bottom + margin;
  let left = rect.left;

  if (left + panelRect.width > vw - margin) {
    left = Math.max(margin, vw - panelRect.width - margin);
  }
  if (left < margin) left = margin;

  if (top + panelRect.height > vh - margin) {
    top = rect.top - panelRect.height - margin;
  }
  if (top < margin) top = margin;

  return { top, left };
}

/**
 * Hover (desktop) / tap (mobile) cost breakdown — presentation only.
 */
export function SmartPricingCalcTrigger({
  row,
  marketingPercent,
  taxPercent,
  children,
}: SmartPricingCalcPanelProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const data = buildSmartPricingCostBreakdown(row, marketingPercent, taxPercent);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      if (!pinned) {
        setOpen(false);
        setCoords(null);
      }
    }, 120);
  }, [clearCloseTimer, pinned]);

  const updatePosition = useCallback(() => {
    const trigger = wrapRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const next = positionPanel(trigger, panel);
    setCoords((prev) => {
      if (prev && prev.top === next.top && prev.left === next.left) {
        return prev;
      }
      return next;
    });
  }, []);

  // Position only depends on open + layout geometry — not breakdown content.
  // `data` is a new object every render; listing it here caused an infinite
  // updatePosition → setCoords → render → useLayoutEffect loop.
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => updatePosition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!pinned) return;
    const onDoc = (event: MouseEvent | TouchEvent) => {
      if (
        !wrapRef.current?.contains(event.target as Node) &&
        !panelRef.current?.contains(event.target as Node)
      ) {
        setPinned(false);
        setOpen(false);
        setCoords(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [pinned]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  if (!data || row.purchaseCost === null) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        ref={wrapRef}
        className="relative min-w-0"
        onMouseEnter={() => {
          clearCloseTimer();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          className="max-w-full truncate text-left font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={(event) => {
            event.stopPropagation();
            const next = !pinned;
            setPinned(next);
            setOpen(true);
            if (!next) {
              setOpen(false);
              setCoords(null);
            }
          }}
        >
          {children}
        </button>
      </div>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={`Cost breakdown for ${row.supplierArticle}`}
          className={cn(
            "fixed z-[60] overflow-hidden rounded-xl border border-border bg-card p-3 shadow-lg",
            "origin-top-left transition-[opacity,transform] duration-150 ease-out",
            coords ? "scale-100 opacity-100" : "scale-95 opacity-0"
          )}
          style={{
            width: PANEL_WIDTH,
            top: coords?.top ?? 0,
            left: coords?.left ?? 0,
            pointerEvents: coords ? "auto" : "none",
          }}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        >
          <CostBreakdownBody data={data} />
        </div>
      )}
    </>
  );
}
