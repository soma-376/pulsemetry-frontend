import { expect, type Page } from "@playwright/test";
import { dashboardBase, enrollmentBase } from "./fixtures";
import { oidcOrigin, oidcPassword } from "./oidc-environment";

export async function expectIdentityProvider(page: Page) {
  const origin = oidcOrigin();
  await expect(page).toHaveURL(url => url.origin === origin);
}

export async function submitIdentityProvider(page: Page, email: string, wrongPassword = false) {
  // 주소 검증 이후에만 자격 증명을 입력한다. IdP 테마가 다르면 테스트 선택자를 명시한다.
  await expectIdentityProvider(page);
  await page.locator(process.env.E2E_OIDC_USERNAME_SELECTOR ?? 'input[name="username"]:visible').fill(email);
  await page.locator(process.env.E2E_OIDC_PASSWORD_SELECTOR ?? 'input[name="password"]:visible')
    .fill(wrongPassword ? "intentionally-wrong-for-test" : oidcPassword(email));
  await page.locator(process.env.E2E_OIDC_SUBMIT_SELECTOR ?? 'button[type="submit"]:visible').click();
}

export async function signIn(page: Page, email: string) {
  let exchanges = 0;
  const exchanged = (request: import("@playwright/test").Request) => {
    if (request.url().endsWith("/api/bff/auth/token") && request.method() === "POST") exchanges++;
  };
  page.on("request", exchanged);
  await page.goto("/login");
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("조직 ID", { exact: true })).toHaveCount(0);
  await page.getByLabel("회사 이메일", { exact: true }).fill(email);
  await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
  await submitIdentityProvider(page, email);
  await expect(page).toHaveURL(/\/(onboarding|overview)$/);
  expect(exchanges, "StrictMode를 포함하여 코드 교환은 한 번만 실행").toBe(1);
  page.off("request", exchanged);
}

export async function signOut(page: Page) {
  const response = page.waitForResponse(response => response.url().endsWith("/api/bff/auth/logout") && response.request().method() === "POST");
  await page.getByRole("link", { name: "로그아웃", exact: true }).click();
  expect((await response).status()).toBe(204);
  await expect(page).toHaveURL(/\/login$/);
}

/** 브라우저의 실제 세션으로 API 결과를 보조 검증한다. 토큰은 Node/로그로 반환하지 않는다. */
export function authenticatedRequest(page: Page, origin: string, path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  const service = new URL(origin).origin === new URL(dashboardBase()).origin ? "dashboard"
    : new URL(origin).origin === new URL(enrollmentBase()).origin ? "enrollment" : null;
  if (!service) throw new Error("알 수 없는 테스트 API origin");
  return page.evaluate(async ({ service, path, method, body, headers }) => {
    const response = await fetch(`/api/bff/${service}${path}`, { method, credentials: "same-origin", headers: { "X-Pulsemetry-Request": "1", ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }, { service, path, method, body, headers });
}

export async function selectPeriod(page: Page, start: string, end: string) {
  await page.getByRole("button", { name: /^\d{4}\.\d{2}\.\d{2} ~ / }).click();
  const picker = page.getByRole("dialog", { name: "기간 선택" });
  for (const day of [start, end]) {
    // 달력의 실제 버튼을 찾아 월을 이동한다. 시계를 바꾸거나 URL에 기간을 주입하지 않는다.
    const targetMonth = Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7));
    for (let step = 0; step < 120; step++) {
      const button = picker.getByTitle(day, { exact: true });
      if (await button.count()) { await button.click(); break; }
      const text = await picker.getByText(/^\d{4}년 \d{1,2}월$/).innerText();
      const [year, month] = text.match(/\d+/g)!.map(Number);
      await picker.getByRole("button", { name: year * 12 + month > targetMonth ? "이전 달" : "다음 달", exact: true }).click();
      if (step === 119) throw new Error("시드 기준일이 달력 탐색 범위를 벗어났습니다. E2E_SEED_DATE를 확인하세요.");
    }
  }
  await picker.getByRole("button", { name: "적용", exact: true }).click();
}
