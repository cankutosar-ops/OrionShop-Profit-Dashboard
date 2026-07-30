import type { TestInfo } from "@playwright/test";

export type BusinessContractMeta = {
  id: "BC-001" | "BC-002" | "BC-003" | "BC-004" | "BC-005" | "BC-006";
  kbRef: string;
  page: string;
  reason: string;
};

export function contractTitle(meta: BusinessContractMeta): string {
  return `[${meta.id}] [KB:${meta.kbRef}] [Page:${meta.page}] ${meta.reason}`;
}

export function annotateContract(info: TestInfo, meta: BusinessContractMeta): void {
  info.annotations.push(
    { type: "Business Contract ID", description: meta.id },
    { type: "Knowledge Base Reference", description: meta.kbRef },
    { type: "Affected Page", description: meta.page },
    { type: "Reason", description: meta.reason }
  );
}
