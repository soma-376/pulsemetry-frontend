import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { mockMembers } from "./members-fixture";
import { serveSettings } from "./onboarding-fixture";
import { ingestStatusUrl } from "./overview-fixture";
import type { Page } from "@playwright/test";

const pages = [
  { path: "/overview", api: "analytics/overview?*", region: "사용 환산액" },
  { path: "/teams", api: "analytics/teams?*", region: "팀별 사용량 비교" },
  { path: "/members", api: "members/dashboard?*", region: "구성원 목록" },
  { path: "/settings", api: "settings", region: "계약 벤더" },
  { path: "/ops", api: "alerts?*", region: "보안 알림" },
];

async function preparePage(page: Page, path: string) {
  serveSettings(page);
  if (path === "/members") await mockMembers(page, { invitations: [] });
  if (path === "/ops") {
    await page.route("**/api/v1/organizations/*/alerts?*", (route) =>
      route.fulfill({
        json: {
          meta: {
            organizationId: new URL(route.request().url()).pathname
              .split("/organizations/")[1]
              .split("/")[0],
            snapshotId: "refresh-test",
            asOf: "2026-10-03T00:00:00Z",
          },
          evaluation: {
            status: "complete",
            reasons: [],
            asOf: "2026-10-03T00:00:00Z",
          },
          alerts: { items: [], totalCount: 0, nextCursor: null },
        },
      }),
    );
  }
  await openDashboard(page, path);
}

for (const target of pages) {
  test(`${target.path}: 갱신 실패에도 본문·헤더 위치와 마지막 데이터를 유지하고 복구한다`, async ({
    page,
  }) => {
    await preparePage(page, target.path);
    const body = page.getByRole("region", { name: target.region, exact: true });
    await expect(body).toBeVisible();
    const toolbar = page.getByRole("toolbar", { name: "공통 조회 도구" });
    await expect(
      toolbar.getByRole("button", { name: "새로고침", exact: true }),
    ).toBeEnabled();
    const before = await body.innerText();
    const position = await body.boundingBox();
    const header = page.getByLabel("공통 헤더", { exact: true });
    const headerHeight = (await header.boundingBox())?.height;
    const ingest = await page.getByLabel("조직 수집 현황").innerText();
    let fail = true;
    for (const api of [
      target.api,
      "ingest-status",
      ...(target.path === "/members" ? ["teams", "invitations?*"] : []),
    ]) {
      await page.route(`**/api/v1/organizations/*/${api}`, (route) =>
        fail
          ? route.fulfill({
              status: 503,
              json: { error: { code: "unavailable" } },
            })
          : route.fallback(),
      );
    }
    await toolbar
      .getByRole("button", { name: "새로고침", exact: true })
      .click();
    const notice = page.getByRole("status", { name: "데이터 갱신 상태" });
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText(
      "마지막으로 조회한 데이터를 표시합니다.",
    );
    await expect(
      notice.getByRole("button", { name: "다시 조회", exact: true }),
    ).toBeEnabled();
    expect(await body.innerText()).toBe(before);
    expect((await body.boundingBox())?.y).toBe(position?.y);
    expect((await header.boundingBox())?.height).toBe(headerHeight);
    expect(await page.getByLabel("조직 수집 현황").innerText()).toBe(ingest);
    fail = false;
    await notice
      .getByRole("button", { name: "다시 조회", exact: true })
      .click();
    await expect(notice).toHaveCount(0);
    await expect(body).toBeVisible();
    expect((await body.boundingBox())?.y).toBe(position?.y);
  });
}

