import { expect, test, type Page, type Route } from "@playwright/test";
import example from "../../docs/api/settings-response.example.json";
import { mockSession, openDashboard } from "./helpers";
import { mockOverview } from "./overview-fixture";

/**
 * 알림 규칙 설정과 개요의 알림 확인(UI 테스트). 서버 규칙(백엔드 ADR 0051)을 흉내 낸 응답을 쓴다 — 켤 수 있는지·미확인 수는 서버 값이다.
 * 실제 서버 검증은 tests/e2e/alerts.spec.ts 가 한다.
 */
const cors = (page: Page) => ({ "access-control-allow-origin": new URL(page.url() === "about:blank" ? test.info().project.use.baseURL! : page.url()).origin,
  "access-control-allow-headers": "content-type,authorization,idempotency-key", "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS" });
const json = (page: Page, route: Route, value: unknown, status = 200) => route.fulfill({ status, headers: cors(page), json: value });
const preflight = (page: Page, route: Route) => route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors(page) }) : null;

test("미등록 제품 규칙은 등록 여부에 따른 서버 가용성과 저장한 판을 따른다", async ({ page }) => {
  let registered = false;
  const productRule = { ruleId: "product_not_registered", version: 0, enabled: false, threshold: { value: 1, unit: "events" },
    evaluationWindow: "rolling_24_hours", comparisonWindow: null };
  const calls: unknown[] = [];
  const rules = () => [
    ...example.alertRules.filter(rule => rule.ruleId !== "product_not_registered").map(rule => ({ ...rule, enabled: false, availability: "unavailable",
      reason: rule.ruleId === "spend_spike" ? "completeness_not_available" : "source_not_available" })),
    { ...productRule, availability: registered ? "available" : "unavailable", reason: registered ? null : "registered_products_not_configured" },
  ];
  await page.route("**/api/v1/organizations/*/settings", route => preflight(page, route) ?? json(page, route, {
    ...structuredClone(example), meta: { ...example.meta, organizationId: new URL(route.request().url()).pathname.split("/organizations/")[1].split("/")[0] },
    capabilities: { ...example.capabilities, editAlertRules: true }, alertRules: rules() }));
  await page.route("**/api/v1/organizations/*/settings/alert-rules/product_not_registered", route => {
    if (preflight(page, route)) return;
    const body = route.request().postDataJSON();
    calls.push({ method: route.request().method(), body });
    Object.assign(productRule, { enabled: body.enabled, version: productRule.version + 1 });
    return json(page, route, rules().find(rule => rule.ruleId === "product_not_registered"));
  });
  await openDashboard(page, "/settings");
  const toggle = page.getByRole("button", { name: "미등록 제품 사용 알림", exact: true });
  await expect(toggle).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "계약 벤더의 제품을 먼저 등록하세요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "한도 초과 알림", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: /모델 허용 목록|승인 도구 목록/ })).toHaveCount(0);
  // 다른 세션에서 등록한 제품이 다음 조회에 반영됐다.
  registered = true;
  await page.reload();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect.poll(() => calls).toEqual([{ method: "PATCH", body: { expectedVersion: 0, enabled: true } }]);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});

