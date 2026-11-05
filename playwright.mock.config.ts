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
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    // Build with fixture configuration instead of reusing the real API dev server.
    command: "npm run build && npm run start",
    url: "http://localhost:3107/login",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      PORT: "3107",
      NEXT_PUBLIC_AUTO_TREND_ENABLED: "false",
      // 유효 세션 API는 Playwright가 모킹한다. 무쿠키 거부 경로는 연결 없이 검사한다.
      BFF_SESSION_ENV: "dev",
      BFF_VALKEY_HOST: "fixture.serverless.apn2.cache.amazonaws.com",
      BFF_VALKEY_CACHE_NAME: "pulsemetry-frontend-shared",
      BFF_VALKEY_USERNAME: "pulsemetry-bff-dev",
      BFF_ORIGIN: "http://localhost:3107",
      BFF_SESSION_KEYS:
        "abababababababababababababababababababababababababababababababab",
      DASHBOARD_API_URL: "http://localhost:3110",
      NEXT_PUBLIC_ENROLLMENT_API_URL: "http://localhost:3110",
      ENROLLMENT_API_URL: "http://localhost:3110",
    },
  },
});
