import type { Page } from "@playwright/test";
import { expect, test, dashboardBase, seedOrganizations } from "./fixtures";
import { authenticatedRequest, seedPeriod, selectPeriod, signIn } from "./helpers";
import { PreparationError } from "./harness";

// 백엔드 tools/dev-seed/README.md 의 A 알림 규칙: 기준일 7일 전 급증·비허용 모델·미승인 도구를 켰고, 모델 허용 목록 밖의 Opus·o3 호출이 있어
// dashboard-api 의 주기 평가(로컬 1분)가 돌면 비허용 모델 알림이 생긴다. 한도 초과는 근거가 없어 켤 수 없다(백엔드 ADR 0051).
const A = seedOrganizations[0];
const TOOLS = ["Bash", "Edit", "Read", "Write"];

type Rule = { ruleId: string; enabled: boolean; availability: string; reason: string | null; version: number };
const settings = async (page: Page) => (await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/settings`)).body as
  { alertRules: Rule[]; alertLists: { approvedTools: { entries: string[]; version: number } } };
const overviewAlerts = async (page: Page) => {
  const { start, end } = seedPeriod();
  return (await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/analytics/overview?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul`)).body.alerts as
    { availability: string; reason: string | null; unacknowledgedTotal: number | null; security: number | null; cost: number | null };
};

test("ALERTS-RULES @p0 @write 목록을 비우면 규칙을 켤 수 없고, 목록을 저장하면 서버가 켤 수 있다고 바꾸며 새로고침 뒤에도 남는다", async ({ page }) => {
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "알림 규칙", exact: true });
  const tool = section.getByRole("button", { name: "미승인 도구 연결 알림", exact: true });
  const list = section.getByRole("textbox", { name: "승인 도구 목록", exact: true });
  const save = section.getByRole("button", { name: "승인 도구 목록 저장", exact: true });
  // 시드 상태: 세 규칙이 켜져 있고 한도 초과는 근거가 없다.
  await expect(tool).toHaveAttribute("aria-pressed", "true");
  await expect(section.getByRole("button", { name: "한도 초과 알림", exact: true })).toBeDisabled();
  await expect(section).toContainText("한도 초과를 가리키는 검증된 관측이 없어 켤 수 없습니다");
  await expect(list).toHaveValue(TOOLS.join("\n"));

  // 켜진 규칙이 쓰는 목록은 비울 수 없다(422) — 입력은 그대로 남는다.
  await list.fill("");
  await save.click();
  await expect(section).toContainText("켜진 규칙이 쓰는 목록은 비울 수 없습니다");
  await expect(list).toHaveValue("");

  // 끄고 비우면 서버가 그 규칙을 켤 수 없다고 한다.
  await tool.click();
  await expect(tool).toHaveAttribute("aria-pressed", "false");
  await save.click();
  await expect(tool).toBeDisabled();
  await expect(section).toContainText("승인 도구 목록을 먼저 입력하세요");
  await expect.poll(async () => (await settings(page)).alertRules.find((rule) => rule.ruleId === "tool_unapproved")).toMatchObject({
    enabled: false, availability: "unavailable", reason: "approved_tools_not_configured" });

  // 목록을 채우면 켤 수 있다 — 시드의 목록으로 되돌리고 다시 켠다.
  await list.fill(TOOLS.join("\n"));
  await save.click();
  await expect(tool).toBeEnabled();
  await tool.click();
  await expect(tool).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("region", { name: "알림 규칙", exact: true }).getByRole("button", { name: "미승인 도구 연결 알림", exact: true })).toHaveAttribute("aria-pressed", "true");
  const stored = await settings(page);
  expect(stored.alertRules.find((rule) => rule.ruleId === "tool_unapproved")).toMatchObject({ enabled: true, availability: "available", reason: null });
  expect(stored.alertLists.approvedTools.entries).toEqual(TOOLS);
});

