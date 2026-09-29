import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: ".e2e-artifacts/backend",
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
    // Real authentication responses contain tokens; keep them out of trace archives.
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3000",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
