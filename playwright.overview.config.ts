import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: ["overview.spec.ts", "overview-seats.spec.ts"],
  outputDir: "./test-results/overview-api",
  use: { ...base.use, baseURL: "http://localhost:3107" },
  webServer: {
    command: "npm run build && npm run start -- --port 3107",
    url: "http://localhost:3107/overview",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_PUBLIC_ORGANIZATION_ID: "11111111-1111-4111-8111-111111111111", NEXT_PUBLIC_DASHBOARD_API_URL: "http://localhost:8081" },
  },
});
