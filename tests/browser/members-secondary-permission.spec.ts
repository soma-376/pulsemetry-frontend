import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { mockMembers } from "./members-fixture";
import { serveSettings } from "./onboarding-fixture";

for (const secondary of ["teams?*", "invitations?*"]) {
  for (const cached of [false, true]) {
    test(`구성원 ${secondary} 권한 거부는 ${cached ? "재조회" : "최초 조회"}에서도 안내와 복구 경로를 표시한다`, async ({
      page,
    }) => {
      serveSettings(page);
      await mockMembers(page, { invitations: [] });
      const roster = page.getByRole("region", {
        name: "구성원 목록",
        exact: true,
      });
      if (cached) {
        await openDashboard(page, "/members");
        await expect(roster).toBeVisible();
      }
      let fail = true;
      let deniedRequests = 0;
      await page.route(`**/api/v1/organizations/*/${secondary}`, (route) => {
        if (!fail) return route.fallback();
        deniedRequests++;
        return route.fulfill({
          status: 403,
          json: { error: { code: "forbidden", message: "isolated forbidden" } },
        });
      });
      if (cached) {
        await page
          .getByRole("toolbar", { name: "공통 조회 도구" })
          .getByRole("button", { name: "새로고침", exact: true })
          .click();
      } else {
        await openDashboard(page, "/members");
      }
      await expect.poll(() => deniedRequests).toBeGreaterThan(0);
      await expect(roster).toHaveCount(0);
      const error = page.getByRole("alert").filter({
        hasText: "관리자 권한이 필요합니다.",
      });
      await expect(error).toBeVisible();
      const retry = error.getByRole("button", {
        name: "다시 조회",
        exact: true,
      });
      await expect(retry).toBeEnabled();
      fail = false;
      await retry.click();
      await expect(error).toHaveCount(0);
      await expect(roster).toBeVisible();
    });
  }
}
