import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";
import { mockOverview } from "./overview-fixture";
import { mockSession } from "./helpers";

/** 운영 · 보안 — 보안 범주 알림(서버 ADR 0051)의 목록·상세·확인·CSV(UI 테스트). 실서버 검증은 tests/e2e/ops.spec.ts 가 한다. */
const cors = (page: Page) => ({ "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-headers": "content-type,authorization,idempotency-key",
  "access-control-allow-methods": "GET,POST,OPTIONS" });
const security = { alertId: "a1", version: 1, ruleId: "model_not_allowed", category: "security", status: "open", occurredAt: "2026-09-12T01:00:00Z", lastSeenAt: "2026-09-12T03:00:00Z",
  windowStart: "2026-09-12T01:00:00Z", windowEnd: "2026-09-12T03:00:00Z", subject: "claude-opus-4", eventCount: 4, memberCount: 1,
  members: [{ memberId: "m1", account: "dana@example.test" }], summary: { model: "claude-opus-4", events: 4, threshold: 1 } };

async function serve(page: Page, options: { configured: boolean }) {
  const state = { acked: new Set<string>(), categories: [] as (string | null)[] };
  await page.route("**/api/v1/organizations/*/alerts?*", (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors(page) });
    const url = new URL(route.request().url());
    state.categories.push(url.searchParams.get("category"));
    const status = url.searchParams.get("status");
    const items = options.configured ? [security].filter((alert) => status === "all" || (status === "acknowledged") === state.acked.has(alert.alertId))
      .map((alert) => ({ ...alert, acknowledgement: state.acked.has(alert.alertId) ? { acknowledgedAt: "2026-09-13T11:30:00Z", acknowledgedBy: "admin" } : null })) : [];
    return route.fulfill({ headers: cors(page), json: { meta: { organizationId: url.pathname.split("/")[4], snapshotId: "token", asOf: "2026-09-13T12:00:00Z" },
      evaluation: options.configured ? { availability: "available", reason: null, asOf: "2026-09-13T11:00:00Z", rules: [
        { ruleId: "spend_spike", enabled: true, evaluatedAt: "2026-09-13T11:00:00Z", status: "evaluated", reason: null, windowStart: null, windowEnd: null },
        { ruleId: "model_not_allowed", enabled: true, evaluatedAt: "2026-09-13T11:00:00Z", status: "evaluated", reason: null, windowStart: null, windowEnd: null },
        { ruleId: "tool_unapproved", enabled: true, evaluatedAt: "2026-09-13T11:00:00Z", status: "not_evaluated", reason: "approved_tools_not_configured", windowStart: null, windowEnd: null }] }
        : { availability: "unavailable", reason: "evaluation_not_configured", asOf: null, rules: [] },
      alerts: { items, totalCount: items.length, nextCursor: null } } });
  });
  await page.route("**/api/v1/organizations/*/alerts/*/acknowledge", (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors(page) });
    const id = route.request().url().split("/").at(-2)!;
    state.acked.add(id);
    return route.fulfill({ headers: cors(page), json: { alertId: id, version: 1, acknowledgedAt: "2026-09-13T11:30:00Z", acknowledgedBy: "admin" } });
  });
  return state;
}

test("운영 · 보안은 보안 범주 알림만 목록·상세·확인으로 보이고 범위 밖(세션 조회·감사 로그)을 말한다", async ({ page }) => {
  await mockSession(page);
  await mockOverview(page);
  const state = await serve(page, { configured: true });
  await page.goto("/ops");
  const main = page.getByRole("main");
  await expect(main).toContainText("세션 조회와 감사 로그는 이 화면의 범위가 아닙니다");
  await expect(main).not.toContainText(/Pulsemetry P3 Ops|사유 필수|아직 구현 전/);
  const panel = main.getByRole("region", { name: "보안 알림" });
  // 규칙별 평가도 보안 규칙만 — 평가하지 않은 규칙은 사유를 말한다.
  const rules = panel.getByRole("region", { name: "규칙별 평가" });
  await expect(rules).toContainText("미승인 도구");
  await expect(rules).not.toContainText("비용 급증");
  await expect(rules).toContainText("평가하지 않음");
  const item = panel.getByRole("list", { name: "알림 목록" }).getByRole("listitem");
  await expect(item).toHaveCount(1);
  await item.getByText("상세", { exact: true }).click();
  await expect(item.getByRole("definition").filter({ hasText: "claude-opus-4" })).toBeVisible();
  expect(state.categories.every((category) => category === "security")).toBe(true);
  await item.getByRole("button", { name: /확인$/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "알림을 확인했습니다." })).toBeVisible();
  await expect(panel).toContainText("미확인 보안 알림이 없습니다");
  // CSV — 화면의 상태(확인함) 조건의 보안 알림.
  await panel.getByRole("group", { name: "알림 상태" }).getByRole("button", { name: "확인함" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const text = await readFile((await (await download).path())!, "utf8");
  expect(text).toContain("화면,운영 · 보안\r\n");
  expect(text).toContain("상태,acknowledged\r\n");
  expect(text).toContain("\r\nalerts,a1,model_not_allowed,security,open,claude-opus-4,4,1,dana@example.test,");
});

test("규칙을 켜지 않은 조직은 빈 상태와 평가 전제 사유를 보인다", async ({ page }) => {
  await mockSession(page);
  await mockOverview(page);
  await serve(page, { configured: false });
  await page.goto("/ops");
  const panel = page.getByRole("main").getByRole("region", { name: "보안 알림" });
  await expect(panel).toContainText("미확인 보안 알림이 없습니다");
  await expect(panel.getByRole("region", { name: "규칙별 평가" })).not.toBeEmpty();
});
