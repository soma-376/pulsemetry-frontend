import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";
import { mockOverview } from "./overview-fixture";
import { mockSession } from "./helpers";

/** 보안 — 보안 범주 알림(서버 ADR 0051)의 목록·상세·확인·CSV(UI 테스트). 실서버 검증은 tests/e2e/security.spec.ts 가 한다. */
const cors = (page: Page) => ({
  "access-control-allow-origin": new URL(page.url()).origin,
  "access-control-allow-headers": "content-type,authorization,idempotency-key",
  "access-control-allow-methods": "GET,POST,OPTIONS",
});
const security = {
  alertId: "a1",
  version: 1,
  ruleId: "model_not_allowed",
  category: "security",
  status: "open",
  occurredAt: "2026-09-12T01:00:00Z",
  lastSeenAt: "2026-09-12T03:00:00Z",
  windowStart: "2026-09-12T01:00:00Z",
  windowEnd: "2026-09-12T03:00:00Z",
  subject: "claude-opus-4",
  eventCount: 4,
  memberCount: 1,
  members: [{ memberId: "m1", account: "dana@example.test" }],
  evidence: { kind: "usage", targetName: "claude-opus-4" },
};
const cost = {
  ...security,
  alertId: "cost-alert",
  ruleId: "spend_spike",
  category: "cost",
  subject: null,
  eventCount: null,
  memberCount: null,
  members: [],
  evidence: {
    kind: "spend",
    startDate: "2026-09-06",
    endDate: "2026-09-12",
    currentCostUsd: "200.00",
    previousCostUsd: "100.00",
    increaseRatio: 1,
  },
};

async function serve(page: Page, options: { configured: boolean }) {
  const state = {
    acked: new Set<string>(),
    categories: [] as (string | null)[],
  };
  await page.route("**/api/v1/organizations/*/alerts?*", (route: Route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors(page) });
    const url = new URL(route.request().url());
    state.categories.push(url.searchParams.get("category"));
    const status = url.searchParams.get("status");
    const items = options.configured
      ? [security, cost]
          .filter(
            (alert) =>
              !url.searchParams.has("category") ||
              alert.category === url.searchParams.get("category"),
          )
          .filter(
            (alert) =>
              status === "all" ||
              (status === "acknowledged") === state.acked.has(alert.alertId),
          )
          .map((alert) => ({
            ...alert,
            acknowledgement: state.acked.has(alert.alertId)
              ? {
                  acknowledgedAt: "2026-09-13T11:30:00Z",
                  acknowledgedBy: "admin",
                }
              : null,
          }))
      : [];
    return route.fulfill({
      headers: cors(page),
      json: {
        meta: {
          organizationId: url.pathname
            .split("/organizations/")[1]
            .split("/")[0],
          snapshotId: "token",
          asOf: "2026-09-13T12:00:00Z",
        },
        evaluation: options.configured
          ? { status: "complete", reasons: [], asOf: "2026-09-13T11:00:00Z" }
          : {
              status: "unavailable",
              reasons: ["evaluation_not_configured"],
              asOf: null,
            },
        alerts: { items, totalCount: items.length, nextCursor: null },
      },
    });
  });
  await page.route(
    "**/api/v1/organizations/*/alerts/*/acknowledge",
    (route: Route) => {
      if (route.request().method() === "OPTIONS")
        return route.fulfill({ status: 204, headers: cors(page) });
      const id = route.request().url().split("/").at(-2)!;
      state.acked.add(id);
      return route.fulfill({
        headers: cors(page),
        json: {
          alertId: id,
          version: 1,
          acknowledgedAt: "2026-09-13T11:30:00Z",
          acknowledgedBy: "admin",
        },
      });
    },
  );
  return state;
}

test("보안 화면은 보안 범주 알림만 목록·상세·확인으로 보인다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  const state = await serve(page, { configured: true });
  await page.goto("/security");
  const main = page.getByRole("main");
  await expect(main).not.toContainText("세션 조회와 감사 로그");
  await expect(main).not.toContainText(
    /Pulsemetry P3 Ops|사유 필수|아직 구현 전/,
  );
  const panel = main.getByRole("region", { name: "보안 알림" });
  await expect(panel.getByText("검사 정보", { exact: true })).toHaveCount(0);
  const item = panel
    .getByRole("list", { name: "알림 목록" })
    .getByRole("listitem");
  await expect(item).toHaveCount(1);
  await item.getByText("상세", { exact: true }).click();
  await expect(
    item.getByRole("definition").filter({ hasText: "claude-opus-4" }),
  ).toBeVisible();
  // 공통 종은 범주 전체, 본문은 security를 조회한다. 서로 다른 캐시가
  // 섞이면 위의 본문 1건 검증과 아래의 종 2건 검증이 함께 실패한다.
  expect(state.categories).toContain("security");
  expect(
    state.categories.every(
      (category) => category === null || category === "security",
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "알림, 미확인 2건", exact: true }),
  ).toBeVisible();
  await item.getByRole("button", { name: /확인$/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "알림을 확인했습니다." }),
  ).toBeVisible();
  await expect(panel).toContainText("미확인 보안 알림이 없습니다");
  // CSV — 화면의 상태(확인함) 조건의 보안 알림.
  await panel
    .getByRole("group", { name: "알림 상태" })
    .getByRole("button", { name: "확인함" })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const text = await readFile((await (await download).path())!, "utf8");
  expect(text).toContain("화면,보안\r\n");
  expect(text).toContain("상태,acknowledged\r\n");
  expect(text).toContain(
    "\r\nalerts,a1,model_not_allowed,security,open,claude-opus-4,4,1,dana@example.test,",
  );
  expect(text).not.toContain("cost-alert");
});

test("규칙을 켜지 않은 조직은 빈 상태를 보인다", async ({ page }) => {
  await mockSession(page);
  await mockOverview(page);
  await serve(page, { configured: false });
  await page.goto("/security");
  const panel = page
    .getByRole("main")
    .getByRole("region", { name: "보안 알림" });
  await expect(panel).toContainText("알림 평가 결과를 확인할 수 없습니다");
  await expect(panel.getByText("검사 정보", { exact: true })).toHaveCount(0);
});
