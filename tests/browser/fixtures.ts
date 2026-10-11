import { test as base, expect } from "@playwright/test";
import { mockAuthenticatedRoutes } from "./session-fixture";

/** 로그인부터 시작하는 UI 테스트. 실제 BFF 검증 파일은 Playwright의 기본 test를 사용한다. */
export const test = base.extend<{ session: void }>({
  session: [
    async ({ page }, use) => {
      await page.route("**/api/bff/auth/session", (route) =>
        route.fulfill({ json: { user: null } }),
      );
      await use();
    },
    { auto: true },
  ],
});

/** 로그인 UI가 대상이 아닌 테스트도 Proxy가 검증할 수 있는 실제 암호화 쿠키를 사용한다. */
export const authenticatedTest = base.extend<{ session: void }>({
  session: [
    async ({ page }, use) => {
      await mockAuthenticatedRoutes(page);
      await use();
    },
    { auto: true },
  ],
});
export { expect };
export type { Locator, Page } from "@playwright/test";
