import { expect, test } from "@playwright/test";
import { mockSession } from "./helpers";
import { mockOverview } from "./overview-fixture";
import {
  completedOnboarding,
  fixtureOrg,
  fixtureUser,
} from "./session-fixture";

test("경로 확인 중 업무401이 같은 세션을 다시 확인해도 화면 확인을 완료한다", async ({
  page,
}, testInfo) => {
  await mockSession(page);
  await mockOverview(page);

  let navigating = false;
  let sessionRequests = 0;
  let teamsRequests = 0;
  let navigationOnboardingRequests = 0;
  const events: string[] = [];
  let startedOnboarding!: () => void;
  let releaseOnboarding!: () => void;
  const onboardingStarted = new Promise<void>((resolve) => {
    startedOnboarding = resolve;
  });
  const onboardingReleased = new Promise<void>((resolve) => {
    releaseOnboarding = resolve;
  });

  await page.route("**/api/bff/auth/session", async (route) => {
    sessionRequests++;
    events.push(`session:${sessionRequests}`);
    await route.fulfill({ json: { user: fixtureUser } });
  });
  await page.route(
    `**/api/v1/organizations/${fixtureOrg}/onboarding`,
    async (route) => {
      if (navigating) {
        navigationOnboardingRequests++;
        events.push("onboarding:held");
        startedOnboarding();
        await onboardingReleased;
        events.push("onboarding:released");
      }
      await route.fulfill({ json: completedOnboarding });
    },
  );
  await page.route(
    `**/api/v1/organizations/${fixtureOrg}/analytics/teams?*`,
    async (route) => {
      teamsRequests++;
      // 경로 가드가 세션 객체를 캡처하고 온보딩을 기다린 뒤에만
      // 숨겨진 팀 화면의 401로 같은 계정의 새 세션 객체를 만든다.
      await onboardingStarted;
      events.push("teams:401");
      await route.fulfill({
        status: 401,
        json: { error: { code: "unauthenticated", message: "fixture" } },
      });
    },
  );

  try {
    await page.goto(
      "/overview?startDate=2026-09-07&endDate=2026-09-13&compare=none",
    );
    await expect(
      page.getByRole("region", { name: "사용자 수", exact: true }),
    ).toBeVisible();
    expect(sessionRequests).toBe(1);

    navigating = true;
    await page
      .getByRole("navigation", { name: "주 내비게이션" })
      .getByRole("link", { name: "팀 분석", exact: true })
      .click();
    await expect(page).toHaveURL(/\/teams(?:\?.*)?$/);

    // 이 오류 본문은 sessionFetch의 강제 재확인이 완료된 뒤 생성된다.
    // 숨김 DOM을 기다려 응답 소비까지 보장하되 아직 가드 승인은 보류한다.
    const teamError = page
      .getByRole("alert", { includeHidden: true })
      .filter({ hasText: "이 조직의 팀 분석을 조회할 권한이 없습니다." });
    await expect(teamError).toHaveText(
      "이 조직의 팀 분석을 조회할 권한이 없습니다.",
    );
    await expect(teamError).not.toBeVisible();
    expect(navigationOnboardingRequests).toBe(1);
    expect(teamsRequests).toBe(1);
    expect(sessionRequests).toBe(3);
    events.push("teams:error-hidden-after-session-recheck");

    releaseOnboarding();
    // 같은 identity의 객체만 바뀌었으므로 온보딩의 성공을 버려
    // '로그인 상태를 확인 중'에 머물지 않아야 한다.
    await expect(teamError).toBeVisible();
    await expect(
      page.getByText("로그인 상태를 확인 중입니다…", { exact: true }),
    ).toBeHidden();
    await expect(page.getByLabel("로그인한 계정")).toContainText(
      fixtureUser.email,
    );
    await expect(page).toHaveURL(/\/teams(?:\?.*)?$/);
    expect(sessionRequests).toBeLessThanOrEqual(4);
  } finally {
    releaseOnboarding();
    await testInfo.attach("session-confirmation-order", {
      body: JSON.stringify(
        {
          events,
          sessionRequests,
          navigationOnboardingRequests,
          teamsRequests,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
  }
});

test("최초 온보딩 확인 중 세션이 익명이 되면 완료된 경로 확인 없이도 로그인으로 이동한다", async ({
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
  await expect(page).toHaveURL(/\/login$/);
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

test("온보딩이 먼저 끝나도 진행 중인 같은 계정 세션 확인을 기다린 뒤 화면을 연다", async ({
  page,
}, testInfo) => {
  await mockSession(page);
  await mockOverview(page);

  let navigating = false;
  let sessionRequests = 0;
  let teamsRequests = 0;
  const events: string[] = [];
  let startedOnboarding!: () => void;
  let releaseOnboarding!: () => void;
  let releaseRecheck!: () => void;
  const onboardingStarted = new Promise<void>((resolve) => {
    startedOnboarding = resolve;
  });
  const onboardingReleased = new Promise<void>((resolve) => {
    releaseOnboarding = resolve;
  });
  const recheckReleased = new Promise<void>((resolve) => {
    releaseRecheck = resolve;
  });

  await page.route("**/api/bff/auth/session", async (route) => {
    sessionRequests++;
    events.push(`session:${sessionRequests}`);
    if (sessionRequests === 3) {
      events.push("session-recheck:held");
      await recheckReleased;
      events.push("session-recheck:released");
    }
    await route.fulfill({ json: { user: fixtureUser } });
  });
  await page.route(
    `**/api/v1/organizations/${fixtureOrg}/onboarding`,
    async (route) => {
      if (navigating) {
        events.push("onboarding:held");
        startedOnboarding();
        await onboardingReleased;
        events.push("onboarding:released");
      }
      await route.fulfill({ json: completedOnboarding });
    },
  );
  await page.route(
    `**/api/v1/organizations/${fixtureOrg}/analytics/teams?*`,
    async (route) => {
      teamsRequests++;
      await onboardingStarted;
      events.push("teams:401");
      await route.fulfill({
        status: 401,
        json: { error: { code: "unauthenticated", message: "fixture" } },
      });
    },
  );

  try {
    await page.goto(
      "/overview?startDate=2026-09-07&endDate=2026-09-13&compare=none",
    );
    await expect(
      page.getByRole("region", { name: "사용자 수", exact: true }),
    ).toBeVisible();
    expect(sessionRequests).toBe(1);

    navigating = true;
    await page
      .getByRole("navigation", { name: "주 내비게이션" })
      .getByRole("link", { name: "팀 분석", exact: true })
      .click();
    await expect(page).toHaveURL(/\/teams(?:\?.*)?$/);
    await expect.poll(() => sessionRequests).toBe(3);
    expect(events).toContain("session-recheck:held");

    const onboardingResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/organizations/${fixtureOrg}/onboarding`) &&
        response.status() === 200,
    );
    releaseOnboarding();
    await (await onboardingResponse).finished();
    // 고정된 ms 지연 대신 두 렌더 프레임을 지나 응답 본문과 React 갱신을
    // 소비시킨다. 세션 응답은 명시적 gate가 계속 보류한다.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    events.push("onboarding:consumed-before-session-recheck");
    await expect(
      page.getByText("로그인 상태를 확인 중입니다…", { exact: true }),
    ).toBeVisible();
    expect(sessionRequests).toBe(3);

    releaseRecheck();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "이 조직의 팀 분석을 조회할 권한이 없습니다." }),
    ).toBeVisible();
    await expect(
      page.getByText("로그인 상태를 확인 중입니다…", { exact: true }),
    ).toBeHidden();
    await expect(page.getByLabel("로그인한 계정")).toContainText(
      fixtureUser.email,
    );
    expect(sessionRequests).toBe(3);
    expect(teamsRequests).toBe(1);
    await expect(page).toHaveURL(/\/teams(?:\?.*)?$/);
  } finally {
    releaseOnboarding();
    releaseRecheck();
    await testInfo.attach("onboarding-first-session-confirmation-order", {
      body: JSON.stringify({ events, sessionRequests, teamsRequests }, null, 2),
      contentType: "application/json",
    });
  }
});
