import { test, expect } from "./fixtures";
import { mockSeedAuth } from "./helpers";
import { completedOnboarding } from "./session-fixture";

async function submit(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("회사 이메일", { exact: true }).fill("admin@seed-a.example.test");
  await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
}

for (const [error, message] of [["login_cancelled", "취소"], ["member_not_allowed", "활성 회원"], ["auth_unavailable", "인증 서버"], ["invalid_credentials", "인증을 확인"], ["login_expired", "만료"]]) {
  test(`OIDC 오류 ${error}는 우리 화면에서 안내하고 코드 교환을 하지 않는다`, async ({ page }) => {
    await mockSeedAuth(page);
    let exchanges = 0;
    page.on("request", r => { if (r.url().endsWith("/api/bff/auth/token")) exchanges++; });
    await page.route("**/v1/auth/oidc/authorize?*", route => {
      const p = new URL(route.request().url()).searchParams;
      return route.fulfill({ status: 302, headers: { location: `${p.get("redirect_uri")}?error=${error}&state=${p.get("state")}` } });
    });
    await submit(page);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(message);
    await expect(page).toHaveURL(/\/auth\/callback$/);
    expect(exchanges).toBe(0);
    expect(await page.evaluate(() => sessionStorage.getItem("pulsemetry.oidc.pending.v1"))).toBeNull();
  });
}

test("state 변조와 콜백 재진입을 거부한다", async ({ page }) => {
  await mockSeedAuth(page);
  let exchanges = 0;
  page.on("request", r => { if (r.url().endsWith("/api/bff/auth/token") && r.method() === "POST") exchanges++; });
  await page.route("**/v1/auth/oidc/authorize?*", route => {
    const p = new URL(route.request().url()).searchParams;
    return route.fulfill({ status: 302, headers: { location: `${p.get("redirect_uri")}?code=uac_${"a".repeat(43)}&state=forged` } });
  });
  await submit(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("만료");
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("만료");
  expect(exchanges).toBe(0);
});

test("복수 회사 선택 후 한 번만 교환하고 임시 정보와 URL 코드를 정리한다", async ({ page }) => {
  await mockSeedAuth(page);
  const origin = new URL(test.info().project.use.baseURL!).origin;
  await page.route("**/api/bff/auth/organizations", route => route.request().method() === "OPTIONS" ? route.fallback() : route.fulfill({
    headers: { "access-control-allow-origin": origin }, json: { organizations: [
      { organizationId: "11111111-1111-4111-8111-111111111111", organizationName: "첫 회사" },
      { organizationId: "22222222-2222-4222-8222-222222222222", organizationName: "다른 회사" }] } }));
  let exchanges = 0;
  let loginHint: string | null = null;
  page.on("request", r => {
    if (r.url().endsWith("/api/bff/auth/token") && r.method() === "POST") exchanges++;
    if (r.url().includes("/v1/auth/oidc/authorize?")) loginHint = new URL(r.url()).searchParams.get("login_hint");
  });
  await submit(page);
  await expect(page.getByRole("region", { name: "회사 선택" })).toBeVisible();
  expect(exchanges).toBe(0);
  await page.getByRole("button", { name: "첫 회사", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  expect(exchanges).toBe(1);
  expect(loginHint).toBe("admin@seed-a.example.test");
  expect(await page.evaluate(() => sessionStorage.getItem("pulsemetry.oidc.pending.v1"))).toBeNull();
  await page.goto("/auth/callback?code=uac_" + "a".repeat(43) + "&state=replay");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("만료");
  expect(exchanges).toBe(1);
});

for (const completed of [false, true]) {
  test(`회사 로그인 이동은 login 기록을 유지하고 뒤로가기 시 세션을 재확인한다 (온보딩 완료: ${completed})`, async ({ page }) => {
    await mockSeedAuth(page);
    if (completed) await page.route("**/api/v1/organizations/*/onboarding", route => route.fulfill({ json: completedOnboarding }));
    await page.goto("/contact");
    const authorization = page.waitForRequest(r => r.url().includes("/v1/auth/oidc/authorize?"));
    await submit(page);
    expect(new URL((await authorization).url()).searchParams.get("login_hint")).toBe("admin@seed-a.example.test");
    await expect(page).toHaveURL(completed ? /\/overview(?:\?.*)?$/ : /\/onboarding$/);
    if (completed) await expect(page.locator('nav a[href="/overview"]')).toBeVisible();
    else await expect(page.getByRole("radio", { name: /^수집하지 않음/ })).toBeVisible();
    const visits: string[] = [];
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) visits.push(new URL(frame.url()).pathname); });
    await page.goBack();
    await expect(page).toHaveURL(completed ? /\/overview(?:\?.*)?$/ : /\/onboarding$/);
    expect(visits).toContain("/login");
    await expect(page.getByRole("button", { name: "회사 계정으로 계속", exact: true })).toHaveCount(0);
  });
}
