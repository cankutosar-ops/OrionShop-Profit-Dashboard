/**
 * e2e/global.setup.ts
 *
 * Establishes authenticated storageState for smoke/contract projects.
 * Sprint 7.1.B: signs in via /api/auth/login (HttpOnly Supabase Auth cookies).
 */

import { test as setup, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { buildUrl } from "./config/e2e-env";

const AUTH_DIR = path.join(__dirname, ".auth");
const SESSION_FILE = path.join(AUTH_DIR, "session.json");

setup("establish authenticated session", async ({ page, context }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  if (process.env.E2E_REUSE_SESSION === "1" && fs.existsSync(SESSION_FILE)) {
    console.log("[setup] Reusing existing session (E2E_REUSE_SESSION=1)");
    return;
  }

  const email = process.env.E2E_USER_EMAIL?.trim();
  const password = process.env.E2E_USER_PASSWORD ?? "";

  if (!email || !password) {
    throw new Error(
      "[setup] E2E_USER_EMAIL and E2E_USER_PASSWORD are required for Sprint 7.1.B auth e2e. Copy .env.e2e.example → .env.e2e.local."
    );
  }

  // Mint containment cookie (document navigation).
  await page.goto(buildUrl("/login"), { waitUntil: "commit", timeout: 30_000 });

  // Sign in via API so HttpOnly auth cookies land in the shared cookie jar.
  const loginRes = await page.request.post(buildUrl("/api/auth/login"), {
    data: { email, password },
    headers: { Accept: "application/json" },
  });
  expect(loginRes.status(), await loginRes.text()).toBe(200);

  const sessionRes = await page.request.get(buildUrl("/api/auth/session"));
  expect(sessionRes.status()).toBe(200);

  await page.goto(buildUrl("/"), { waitUntil: "commit", timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator("main")).toBeAttached({ timeout: 30_000 });

  await context.storageState({ path: SESSION_FILE });
  console.log(`[setup] Authenticated session saved → ${SESSION_FILE}`);
});
