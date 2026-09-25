import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page) {
  await page.getByLabel("회사 이메일", { exact: true }).fill("admin@codeworks.io");
  await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
  await page.getByRole("button", { name: "데모 인증 완료", exact: true }).click();
  await expect(page).toHaveURL(/\/(onboarding|overview)$/);
}

export async function saveOnboardingContract(page: Page, name = "Test contract") {
  await page.getByLabel("표시 이름", { exact: true }).fill(name);
  await page.getByLabel("좌석 수", { exact: true }).fill("2");
  await page.getByLabel("월 단가", { exact: true }).fill("0");
  await page.getByRole("button", { name: "계약 등록", exact: true }).click();
  await expect(page.getByRole("region", { name: "등록한 계약" })).toContainText(name);
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
