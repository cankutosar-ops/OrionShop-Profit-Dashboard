"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AccountSwitchPhase =
  | "idle"
  | "switching"
  | "loading"
  | "finalizing"
  | "success"
  | "timeout";

type SwitchTarget = {
  account: string | null;
  company: string | null;
};

type AccountSwitchContextValue = {
  phase: AccountSwitchPhase;
  isBusy: boolean;
  /** Begin a user-initiated account/company switch; wraps navigation. */
  runAccountSwitch: (target: SwitchTarget, navigate: () => void) => void;
};

const AccountSwitchContext = createContext<AccountSwitchContextValue | null>(null);

const SUCCESS_MS = 1100;
const TIMEOUT_MS = 1600;
const FINALIZING_MIN_MS = 320;
/** Hard cap: unlock selectors; do NOT claim success unless URL matches. */
const MAX_LOCK_MS = 8_000;

export function AccountSwitchProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AccountSwitchPhase>("idle");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const accountId = searchParams.get("account");
  const companyId = searchParams.get("company");

  const switchActiveRef = useRef(false);
  const targetRef = useRef<SwitchTarget | null>(null);
  const pendingStartedAt = useRef<number>(0);
  const refreshOnMatchRef = useRef(false);
  const matchHandledRef = useRef(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (successTimer.current) {
      clearTimeout(successTimer.current);
      successTimer.current = null;
    }
    if (loadingHintTimer.current) {
      clearTimeout(loadingHintTimer.current);
      loadingHintTimer.current = null;
    }
    if (maxLockTimer.current) {
      clearTimeout(maxLockTimer.current);
      maxLockTimer.current = null;
    }
  }, []);

  const finishSuccess = useCallback(() => {
    if (!switchActiveRef.current) return;
    clearTimers();
    setPhase("success");
    switchActiveRef.current = false;
    targetRef.current = null;
    refreshOnMatchRef.current = false;
    matchHandledRef.current = false;
    successTimer.current = setTimeout(() => {
      setPhase("idle");
      successTimer.current = null;
    }, SUCCESS_MS);
  }, [clearTimers]);

  const finishTimeout = useCallback(() => {
    if (!switchActiveRef.current) return;
    clearTimers();
    setPhase("timeout");
    switchActiveRef.current = false;
    targetRef.current = null;
    refreshOnMatchRef.current = false;
    matchHandledRef.current = false;
    successTimer.current = setTimeout(() => {
      setPhase("idle");
      successTimer.current = null;
    }, TIMEOUT_MS);
  }, [clearTimers]);

  const runAccountSwitch = useCallback(
    (target: SwitchTarget, navigate: () => void) => {
      if (switchActiveRef.current) return;

      clearTimers();
      switchActiveRef.current = true;
      targetRef.current = target;
      refreshOnMatchRef.current = false;
      matchHandledRef.current = false;
      pendingStartedAt.current = Date.now();
      setPhase("switching");

      loadingHintTimer.current = setTimeout(() => {
        if (switchActiveRef.current) setPhase("loading");
      }, 180);

      // Unlock UI if stuck — but never claim "Dashboard updated" without URL match.
      maxLockTimer.current = setTimeout(() => {
        if (switchActiveRef.current) finishTimeout();
      }, MAX_LOCK_MS);

      navigate();
    },
    [clearTimers, finishTimeout]
  );

  const targetMatchesParams = useCallback(
    (account: string | null, company: string | null) => {
      const target = targetRef.current;
      if (!target) return false;
      const accountMatches =
        !target.account || String(target.account) === String(account ?? "");
      const companyMatches =
        !target.company || String(target.company) === String(company ?? "");
      return accountMatches && companyMatches;
    },
    []
  );

  const completeOnUrlMatch = useCallback(() => {
    if (!switchActiveRef.current || !targetRef.current) return false;
    if (matchHandledRef.current) return true;
    matchHandledRef.current = true;

    if (!refreshOnMatchRef.current) {
      refreshOnMatchRef.current = true;
      router.refresh();
    }

    setPhase("finalizing");
    const elapsed = Date.now() - pendingStartedAt.current;
    const wait = Math.max(0, FINALIZING_MIN_MS - elapsed);
    successTimer.current = setTimeout(() => {
      finishSuccess();
      successTimer.current = null;
    }, wait);
    return true;
  }, [finishSuccess, router]);

  const isBusy = phase === "switching" || phase === "loading" || phase === "finalizing";

  // Success when useSearchParams reflect the selected account/company.
  useEffect(() => {
    if (!switchActiveRef.current || !targetRef.current) return;
    if (!targetMatchesParams(accountId, companyId)) return;
    completeOnUrlMatch();
  }, [accountId, companyId, pathname, targetMatchesParams, completeOnUrlMatch]);

  // Backup: poll window.location while busy — useSearchParams can lag the
  // committed browser URL after soft-nav (or after hard-assign fallback).
  useEffect(() => {
    if (!isBusy) return;

    const poll = window.setInterval(() => {
      if (!switchActiveRef.current || !targetRef.current) return;
      try {
        const params = new URLSearchParams(window.location.search);
        if (targetMatchesParams(params.get("account"), params.get("company"))) {
          completeOnUrlMatch();
        }
      } catch {
        // ignore
      }
    }, 100);

    return () => clearInterval(poll);
  }, [isBusy, targetMatchesParams, completeOnUrlMatch]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const value = useMemo(
    () => ({ phase, isBusy, runAccountSwitch }),
    [phase, isBusy, runAccountSwitch]
  );

  return (
    <AccountSwitchContext.Provider value={value}>
      {children}
      <AccountSwitchOverlay phase={phase} />
    </AccountSwitchContext.Provider>
  );
}

export function useAccountSwitch(): AccountSwitchContextValue {
  const ctx = useContext(AccountSwitchContext);
  if (!ctx) {
    throw new Error("useAccountSwitch must be used within AccountSwitchProvider");
  }
  return ctx;
}

function AccountSwitchOverlay({ phase }: { phase: AccountSwitchPhase }) {
  if (phase === "idle") return null;

  const isSuccess = phase === "success";
  const isTimeout = phase === "timeout";
  const title = isSuccess
    ? "Dashboard updating…"
    : isTimeout
      ? "Switch may still be loading"
      : phase === "switching"
        ? "Switching account…"
        : phase === "finalizing"
          ? "Finalizing…"
          : "Loading dashboard…";

  const subtitle = isSuccess
    ? "URL updated — refreshing dashboard data"
    : isTimeout
      ? "If KPIs look wrong, try the date filter or refresh the page"
      : "Please wait — company and marketplace selectors are paused";

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-start justify-center pt-[18vh]",
        isSuccess || isTimeout
          ? "pointer-events-none bg-transparent"
          : "bg-background/60 backdrop-blur-[2px]"
      )}
      aria-live="polite"
      aria-busy={!isSuccess && !isTimeout}
    >
      <div
        className={cn(
          "flex min-w-[300px] max-w-[90vw] items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-lg",
          isSuccess && "border-success/35",
          isTimeout && "border-warning/40"
        )}
      >
        {!isSuccess && !isTimeout ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
        ) : isTimeout ? (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning/15 text-xs font-bold text-warning"
            aria-hidden
          >
            !
          </span>
        ) : (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-success" aria-hidden />
        )}
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