test("개요의 알림 KPI 에서 목록을 열고 확인하면 미확인 수가 서버 값으로 줄어든다", async ({ page }) => {
  await mockSession(page);
  const state = { acked: new Set<string>() };
  const alerts = [
    { alertId: "a1", version: 1, ruleId: "product_not_registered", category: "security", status: "open", occurredAt: "2026-09-12T01:00:00Z", lastSeenAt: "2026-09-12T03:00:00Z",
      windowStart: "2026-09-12T01:00:00Z", windowEnd: "2026-09-12T03:00:00Z", subject: "openai_biz", eventCount: 4, memberCount: 1,
      members: [{ memberId: "m1", account: "dana@example.test" }], summary: { productId: "openai_biz", productName: "ChatGPT / Codex (OpenAI)", events: 4, threshold: 1 } },
    { alertId: "a2", version: 1, ruleId: "spend_spike", category: "cost", status: "closed", occurredAt: "2026-09-11T15:00:00Z", lastSeenAt: "2026-09-11T15:00:00Z",
      windowStart: "2026-08-28T15:00:00Z", windowEnd: "2026-09-11T15:00:00Z", subject: null, eventCount: null, memberCount: null, members: [],
      summary: { currentStartDate: "2026-09-05", currentEndDate: "2026-09-11", currentCostUsd: "30.000000", previousCostUsd: "20.000000", increaseRatio: 0.5, threshold: 0.4 } },
  ];
  const open = () => alerts.filter((alert) => !state.acked.has(alert.alertId));
  await mockOverview(page, (data) => {
    const rest = open();
    Object.assign(data, { alerts: { availability: "available", reason: null, asOf: "2026-09-13T11:00:00Z", unacknowledgedTotal: rest.length,
      security: rest.filter((alert) => alert.category === "security").length, cost: rest.filter((alert) => alert.category === "cost").length } });
  });
  await page.route("**/api/v1/organizations/*/alerts?*", (route) => {
    if (preflight(page, route)) return;
    const status = new URL(route.request().url()).searchParams.get("status");
    const items = alerts.filter((alert) => status === "all" || (status === "acknowledged") === state.acked.has(alert.alertId))
      .map((alert) => ({ ...alert, acknowledgement: state.acked.has(alert.alertId) ? { acknowledgedAt: "2026-09-13T11:30:00Z", acknowledgedBy: "admin" } : null }));
    return json(page, route, { meta: { organizationId: new URL(route.request().url()).pathname.split("/organizations/")[1].split("/")[0], snapshotId: "token", asOf: "2026-09-13T12:00:00Z" },
      evaluation: { availability: "available", reason: null, asOf: "2026-09-13T11:00:00Z", rules: [
        { ruleId: "spend_spike", enabled: true, evaluatedAt: "2026-09-13T11:00:00Z", status: "not_evaluated", reason: "period_incomplete", windowStart: null, windowEnd: null },
        { ruleId: "product_not_registered", enabled: true, evaluatedAt: "2026-09-13T11:00:00Z", status: "evaluated", reason: null, windowStart: null, windowEnd: null }] },
      alerts: { items, totalCount: items.length, nextCursor: null } });
  });
  const acks: unknown[] = [];
  await page.route("**/api/v1/organizations/*/alerts/*/acknowledge", (route) => {
    if (preflight(page, route)) return;
    const id = route.request().url().split("/").at(-2)!;
    acks.push({ id, body: route.request().postDataJSON() });
    state.acked.add(id);
    return json(page, route, { alertId: id, version: 1, acknowledgedAt: "2026-09-13T11:30:00Z", acknowledgedBy: "admin" });
  });
  await page.goto("/overview");
  const kpi = page.getByRole("region", { name: "보안 경보 및 알림", exact: true });
  await expect(kpi).toContainText("2");
  await expect(kpi).toContainText("현재 미확인 · 보안 1 · 비용 1");
  await kpi.getByRole("button", { name: "알림 보기", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "알림", exact: true });
  const list = drawer.getByRole("list", { name: "알림 목록" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("제품 ChatGPT / Codex (OpenAI) · 4건 · 구성원 1명");
  await expect(list).toContainText("2026-09-05~2026-09-11 $30.00 · 앞 7일 $20.00 · +50%");
  // 평가하지 않은 규칙은 0건이 아니라 사유로 보인다.
  await expect(drawer.getByRole("region", { name: "규칙별 평가" })).toContainText("평가하지 않음 · 두 기간 중 완전히 관측되지 않은 날이 있어 평가하지 않았습니다");
  await list.getByRole("listitem").filter({ hasText: "미등록 제품" }).getByRole("button", { name: /확인$/ }).click();
  await expect.poll(() => acks).toEqual([{ id: "a1", body: { expectedVersion: 1 } }]);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(kpi).toContainText("현재 미확인 · 보안 0 · 비용 1");
  await drawer.getByRole("group", { name: "알림 상태" }).getByRole("button", { name: "확인함" }).click();
  await expect(list).toContainText("확인함");
});
