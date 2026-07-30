/**
 * Sprint 7.1.D — Request DB context.
 * Internal/service jobs opt into service_role (bypasses RLS).
 * User requests use JWT so Postgres RLS enforces tenancy.
 */

import { AsyncLocalStorage } from "async_hooks";

export type RequestDbContext =
  | { kind: "service"; reason: string }
  | { kind: "user"; accessToken: string };

const storage = new AsyncLocalStorage<RequestDbContext>();

export function getRequestDbContext(): RequestDbContext | undefined {
  return storage.getStore();
}

/** Bind service_role for the remainder of the async chain (sync jobs / internal Bearer). */
export function enterServiceDbContext(reason: string): void {
  storage.enterWith({ kind: "service", reason });
}

/** Bind end-user JWT for RLS-enforced queries. */
export function enterUserDbContext(accessToken: string): void {
  storage.enterWith({ kind: "user", accessToken });
}

export function runWithServiceDbContext<T>(reason: string, fn: () => T): T {
  return storage.run({ kind: "service", reason }, fn);
}

export async function runWithServiceDbContextAsync<T>(
  reason: string,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run({ kind: "service", reason }, fn);
}