for (const width of [1440, 390]) {
  test(`오프라인 연결 대기와 복구 중에도 개요 배치를 유지한다 (${width}px)`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await preparePage(page, "/overview");
    const body = page.getByRole("region", { name: "사용 환산액", exact: true });
    await expect(body).toBeVisible();
    const position = await body.boundingBox();
    const before = await body.innerText();
    await context.setOffline(true);
    try {
      await page
        .getByRole("toolbar", { name: "공통 조회 도구" })
        .getByRole("button", { name: "새로고침", exact: true })
        .click();
      const notice = page.getByRole("status", { name: "데이터 갱신 상태" });
      await expect(notice).toContainText("연결을 기다리고 있습니다");
      expect(await body.innerText()).toBe(before);
      expect((await body.boundingBox())?.y).toBe(position?.y);
      const box = await notice.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await context.setOffline(false);
      await expect(notice).toHaveCount(0);
      expect((await body.boundingBox())?.y).toBe(position?.y);
    } finally {
      await context.setOffline(false);
    }
  });
}

for (const target of pages) {
  test(`${target.path}: 재조회는 공통 버튼에만 표시하고 기존 본문을 유지한다`, async ({
    page,
  }) => {
    serveSettings(page);
    if (target.path === "/members")
      await mockMembers(page, { invitations: [] });
    if (target.path === "/ops") {
      await page.route("**/api/v1/organizations/*/alerts?*", (route) =>
        route.fulfill({
          json: {
            meta: {
              organizationId: new URL(route.request().url()).pathname
                .split("/organizations/")[1]
                .split("/")[0],
              snapshotId: "refresh-test",
              asOf: "2026-10-03T00:00:00Z",
            },
            evaluation: {
              status: "complete",
              reasons: [],
              asOf: "2026-10-03T00:00:00Z",
            },
            alerts: { items: [], totalCount: 0, nextCursor: null },
          },
        }),
      );
    }
    await openDashboard(page, target.path);
    const body = page.getByRole("region", { name: target.region, exact: true });
    await expect(body).toBeVisible();
    const toolbar = page.getByRole("toolbar", { name: "공통 조회 도구" });
    await expect(
      toolbar.getByRole("button", { name: "새로고침", exact: true }),
    ).toBeEnabled();
    const originalText = await body.innerText();
    const originalPosition = await body.boundingBox();

    let releasePage!: () => void;
    let releaseIngest!: () => void;
    const pageGate = new Promise<void>((resolve) => {
      releasePage = resolve;
    });
    const ingestGate = new Promise<void>((resolve) => {
      releaseIngest = resolve;
    });
    let pageRequests = 0;
    let ingestRequests = 0;
    await page.route(
      `**/api/v1/organizations/*/${target.api}`,
      async (route) => {
        pageRequests++;
        await pageGate;
        await route.fallback();
      },
    );
    await page.route(ingestStatusUrl, async (route) => {
      ingestRequests++;
      await ingestGate;
      await route.fallback();
    });

    try {
      await toolbar
        .getByRole("button", { name: "새로고침", exact: true })
        .click();
      await expect
        .poll(() => [pageRequests, ingestRequests])
        .toEqual([target.path === "/ops" ? 2 : 1, 1]);
      const refreshing = toolbar.getByRole("button", {
        name: "조회 중…",
        exact: true,
      });
      await expect(refreshing).toBeDisabled();
      await expect(refreshing).toHaveAttribute("aria-busy", "true");
      await expect(body).toBeVisible();
      expect(await body.innerText()).toBe(originalText);
      expect((await body.boundingBox())?.y).toBe(originalPosition?.y);
      await expect(page.getByText(/새로고침하는 중입니다/)).toHaveCount(0);
      await expect(
        page.getByLabel("수집 상태 갱신 중", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByLabel("조직 수집 현황")).toContainText(
        "수집 상태 확인 불가",
      );

      // 수집 현황이 먼저 끝나도 본문 요청이 남아 있으면 진행 표시를 유지한다.
      const ingestDone = page.waitForResponse((response) =>
        response.url().endsWith("/ingest-status"),
      );
      releaseIngest();
      await ingestDone;
      await expect(refreshing).toBeDisabled();
      releasePage();
      await expect(
        toolbar.getByRole("button", { name: "새로고침", exact: true }),
      ).toBeEnabled();
      await expect(body).toBeVisible();
      expect(pageRequests).toBe(target.path === "/ops" ? 2 : 1);
    } finally {
      releasePage();
      releaseIngest();
    }
  });
}
