import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  // Avoid saturating the local server with one worker per CPU core.
  workers: 2,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3107",
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    // Build with fixture configuration instead of reusing the real API dev server.
    command: "npm run build && npm run start -- --port 3107",
    url: "http://localhost:3107/login",
    reuseExistingServer: false,
    timeout: 120000,
    env: { BFF_ORIGIN: "http://localhost:3107", BFF_SESSION_KEYS: "abababababababababababababababababababababababababababababababab", DASHBOARD_API_URL: "http://localhost:3110", NEXT_PUBLIC_ENROLLMENT_API_URL: "http://localhost:3110", ENROLLMENT_API_URL: "http://localhost:3110" },
  },
});
