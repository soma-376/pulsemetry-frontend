import { test, expect } from "@playwright/test";
import { mockSeedAuth, mockSession } from "./helpers";
import { mockOverview, overviewUrl } from "./overview-fixture";
import { completedOnboarding, fixtureUser } from "./session-fixture";

test("페이지 이동은 인증·온보딩 추가 요청 없이 캐시를 쓰고 포커스는 세션만 재확인한다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  let sessions = 0,
    onboarding = 0;
  await page.route("**/api/bff/auth/session", (route) => {
    sessions++;
    return route.fulfill({ json: { user: fixtureUser } });
  });
  await page.route("**/api/v1/organizations/*/onboarding", (route) => {
    onboarding++;
    return route.fulfill({ json: completedOnboarding });
  });
  await page.goto("/overview");
  await expect(page.getByLabel("로그인한 계정")).toBeVisible();
  expect(sessions).toBe(1);
  expect(onboarding).toBe(1);
  await page.locator('nav a[href="/settings"]').click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(
    page.getByRole("heading", { name: "설정", exact: true }),
  ).toBeVisible();
  expect(sessions).toBe(1);
  expect(onboarding).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => sessions).toBe(2);
  expect(onboarding).toBe(1);
});

test("업무 요청 후 만료는 자동 이동 없이 안내하고 버튼에 원래 경로·쿼리·해시를 담는다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  let expired = false;
  await page.route("**/api/bff/auth/session", (route) =>
    route.fulfill({ json: { user: expired ? null : fixtureUser } }),
  );
  await page.route(overviewUrl, (route) =>
    expired
      ? route.fulfill({
          status: 401,
          json: { error: { code: "session_reauthentication_required" } },
        })
      : route.fallback(),
  );
  await page.goto(
    "/overview?startDate=2026-09-07&endDate=2026-09-13&compare=none#usage",
  );
  await expect(
    page.getByRole("region", { name: "사용자 수", exact: true }),
  ).toBeVisible();
  const original = new URL(page.url());
  expired = true;
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "세션이 만료되었습니다" }),
  ).toBeVisible();
  expect(page.url()).toBe(original.href);
  await expect(page.getByLabel("로그인한 계정")).toHaveCount(0);
  const link = page.getByRole("link", { name: "로그인 페이지로 이동" });
  const target = new URL((await link.getAttribute("href"))!, original.origin);
  expect(target.searchParams.get("redirecturl")).toBe(
    original.pathname + original.search + original.hash,
  );
  await link.click();
  await expect(page.getByLabel("회사 이메일", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("redirecturl")).toBe(
    original.pathname + original.search + original.hash,
  );
});

for (const returnTo of [
  "/settings?vendor=test#vendors",
  "https://evil.test",
  "//evil.test",
  "/login",
]) {
  test(`SSO 로그인 완료 복귀 경로 검증: ${returnTo}`, async ({ page }) => {
    await mockSeedAuth(page);
    await page.route("**/api/v1/organizations/*/onboarding", (route) =>
      route.fulfill({ json: completedOnboarding }),
    );
    await page.goto(`/login?${new URLSearchParams({ redirecturl: returnTo })}`);
    await page
      .getByLabel("회사 이메일", { exact: true })
      .fill("admin@seed-a.example.test");
    await page
      .getByRole("button", { name: "회사 계정으로 계속", exact: true })
      .click();
    if (returnTo.startsWith("/settings"))
      await expect(page).toHaveURL(
        new RegExp("/settings\\?vendor=test#vendors$"),
      );
    else await expect(page).toHaveURL(/\/overview(?:\?.*)?$/);
    await expect(page.getByLabel("로그인한 계정")).toBeVisible();
  });
}

test("Proxy가 미로그인 페이지의 경로와 검색 조건을 로그인 링크에 보존한다", async ({
  request,
}) => {
  const response = await request.get("/members?team=platform", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  const location = new URL(response.headers().location, response.url());
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("redirecturl")).toBe(
    "/members?team=platform",
  );
});

test("온보딩이 필요한 로그인도 완료 후 요청했던 페이지로 돌아간다", async ({
  page,
}) => {
  await mockSeedAuth(page);
  let completed = false;
  await page.route("**/api/v1/organizations/*/onboarding", (route) =>
    route.fulfill({
      json: {
        ...completedOnboarding,
        completed,
        completedAt: completed ? completedOnboarding.completedAt : null,
        nextStep: completed ? "complete" : "team",
      },
    }),
  );
  await page.route("**/api/v1/organizations/*/onboarding/complete", (route) => {
    completed = true;
    return route.fulfill({ json: completedOnboarding });
  });
  await page.goto(
    `/login?${new URLSearchParams({ redirecturl: "/settings?vendor=test#vendors" })}`,
  );
  await page
    .getByLabel("회사 이메일", { exact: true })
    .fill("admin@seed-a.example.test");
  await page
    .getByRole("button", { name: "회사 계정으로 계속", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding\?redirecturl=/);
  await page
    .getByRole("button", { name: "건너뛰고 시작", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\?vendor=test#vendors$/);
  await expect(page.getByLabel("로그인한 계정")).toBeVisible();
});
