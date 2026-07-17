"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatCalendarMonth,
  getAppLanguage,
  getCalendarWeekdayLabels,
} from "@/lib/app-locale";
import { navigateScope } from "@/lib/scope-navigation";
import { SYNC_DATE_PARAM } from "@/lib/marketplace-sync-date";
import { replaceUrlIfChanged } from "@/lib/dashboard-lifecycle";
import { cn, formatDate, buildInclusiveDateRange, getDefaultDateRange } from "@/lib/utils";

type ActiveField = "from" | "to";

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "180 days", days: 180 },
] as const;

function toDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function normalizeRange(from: string, to: string): { from: string; to: string } {
  if (from <= to) return { from, to };
  return { from: to, to: from };
}

type MonthCalendarProps = {
  month: Date;
  from: string;
  to: string;
  activeField: ActiveField;
  onSelect: (date: string) => void;
  onMonthChange: (month: Date) => void;
};

function MonthCalendar({
  month,
  from,
  to,
  activeField,
  onSelect,
  onMonthChange,
}: MonthCalendarProps) {
  const language = getAppLanguage();
  const weekdayLabels = getCalendarWeekdayLabels(language);
  const fromDate = parseISO(from);
  const toDate = parseISO(to);
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonthChange(subMonths(month, 1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-card-hover hover:text-foreground"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">{formatCalendarMonth(month, language)}</span>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-card-hover hover:text-foreground"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {weekdayLabels.map((day) => (
          <span key={day} className="py-1">
            {day}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const value = toDateString(day);
          const inMonth = isSameMonth(day, month);
          const isStart = isSameDay(day, fromDate);
          const isEnd = isSameDay(day, toDate);
          const inRange =
            isWithinInterval(day, { start: fromDate, end: toDate }) && !isStart && !isEnd;

          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelect(value)}
              className={cn(
                "relative h-9 rounded-lg text-sm transition-colors",
                !inMonth && "text-muted-foreground/40",
                inMonth && "hover:bg-card-hover",
                inRange && "bg-primary/15 text-foreground",
                (isStart || isEnd) && "bg-primary font-semibold text-primary-foreground",
                activeField === "from" && isStart && "ring-2 ring-primary/50 ring-offset-1 ring-offset-card",
                activeField === "to" && isEnd && "ring-2 ring-primary/50 ring-offset-1 ring-offset-card"
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaults = getDefaultDateRange();
  const containerRef = useRef<HTMLDivElement>(null);
  const defaultDatesSeededRef = useRef(false);

  const from = searchParams.get("from") ?? defaults.from;
  const to = searchParams.get("to") ?? defaults.to;
  const currentQuery = searchParams.toString();

  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [activeField, setActiveField] = useState<ActiveField>("from");
  const [viewMonth, setViewMonth] = useState(() => parseISO(from));

  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
    setViewMonth(parseISO(from));
    setApplying(false);
  }, [from, to]);

  useEffect(() => {
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    if (fromParam && toParam) {
      defaultDatesSeededRef.current = false;
      return;
    }

    if (defaultDatesSeededRef.current) return;
    defaultDatesSeededRef.current = true;

    replaceUrlIfChanged(router, pathname, currentQuery, (params) => {
      if (!fromParam) params.set("from", defaults.from);
      if (!toParam) params.set("to", defaults.to);
    });
  }, [currentQuery, defaults.from, defaults.to, pathname, router]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function applyRange(nextFrom: string, nextTo: string) {
    const normalized = normalizeRange(nextFrom, nextTo);
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", normalized.from);
    params.set("to", normalized.to);
    params.set(SYNC_DATE_PARAM.manual, "1");
    params.delete(SYNC_DATE_PARAM.adjusted);
    params.delete(SYNC_DATE_PARAM.accountSwitched);
    try {
      sessionStorage.setItem(
        "orionshop.perf.nav",
        JSON.stringify({
          kind: "date_filter",
          startedAt: Date.now(),
          perfStart: performance.now(),
        })
      );
    } catch {
      // ignore
    }
    // Push URL then refresh so Server Components refetch (push alone can leave stale RSC).
    setApplying(true);
    navigateScope(router, `${pathname}?${params.toString()}`, "push");
    setOpen(false);
  }

  function handleDaySelect(value: string) {
    if (activeField === "from") {
      setDraftFrom(value);
      if (isAfter(parseISO(value), parseISO(draftTo))) {
        setDraftTo(value);
      }
      setActiveField("to");
      return;
    }

    setDraftTo(value);
    if (isBefore(parseISO(value), parseISO(draftFrom))) {
      setDraftFrom(value);
    }
  }

  function handlePreset(days: number) {
    const { from: nextFrom, to: nextTo } = buildInclusiveDateRange(days);
    setDraftFrom(nextFrom);
    setDraftTo(nextTo);
    setViewMonth(parseISO(nextFrom));
    applyRange(nextFrom, nextTo);
  }

  return (
    <div ref={containerRef} className="relative z-20">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={applying}
        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-card-hover disabled:opacity-60"
        aria-expanded={open}
        aria-busy={applying}
        aria-haspopup="dialog"
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="whitespace-nowrap">
          {applying ? "Updating…" : `${formatDate(from)} — ${formatDate(to)}`}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Select date range"
          className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,320px)] rounded-2xl border border-border bg-card p-4 shadow-xl"
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePreset(preset.days)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveField("from");
                setViewMonth(parseISO(draftFrom));
              }}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                activeField === "from"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-card-hover"
              )}
            >
              <span className="block text-muted-foreground">Start</span>
              <span className="font-medium">{formatDate(draftFrom)}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveField("to");
                setViewMonth(parseISO(draftTo));
              }}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                activeField === "to"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-card-hover"
              )}
            >
              <span className="block text-muted-foreground">End</span>
              <span className="font-medium">{formatDate(draftTo)}</span>
            </button>
          </div>

          <MonthCalendar
            month={viewMonth}
            from={draftFrom}
            to={draftTo}
            activeField={activeField}
            onSelect={handleDaySelect}
            onMonthChange={setViewMonth}
          />

          <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => {
                setDraftFrom(from);
                setDraftTo(to);
                setOpen(false);
              }}
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium hover:bg-card-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => applyRange(draftFrom, draftTo)}
              className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
