import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// 데몬 → 서버 → 화면 실경로 검증. telemetryctl 데몬 코드가 설치를 등록·전달·업데이트 확인하는 동안 단계마다 화면을 확인한다(백엔드 명세 §10.2).
// 기본 실서버 E2E(tests/e2e)와 따로 돈다 — 데몬 없이 돌리면 선행 조건 실패다.
export default defineConfig({
  ...base,
  testDir: "./tests/e2e-daemon",
  timeout: 15 * 60_000,
  outputDir: ".e2e-artifacts/daemon",
});
