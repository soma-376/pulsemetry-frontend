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

test("알림 규칙은 서버가 켤 수 있다고 할 때만 켜지고, 목록을 저장하면 응답의 상태로 토글이 바뀐다", async ({ page }) => {
  type Rule = (typeof example.alertRules)[number];
  const rules: Rule[] = structuredClone(example.alertRules).map((rule) => ({ ...rule, version: 0, enabled: false, availability: "unavailable",
    reason: { spend_spike: "completeness_not_available", quota_exceeded: "source_not_available", model_not_allowed: "allowed_models_not_configured", tool_unapproved: "approved_tools_not_configured" }[rule.ruleId]! }));
  const lists = { allowedModels: { listId: "allowed_models", version: 0, entries: [] as string[], updatedAt: null as string | null },
    approvedTools: { listId: "approved_tools", version: 0, entries: [] as string[], updatedAt: null as string | null } };
  const calls: { method: string; path: string; body: unknown }[] = [];
  await page.route("**/api/v1/organizations/*/settings", (route) => preflight(page, route) ?? json(page, route, {
    ...structuredClone(example), meta: { ...example.meta, organizationId: new URL(route.request().url()).pathname.split("/")[4] },
    capabilities: { ...example.capabilities, editAlertRules: true }, alertRules: rules, alertLists: lists }));
  await page.route("**/api/v1/organizations/*/settings/alert-lists/*", (route) => {
    if (preflight(page, route)) return;
    const body = route.request().postDataJSON();
    calls.push({ method: route.request().method(), path: "alert-lists", body });
    lists.allowedModels = { ...lists.allowedModels, version: lists.allowedModels.version + 1, entries: [...body.entries].sort(), updatedAt: "2026-10-01T00:00:00Z" };
    const model = rules.find((rule) => rule.ruleId === "model_not_allowed")!;
    Object.assign(model, { availability: body.entries.length ? "available" : "unavailable", reason: body.entries.length ? null : "allowed_models_not_configured" });
    return json(page, route, { list: lists.allowedModels, alertRules: rules });
  });
  await page.route("**/api/v1/organizations/*/settings/alert-rules/*", (route) => {
    if (preflight(page, route)) return;
    const body = route.request().postDataJSON();
    calls.push({ method: route.request().method(), path: "alert-rules/" + route.request().url().split("/").pop(), body });
    const rule = rules.find((item) => item.ruleId === route.request().url().split("/").pop())!;
    Object.assign(rule, { enabled: body.enabled, version: rule.version + 1 });
    return json(page, route, rule);
  });
  await openDashboard(page, "/settings");

  const modelToggle = page.getByRole("button", { name: "비허용 모델 호출 알림", exact: true });
  await expect(modelToggle).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "모델 허용 목록을 먼저 입력하세요" })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "한도 초과를 가리키는 검증된 관측이 없어 켤 수 없습니다" })).toBeVisible();
  await expect(page.getByRole("button", { name: "한도 초과 알림", exact: true })).toBeDisabled();

  await page.getByRole("textbox", { name: "모델 허용 목록", exact: true }).fill(" gpt-5 \n\nclaude-sonnet-*\ngpt-5\n");
  await page.getByRole("button", { name: "모델 허용 목록 저장", exact: true }).click();
  await expect.poll(() => calls[0]).toEqual({ method: "PUT", path: "alert-lists", body: { expectedVersion: 0, entries: ["gpt-5", "claude-sonnet-*"] } });
  await expect(page.getByRole("status").filter({ hasText: "모델 허용 목록을 저장했습니다." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "모델 허용 목록", exact: true })).toHaveValue("claude-sonnet-*\ngpt-5");
  await expect(modelToggle).toBeEnabled();
  await modelToggle.click();
  await expect.poll(() => calls[1]).toEqual({ method: "PATCH", path: "alert-rules/model_not_allowed", body: { expectedVersion: 0, enabled: true } });
  await expect(modelToggle).toHaveAttribute("aria-pressed", "true");
  // 급증은 수집 구간 보고가 없어 여전히 켤 수 없다.
  await expect(page.getByRole("button", { name: "비용 급증 알림", exact: true })).toBeDisabled();
});

test("개요의 알림 KPI 에서 목록을 열고 확인하면 미확인 수가 서버 값으로 줄어든다", async ({ page }) => {
  await mockSession(page);
  const state = { acked: new Set<string>() };
  const alerts = [
    { alertId: "a1", version: 1, ruleId: "model_not_allowed", category: "security", status: "open", occurredAt: "2026-09-12T01:00:00Z", lastSeenAt: "2026-09-12T03:00:00Z",
      windowStart: "2026-09-12T01:00:00Z", windowEnd: "2026-09-12T03:00:00Z", subject: "claude-opus-4", eventCount: 4, memberCount: 1,
      members: [{ memberId: "m1", account: "dana@example.test" }], summary: { model: "claude-opus-4", events: 4, threshold: 1 } },
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
    return json(page, route, { meta: { organizationId: new URL(route.request().url()).pathname.split("/")[4], snapshotId: "token", asOf: "2026-09-13T12:00:00Z" },
      evaluation: { availability: "available", reason: null, asOf: "2026-09-13T11:00:00Z", rules: [
        { ruleId: "spend_spike", enabled: true, evaluatedAt: "2026-09-13T11:00:00Z", status: "not_evaluated", reason: "period_incomplete", windowStart: null, windowEnd: null },
        { ruleId: "model_not_allowed", enabled: true, evaluatedAt: "2026-09-13T11:00:00Z", status: "evaluated", reason: null, windowStart: null, windowEnd: null }] },
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
  await expect(list).toContainText("모델 claude-opus-4 · 4건 · 구성원 1명");
  await expect(list).toContainText("2026-09-05~2026-09-11 $30.00 · 앞 7일 $20.00 · +50%");
  // 평가하지 않은 규칙은 0건이 아니라 사유로 보인다.
  await expect(drawer.getByRole("region", { name: "규칙별 평가" })).toContainText("평가하지 않음 · 두 기간 중 완전히 관측되지 않은 날이 있어 평가하지 않았습니다");
  await list.getByRole("listitem").filter({ hasText: "비허용 모델" }).getByRole("button", { name: /확인$/ }).click();
  await expect.poll(() => acks).toEqual([{ id: "a1", body: { expectedVersion: 1 } }]);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(kpi).toContainText("현재 미확인 · 보안 0 · 비용 1");
  await drawer.getByRole("group", { name: "알림 상태" }).getByRole("button", { name: "확인함" }).click();
  await expect(list).toContainText("확인함");
});
