import { expect, type Page } from "@playwright/test";
import { mockOnboarding } from "./onboarding-fixture";
import { overviewFixture, overviewUrl } from "./overview-fixture";

/** UI fixture 테스트 전용. 실제 Spring 인증 검증은 tests/e2e/seed-login.spec.ts에서 수행한다. */
export async function mockSeedAuth(page: Page) {
  await mockOnboarding(page);
  await page.route("**/api/dev/seed-login", async (route) => {
    const email = route.request().postDataJSON().email;
    if (email !== "admin@seed-a.example.test") return route.fulfill({ status: 400, json: { error: "unknown_account" } });
    await route.fulfill({ json: {
      tokens: { access_token: "ui-fixture-access", refresh_token: "ui-fixture-refresh", token_type: "Bearer", expires_in: 300 },
      user: { memberId: "fixture-admin", organizationId: "11111111-1111-4111-8111-111111111111", organizationName: "코드웍스", email, displayName: "관리자", role: "admin" },
    } });
  });
  const cors = { "access-control-allow-origin": "http://localhost:3000", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST,OPTIONS" };
  await page.route("**/v1/auth/logout", (route) => route.fulfill({ status: 204, headers: cors }));
  await page.route(overviewUrl, (route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors }) : route.fulfill({ json: overviewFixture(route.request().url()), headers: cors }));
}

export async function signIn(page: Page) {
  await mockSeedAuth(page);
  await page.getByLabel("회사 이메일", { exact: true }).fill("admin@seed-a.example.test");
  await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
  await expect(page).toHaveURL(/\/(onboarding|overview)$/);
}

export async function saveOnboardingContract(page: Page, name = "Test contract") {
  await page.getByLabel("제품", { exact: true }).selectOption("copilot");
  await page.getByLabel("플랜", { exact: true }).selectOption("copilot_business");
  await page.getByLabel("표시 이름", { exact: true }).fill(name);
  await page.getByLabel("좌석 수", { exact: true }).fill("2");
  await page.getByLabel("월 단가", { exact: true }).fill("0");
  await page.getByRole("button", { name: "벤더 등록", exact: true }).click();
  await expect(page.getByRole("region", { name: "등록한 벤더" })).toContainText(name);
}

/** 보호된 화면 검증도 실제 데모 UI를 거쳐 진입합니다. 브라우저 저장소나 우회 플래그를 사용하지 않습니다. */
export async function openDashboard(page: Page, route: string) {
  await page.goto("/login");
  await signIn(page);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("radio", { name: /^수집하지 않음/ }).check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await saveOnboardingContract(page);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "건너뛰고 시작", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  if (route !== "/overview") await page.locator(`nav a[href="${route}"]`).click();
}