test("ALERTS-ACK @p0 @write 개요의 알림 건수는 서버의 미확인 수이고, 목록에서 확인하면 줄어든 채 새로고침 뒤에도 남는다", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  // 선행 조건: 서버의 주기 평가(로컬 1분)가 켜진 규칙을 모두 한 번은 평가했다 — 규칙별 평가 시각(알림 목록의 evaluation.rules)으로 본다.
  // 개요의 availability 는 첫 평가 회차 도중에도 available 이 될 수 있어(규칙 하나라도 기록되면) 그것만으로는 기다리지 않는다.
  const rulesEvaluated = async () => {
    const response = await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/alerts?limit=1`);
    const rules = (response.body?.evaluation?.rules ?? []) as { enabled: boolean; evaluatedAt: string | null }[];
    return response.status === 200 && rules.some((rule) => rule.enabled) && rules.filter((rule) => rule.enabled).every((rule) => rule.evaluatedAt !== null);
  };
  await expect.poll(rulesEvaluated, { timeout: 120_000, intervals: [2_000] }).toBe(true);
  expect((await overviewAlerts(page)).availability).toBe("available");
  const before = await overviewAlerts(page);
  if (!before.unacknowledgedTotal) throw new PreparationError("시드 A 에 미확인 알림이 없습니다. 이 테스트는 실행마다 하나를 확인합니다 — " +
    "격리 DB 에서 `DELETE FROM enrollment.alert_acknowledgements WHERE tenant_id = '" + A.id + "'` 로 확인 기록을 지우거나 시드를 초기화하세요.");
  expect(before.security! + before.cost!).toBe(before.unacknowledgedTotal);

  const { start, end } = seedPeriod();
  await page.goto("/overview");
  await selectPeriod(page, start, end);
  const kpi = page.getByRole("region", { name: "보안 경보 및 알림", exact: true });
  await expect(kpi).toContainText(`현재 미확인 · 보안 ${before.security} · 비용 ${before.cost}`);
  await expect(kpi).toContainText(String(before.unacknowledgedTotal));
  await kpi.getByRole("button", { name: "알림 보기", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "알림", exact: true });
  const list = drawer.getByRole("list", { name: "알림 목록" });
  await expect(list.getByRole("listitem")).toHaveCount(Math.min(before.unacknowledgedTotal, 20));
  await expect(drawer.getByRole("region", { name: "규칙별 평가" })).toContainText("비허용 모델 호출 알림");
  const first = list.getByRole("listitem").first();
  const alertId = await first.getAttribute("data-alert-id");
  await expect(first).toContainText(/모델 (claude-opus-4|o3) · \d+건 · 구성원 \d+명/);
  await first.getByRole("button", { name: /확인$/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "알림을 확인했습니다." })).toBeVisible();
  await expect(list.locator(`li[data-alert-id="${alertId}"]`)).toHaveCount(0);
  // 서버의 미확인 수가 하나 줄었고 화면은 그 값이다(화면이 세지 않는다).
  const after = await overviewAlerts(page);
  expect(after.unacknowledgedTotal).toBe(before.unacknowledgedTotal - 1);
  await expect(kpi).toContainText(`현재 미확인 · 보안 ${after.security} · 비용 ${after.cost}`);

  // 새로고침 뒤에도 서버의 확인 기록이 남아 있다.
  await page.reload();
  await selectPeriod(page, start, end);
  await expect(page.getByRole("region", { name: "보안 경보 및 알림", exact: true })).toContainText(`현재 미확인 · 보안 ${after.security} · 비용 ${after.cost}`);
  await page.getByRole("region", { name: "보안 경보 및 알림", exact: true }).getByRole("button", { name: "알림 보기", exact: true }).click();
  await drawer.getByRole("group", { name: "알림 상태" }).getByRole("button", { name: "확인함" }).click();
  await expect(drawer.getByRole("list", { name: "알림 목록" }).locator(`li[data-alert-id="${alertId}"]`)).toContainText("확인함");
  await page.keyboard.press("Escape");
});
