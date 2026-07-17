"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  PROFIT_MODEL_PARAM,
  type ProfitModel,
} from "@/lib/profit-model";

type ProfitModelContextValue = {
  model: ProfitModel;
  setModel: (model: ProfitModel) => void;
};

const ProfitModelContext = createContext<ProfitModelContextValue | null>(null);

export function ProfitModelProvider({
  initialModel,
  children,
}: {
  initialModel: ProfitModel;
  children: ReactNode;
}) {
  const [model, setModelState] = useState<ProfitModel>(initialModel);

  const setModel = useCallback((next: ProfitModel) => {
    setModelState(next);

    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (next === "b") {
      url.searchParams.delete(PROFIT_MODEL_PARAM);
    } else {
      url.searchParams.set(PROFIT_MODEL_PARAM, next);
    }
    const nextHref = `${url.pathname}${url.search}`;
    window.history.replaceState(null, "", nextHref);
  }, []);

  const value = useMemo(() => ({ model, setModel }), [model, setModel]);

  return <ProfitModelContext.Provider value={value}>{children}</ProfitModelContext.Provider>;
}

export function useProfitModel(): ProfitModelContextValue {
  const context = useContext(ProfitModelContext);
  if (!context) {
    throw new Error("useProfitModel must be used within ProfitModelProvider");
  }
  return context;
}

/** Returns null outside ProfitModelProvider (e.g. legacy dashboard). */
export function useProfitModelOptional(): ProfitModel | null {
  return useContext(ProfitModelContext)?.model ?? null;
}
