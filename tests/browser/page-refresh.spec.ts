import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { mockMembers } from "./members-fixture";
import { serveSettings } from "./onboarding-fixture";
import { ingestStatusUrl } from "./overview-fixture";

const pages = [
  { path: "/overview", api: "analytics/overview?*", region: "토큰 비용" },
  { path: "/teams", api: "analytics/teams?*", region: "팀별 사용량 비교" },
  { path: "/members", api: "members/dashboard?*", region: "구성원 목록" },
  { path: "/settings", api: "settings", region: "계약 벤더" },
  { path: "/ops", api: "alerts?*", region: "보안 알림" },
];

for (const target of pages) {
  test(`${target.path}: 재조회는 공통 버튼에만 표시하고 기존 본문을 유지한다`, async ({ page }) => {
    serveSettings(page);
    if (target.path === "/members") await mockMembers(page, { invitations: [] });
    if (target.path === "/ops") {
      await page.route("**/api/v1/organizations/*/alerts?*", route => route.fulfill({ json: {
        meta: { organizationId: new URL(route.request().url()).pathname.split("/organizations/")[1].split("/")[0], snapshotId: "refresh-test", asOf: "2026-10-03T00:00:00Z" },
        evaluation: { availability: "available", reason: null, asOf: "2026-10-03T00:00:00Z", rules: [] },
        alerts: { items: [], totalCount: 0, nextCursor: null },
      } }));
    }
    await openDashboard(page, target.path);
    const body = page.getByRole("region", { name: target.region, exact: true });
    await expect(body).toBeVisible();
    const toolbar = page.getByRole("toolbar", { name: "전역 필터" });
    await expect(toolbar.getByRole("button", { name: "새로고침", exact: true })).toBeEnabled();
    const originalText = await body.innerText();
    const originalPosition = await body.boundingBox();

    let releasePage!: () => void;
    let releaseIngest!: () => void;
    const pageGate = new Promise<void>(resolve => { releasePage = resolve; });
    const ingestGate = new Promise<void>(resolve => { releaseIngest = resolve; });
    let pageRequests = 0;
    let ingestRequests = 0;
    await page.route(`**/api/v1/organizations/*/${target.api}`, async route => {
      pageRequests++;
      await pageGate;
      await route.fallback();
    });
    await page.route(ingestStatusUrl, async route => {
      ingestRequests++;
      await ingestGate;
      await route.fallback();
    });

    try {
      await toolbar.getByRole("button", { name: "새로고침", exact: true }).click();
      await expect.poll(() => [pageRequests, ingestRequests]).toEqual([1, 1]);
      const refreshing = toolbar.getByRole("button", { name: "조회 중…", exact: true });
      await expect(refreshing).toBeDisabled();
      await expect(refreshing).toHaveAttribute("aria-busy", "true");
      await expect(body).toBeVisible();
      expect(await body.innerText()).toBe(originalText);
      expect((await body.boundingBox())?.y).toBe(originalPosition?.y);
      await expect(page.getByText(/새로고침하는 중입니다/)).toHaveCount(0);
      await expect(page.getByLabel("수집 상태 갱신 중", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("조직 수집 현황")).toContainText("수집 상태 확인 불가");

      // 수집 현황이 먼저 끝나도 본문 요청이 남아 있으면 진행 표시를 유지한다.
      const ingestDone = page.waitForResponse(response => response.url().endsWith("/ingest-status"));
      releaseIngest();
      await ingestDone;
      await expect(refreshing).toBeDisabled();
      releasePage();
      await expect(toolbar.getByRole("button", { name: "새로고침", exact: true })).toBeEnabled();
      await expect(body).toBeVisible();
      expect(pageRequests).toBe(1);
    } finally {
      releasePage();
      releaseIngest();
    }
  });
}
