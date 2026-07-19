import { defineConfig, devices } from "@playwright/test";

// A tiny visual/layout suite that renders the REAL production renderer in a
// real browser — the one thing jsdom cannot do. It guards layout regressions
// (bounded switcher list, visible search focus ring) that the CSS-contract
// unit tests can only assert statically. It is intentionally separate from the
// vitest suite: `testDir: "e2e"` here, and vitest only scans `tests/`.
const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Build the renderer and serve the static output exactly as it ships, so the
  // test exercises the production CSS (dev-only CSP stripped, real bundle).
  webServer: {
    command: `pnpm build:renderer && pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
