import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { loadPlaywrightEnv } from "./e2e/config/load-env";

/**
 * Playwright configuration — PH-02 Regression Safety Foundation
 *
 * Level 1 Smoke: all three browsers, retries on CI, HTML report.
 */

loadPlaywrightEnv();

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SESSION_FILE = path.join(__dirname, "e2e/.auth/session.json");

export default defineConfig({
  // ----- Discovery -----
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",

  // ----- Parallelism -----
  fullyParallel: true,
  // Keep concurrency modest: dashboard auto-sync + streaming contend under load.
  workers: process.env.CI ? 2 : 2,

  // ----- Retries -----
  // PH-02.3: suite must be deterministic without retries locally.
  retries: process.env.CI ? 2 : 0,

  // ----- Global timeout (ms) -----
  timeout: 60_000,
  expect: { timeout: 15_000 },

  // ----- Reporting -----
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
  ],

  // ----- Shared settings (no storageState here — applied per browser project) -----
  use: {
    baseURL: BASE_URL,
    // commit-based navigation resolves quickly; do not wait on streaming DCL.
    navigationTimeout: 30_000,
    /** Capture screenshot only on failure */
    screenshot: "only-on-failure",
    /** Save trace on first retry so it is available for debugging */
    trace: "on-first-retry",
    /** Record video on retry as well */
    video: "on-first-retry",
    /** Viewport used for all smoke tests */
    viewport: { width: 1280, height: 800 },
  },

  // ----- Projects (browsers) -----
  projects: [
    // ------ Setup project — runs once, writes e2e/.auth/session.json ------
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    // ------ Level 1 Smoke — Chromium ------
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: SESSION_FILE,
      },
      dependencies: ["setup"],
      testMatch: /(smoke|contracts)\/.+\.spec\.ts/,
    },

    // ------ Level 1 Smoke — Firefox ------
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        storageState: SESSION_FILE,
      },
      dependencies: ["setup"],
      testMatch: /(smoke|contracts)\/.+\.spec\.ts/,
    },

    // ------ Level 1 Smoke — WebKit ------
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        storageState: SESSION_FILE,
      },
      dependencies: ["setup"],
      testMatch: /(smoke|contracts)\/.+\.spec\.ts/,
    },
  ],

  // ----- Dev server (optional; only used when E2E_SKIP_WEBSERVER is unset) -----
  ...(process.env.E2E_SKIP_WEBSERVER
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 120_000,
          env: {
            NEXT_DIST_DIR: ".next-dev",
          },
        },
      }),
});
