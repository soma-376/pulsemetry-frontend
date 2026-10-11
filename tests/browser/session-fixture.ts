import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { createSessionCookie } from "../../src/lib/server/session-cookie";

export const fixtureOrg = "11111111-1111-4111-8111-111111111111";
export const fixtureUser = {
  memberId: "fixture-admin",
  organizationId: fixtureOrg,
  organizationName: "코드웍스",
  email: "admin@seed-a.example.test",
  displayName: "관리자",
  role: "admin",
};
export const completedOnboarding = {
  organizationId: fixtureOrg,
  completed: true,
  completedAt: "2026-09-01T00:00:00Z",
  policy: {
    confirmed: true,
    confirmedAt: "2026-09-01T00:00:00Z",
    version: 1,
    collectRawContent: false,
  },
  selectedVendorCount: 1,
  canComplete: true,
  nextStep: "complete",
};

/** 테스트 키로 실제 코덱을 사용한다. 운영 Proxy에는 fixture 우회가 없다. */
export async function issueFixtureCookie(
  page: Page,
  options: {
    expired?: boolean;
    tampered?: boolean;
    organizationId?: string;
  } = {},
) {
  const origin = "http://localhost:3107";
  const codec = createSessionCookie({ origin, keys: ["ab".repeat(32)] });
  const value = codec.seal({
    id: randomUUID(),
    organizationId: options.organizationId ?? fixtureOrg,
    accessToken: "fixture-at",
    refreshToken: "fixture-rt",
    accessTokenExpiresAt: Date.now() + 300000,
    sessionExpiresAt: Date.now() + (options.expired ? -1000 : 86400000),
  });
  await page.context().addCookies([
    {
      name: codec.cookieName,
      value: options.tampered ? value + "invalid" : value,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
export async function mockAuthenticatedRoutes(page: Page) {
  await issueFixtureCookie(page);
  await page.route("**/api/bff/auth/session", (route) =>
    route.fulfill({ json: { user: fixtureUser } }),
  );
  await page.route(
    `**/api/v1/organizations/${fixtureOrg}/onboarding`,
    (route) => route.fulfill({ json: completedOnboarding }),
  );
}
