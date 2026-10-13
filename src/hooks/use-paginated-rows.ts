"use client";
import { useState } from "react";
import { tablePage } from "@/lib/ui/table-page";

export function usePaginatedRows<T>(rows: readonly T[], resetKey: string) {
  const [selection, setSelection] = useState({ key: resetKey, page: 1 });
  const pagination = tablePage(rows, selection.key === resetKey ? selection.page : 1);
  return { ...pagination, onPage: (page: number) => setSelection({ key: resetKey, page }) };
}
