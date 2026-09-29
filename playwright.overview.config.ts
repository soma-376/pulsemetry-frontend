import { defineConfig } from "@playwright/test";
import base from "./playwright.mock.config";

export default defineConfig({
  ...base,
  testMatch: ["overview.spec.ts", "overview-seats.spec.ts"],
  outputDir: "./test-results/overview-api",
});
