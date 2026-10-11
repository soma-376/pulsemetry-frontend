import { expect, test } from "@playwright/test";
import { mockOverview } from "./overview-fixture";
import { mockSession } from "./helpers";

/** 비로그인 요청은 Proxy에서 리다이렉트하고 조직 조회를 시작하지 않는다. */
test("세션이 없으면 모든 보호 경로에서 로그인 페이지로 이동한다", async ({
  page,
}) => {
  await page.route("**/api/bff/auth/session", (route) =>
    route.fulfill({ json: { user: null } }),
  );
  const organizationRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/organizations/"))
      organizationRequests.push(request.url());
  });
  for (const path of ["/overview", "/teams", "/ops", "/members", "/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("회사 이메일", { exact: true })).toBeVisible();
    await expect(page.getByLabel("로그인한 계정")).toHaveCount(0);
  }
  expect(organizationRequests).toEqual([]);
});

test("로그아웃 후 뒤로 가도 보호 화면을 다시 표시하지 않는다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  await page.route("**/api/bff/auth/logout", async (route) => {
    await page.context().clearCookies({ name: "pulsemetry-session" });
    await page.route("**/api/bff/auth/session", (r) =>
      r.fulfill({ json: { user: null } }),
    );
    await route.fulfill({ status: 204 });
  });
  await page.goto("/overview");
  await expect(page.getByLabel("로그인한 계정")).toContainText(
    "admin@seed-a.example.test",
  );
  await page
    .getByRole("navigation", { name: "주 내비게이션" })
    .getByRole("link", { name: "운영 · 보안" })
    .click();
  await expect(page).toHaveURL(/\/ops(?:\?.*)?$/);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("회사 이메일", { exact: true })).toBeVisible();
  await expect(page.getByLabel("로그인한 계정")).toHaveCount(0);
});
