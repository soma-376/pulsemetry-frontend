import { expect, test } from "@playwright/test";
import { mockOverview, overviewUrl } from "./overview-fixture";
import { mockSession } from "./helpers";
import {
  completedOnboarding,
  fixtureOrg,
  fixtureUser,
} from "./session-fixture";

test("업무 조회401과 유효한 세션이 공존해도 로그인 왕복 없이 오류·재시도를 표시한다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  let requests = 0;
  let denied = true;
  const navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame())
      navigations.push(new URL(frame.url()).pathname);
  });
  await page.route(overviewUrl, async (route) => {
    requests++;
    if (denied)
      await route.fulfill({ status: 401, json: { error: "unauthenticated" } });
    else await route.fallback();
  });
  await page.goto(
    "/overview?startDate=2026-09-07&endDate=2026-09-13&compare=none",
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "로그인이 필요합니다" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/overview\?/);
  await expect(
    page.getByRole("button", { name: "다시 시도", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
  expect(navigations).not.toContain("/login");
  denied = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "사용자 수", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(2);
  expect(navigations).not.toContain("/login");
});

test("업무401 재확인에서 바뀐 계정의 온보딩과 화면을 확인한다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  const otherUser = {
    ...fixtureUser,
    memberId: "other-admin",
    organizationId: "22222222-2222-4222-8222-222222222222",
    organizationName: "다른 회사",
    email: "other@example.test",
  };
  let changed = false;
  const onboardingOrgs: string[] = [];
  await page.route("**/api/bff/auth/session", (route) =>
    route.fulfill({ json: { user: changed ? otherUser : fixtureUser } }),
  );
  await page.route("**/api/v1/organizations/*/onboarding", (route) => {
    const org = new URL(route.request().url()).pathname
      .split("/organizations/")[1]
      .split("/")[0];
    onboardingOrgs.push(org);
    return route.fulfill({
      json: { ...completedOnboarding, organizationId: org },
    });
  });
  await page.route(overviewUrl, async (route) => {
    if (route.request().url().includes(`/organizations/${fixtureOrg}/`)) {
      changed = true;
      await route.fulfill({ status: 401, json: { error: "unauthenticated" } });
    } else await route.fallback();
  });
  await page.goto(
    "/overview?startDate=2026-09-07&endDate=2026-09-13&compare=none",
  );
  await expect(page.getByLabel("로그인한 계정")).toContainText(otherUser.email);
  await expect(page.getByLabel("로그인한 계정")).not.toContainText(
    fixtureUser.email,
  );
  await expect(
    page.getByRole("region", { name: "사용자 수", exact: true }),
  ).toBeVisible();
  expect(onboardingOrgs).toContain(otherUser.organizationId);
});

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
  for (const path of [
    "/overview",
    "/teams",
    "/ops",
    "/security",
    "/members",
    "/settings",
  ]) {
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
    .getByRole("link", { name: "보안", exact: true })
    .click();
  await expect(page).toHaveURL(/\/security$/);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("회사 이메일", { exact: true })).toBeVisible();
  await expect(page.getByLabel("로그인한 계정")).toHaveCount(0);
});
