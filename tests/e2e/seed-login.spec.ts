import { expect, test, seedOrganizations as organizations } from "./fixtures";
import { signIn } from "./helpers";
import { oidcOrigin } from "./oidc-environment";

for (const organization of organizations) {
  test(`SEED-AUTH-${organization.seed.toUpperCase()} @p0 @read OIDC 인증 후 조직별 개요 조회·새로고침·로그아웃`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await signIn(page, `owner@seed-${organization.seed}.example.test`);
    const overview = page.waitForResponse((response) => response.url().includes(`/organizations/${organization.id}/analytics/overview?`) && response.request().method() === "GET");
    await page.goto("/overview");
    const response = await overview;
    expect(response.status()).toBe(200);
    expect(response.request().headers().authorization).toBeUndefined();
    const body = await response.json();
    expect(body.meta.organizationId).toBe(organization.id);
    await expect(page.getByRole("navigation")).toContainText(organization.name);
    if (organization.seed === "b") {
      expect(body.meta.dataState).toBe("never_observed");
      await expect(page.getByText("아직 수집된 신호가 없습니다")).toBeVisible();
    } else await expect(page.getByRole("region", { name: "사용 관측 인원", exact: true })).toBeVisible();
    const refreshed = page.waitForResponse((response) => response.url().includes(`/organizations/${organization.id}/analytics/overview?`) && response.status() === 200);
    await page.reload();
    await refreshed;
    await expect(page.getByRole("navigation")).toContainText(organization.name);
    const logout = page.waitForResponse((response) => response.url().endsWith("/api/bff/auth/logout"));
    await page.getByRole("link", { name: "로그아웃", exact: true }).click();
    expect((await logout).status()).toBe(204);
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => sessionStorage.getItem("pulsemetry.seed-session.v1"))).toBeNull();
    expect(errors).toEqual([]);
  });
}
test("SEED-AUTH-UNKNOWN @p0 @read 등록되지 않은 이메일은 인증하지 않는다", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("회사 이메일", { exact: true }).fill("owner@seed-a.example.test.evil.com");
  const response = page.waitForResponse((response) => response.url().endsWith("/api/bff/auth/organizations") && response.request().method() === "POST");
  await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByText(/등록된 조직을 찾지 못했습니다/)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("SEED-AUTH-SWITCH @p0 @read A 로그아웃 후 B의 데이터와 조직명만 표시한다", async ({ page }) => {
  await signIn(page, "admin@seed-a.example.test");
  await page.goto("/overview");
  await expect(page.getByRole("navigation")).toContainText(organizations[0].name);
  await expect(page.getByRole("region", { name: "사용 관측 인원", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  // Pulsemetry 로그아웃은 IdP 세션을 유지한다. 테스트의 계정 전환을 위해서만 IdP 쿠키를 지운다.
  const idpHost = new URL(oidcOrigin()).hostname;
  await page.context().clearCookies({ domain: new RegExp(`^\\.?${idpHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
  await signIn(page, "owner@seed-b.example.test");
  await page.goto("/overview");
  await expect(page.getByRole("navigation")).toContainText(organizations[1].name);
  await expect(page.getByRole("navigation")).not.toContainText(organizations[0].name);
  await expect(page.getByText("아직 수집된 신호가 없습니다")).toBeVisible();
  await expect(page.getByRole("status", { name: "아직 수집된 데이터가 없습니다", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("SEED-AUTH-COOKIE @p1 @read 쿠키는 HttpOnly이며 브라우저 저장소에 토큰이 없다", async ({ page }) => {
  await signIn(page, "admin@seed-c.example.test");
  const cookies = await page.context().cookies();
  const session = cookies.find(cookie => cookie.name.endsWith("pulsemetry-session"));
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
  expect(await page.evaluate(() => document.cookie)).not.toContain("pulsemetry-session");
  expect(await page.evaluate(() => sessionStorage.getItem("pulsemetry.seed-session.v1"))).toBeNull();
});
