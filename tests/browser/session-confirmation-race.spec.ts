import { expect, test } from "@playwright/test";
import { mockSession } from "./helpers";
import { mockOverview } from "./overview-fixture";
import {
  completedOnboarding,
  fixtureOrg,
  fixtureUser,
} from "./session-fixture";

test("캐시된 온보딩으로 이동한 화면의 업무401은 세션만 재확인한다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  let sessions = 0,
    onboarding = 0,
    teams = 0;
  await page.route("**/api/bff/auth/session", (route) => {
    sessions++;
    return route.fulfill({ json: { user: fixtureUser } });
  });
  await page.route("**/api/v1/organizations/*/onboarding", (route) => {
    onboarding++;
    return route.fulfill({ json: completedOnboarding });
  });
  await page.route("**/api/v1/organizations/*/analytics/teams?*", (route) => {
    teams++;
    return route.fulfill({
      status: 401,
      json: { error: { code: "unauthenticated" } },
    });
  });
  await page.goto("/overview");
  await expect(
    page.getByRole("region", { name: "사용자 수", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "주 내비게이션" })
    .getByRole("link", { name: "팀 분석", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "이 조직의 팀 분석을 조회할 권한이 없습니다." }),
  ).toBeVisible();
  expect(sessions).toBe(2);
  expect(onboarding).toBe(1);
  expect(teams).toBe(1);
  await expect(page.getByLabel("로그인한 계정")).toContainText(
    fixtureUser.email,
  );
});

test("최초 온보딩 확인 중 세션이 익명이 되면 완료된 경로 확인 없이도 만료를 안내한다", async ({
  page,
}) => {
  await mockSession(page);
  let anonymous = false;
  let sessionRequests = 0;
  let onboardingRequests = 0;
  await page.route("**/api/bff/auth/session", (route) => {
    sessionRequests++;
    return route.fulfill({ json: { user: anonymous ? null : fixtureUser } });
  });
  await page.route(
    `**/api/v1/organizations/${fixtureOrg}/onboarding`,
    (route) => {
      onboardingRequests++;
      anonymous = true;
      return route.fulfill({
        status: 401,
        json: { error: { code: "unauthenticated", message: "fixture" } },
      });
    },
  );

  await page.goto("/overview");
  await expect(
    page.getByRole("heading", { name: "세션이 만료되었습니다" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "로그인 페이지로 이동" }).click();
  await expect(page.getByLabel("회사 이메일", { exact: true })).toBeVisible();
  await expect(page.getByLabel("로그인한 계정")).toHaveCount(0);
  expect(onboardingRequests).toBe(1);
  // 최초 확인, 업무401 재확인, 새 가드 확인과 로그인 가드 확인까지만 허용한다.
  expect(sessionRequests).toBeLessThanOrEqual(4);
});

test("최초 온보딩 확인 중 다른 계정이 되면 그 계정의 온보딩을 확인한다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  const otherUser = {
    ...fixtureUser,
    memberId: "initial-other-admin",
    organizationId: "22222222-2222-4222-8222-222222222222",
    organizationName: "다른 회사",
    email: "initial-other@example.test",
  };
  let changed = false;
  let sessionRequests = 0;
  const onboardingOrgs: string[] = [];
  await page.route("**/api/bff/auth/session", (route) => {
    sessionRequests++;
    return route.fulfill({ json: { user: changed ? otherUser : fixtureUser } });
  });
  await page.route("**/api/v1/organizations/*/onboarding", (route) => {
    const org = new URL(route.request().url()).pathname
      .split("/organizations/")[1]
      .split("/")[0];
    onboardingOrgs.push(org);
    if (org === fixtureOrg) {
      changed = true;
      return route.fulfill({
        status: 401,
        json: { error: { code: "unauthenticated", message: "fixture" } },
      });
    }
    return route.fulfill({
      json: { ...completedOnboarding, organizationId: org },
    });
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
  expect(onboardingOrgs).toEqual([fixtureOrg, otherUser.organizationId]);
  // 새 가드가 진행 중인 B 세션 확인에 합류하면 총 2회다.
  // 그 작업이 끝난 뒤 시작하면 새 확인 1회까지 허용하되 순환은 금지한다.
  expect(sessionRequests).toBeGreaterThanOrEqual(2);
  expect(sessionRequests).toBeLessThanOrEqual(3);
});

test("온보딩 캐시가 있어도 업무401 응답은 진행 중인 세션 재확인을 기다린다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  let sessions = 0,
    onboarding = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/bff/auth/session", async (route) => {
    sessions++;
    if (sessions === 2) await held;
    await route.fulfill({ json: { user: fixtureUser } });
  });
  await page.route("**/api/v1/organizations/*/onboarding", (route) => {
    onboarding++;
    return route.fulfill({ json: completedOnboarding });
  });
  await page.route("**/api/v1/organizations/*/analytics/teams?*", (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: "unauthenticated" } },
    }),
  );
  try {
    await page.goto("/overview");
    await expect(
      page.getByRole("region", { name: "사용자 수", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "주 내비게이션" })
      .getByRole("link", { name: "팀 분석", exact: true })
      .click();
    await expect.poll(() => sessions).toBe(2);
    await expect(page.getByLabel("로그인한 계정")).toContainText(
      fixtureUser.email,
    );
    const denied = page
      .getByRole("alert")
      .filter({ hasText: "이 조직의 팀 분석을 조회할 권한이 없습니다." });
    await expect(denied).toHaveCount(0);
    release();
    await expect(denied).toBeVisible();
    expect(sessions).toBe(2);
    expect(onboarding).toBe(1);
  } finally {
    release();
  }
});
