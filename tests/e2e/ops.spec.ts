import { readFile } from "node:fs/promises";
import { dashboardBase, expect, test, seedOrganizations } from "./fixtures";
import { authenticatedRequest, signIn } from "./helpers";
import { PreparationError } from "./harness";

// 운영 · 보안 — 보안 범주 알림(미등록 제품 사용 및 과거 알림 이력)의 목록·상세·확인. 기대값은 같은 조건의 알림 API 와 서버 명세(평가 전제 사유)에서 쓴다.
const [A, B] = seedOrganizations;
type AlertsBody = { evaluation: { availability: string; reason: string | null; rules: { ruleId: string; enabled: boolean; evaluatedAt: string | null }[] };
  alerts: { totalCount: number; items: { alertId: string; ruleId: string; category: string; subject: string | null }[] } };

test("OPS-A @p1 @write 운영 · 보안은 보안 범주 알림을 목록·상세·확인으로 보이고, 확인은 새로고침 뒤에도 남으며, CSV 는 같은 조건의 알림이다", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  const alerts = async (status: string) => (await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/alerts?status=${status}&category=security&limit=100`)).body as AlertsBody;
  // 선행 조건: 켜진 보안 규칙을 서버의 주기 평가(로컬 1분)가 한 번은 평가했다.
  await expect.poll(async () => {
    const rules = (await alerts("unacknowledged")).evaluation.rules.filter((rule) => rule.enabled && rule.ruleId === "product_not_registered");
    return rules.every((rule) => rule.evaluatedAt !== null);
  }, { timeout: 120_000, intervals: [2_000] }).toBe(true);
  const before = await alerts("unacknowledged");
  if (!before.alerts.totalCount) throw new PreparationError("미확인 보안 알림이 있는 격리 테스트 데이터가 필요합니다. 새 시드 A에서는 미등록 제품 알림이 기본 꺼짐이며 모든 관측 제품이 등록되어 있습니다.");
  expect(before.alerts.items.every((item) => item.category === "security")).toBe(true);

  await page.goto("/ops");
  const panel = page.getByRole("main").getByRole("region", { name: "보안 알림" });
  const list = panel.getByRole("list", { name: "알림 목록" });
  await expect(list.getByRole("listitem")).toHaveCount(Math.min(before.alerts.totalCount, 20));
  await expect(panel).toContainText(`${before.alerts.totalCount}건`);
  await expect(page.getByRole("main")).toContainText("세션 조회와 감사 로그는 이 화면의 범위가 아닙니다");
  const first = list.getByRole("listitem").first();
  const alertId = (await first.getAttribute("data-alert-id"))!;
  const target = before.alerts.items.find((item) => item.alertId === alertId)!;
  await first.getByText("상세", { exact: true }).click();
  await expect(first.getByRole("definition").filter({ hasText: target.ruleId })).toBeVisible();
  if (target.subject) await expect(first.getByRole("definition").filter({ hasText: target.subject })).toBeVisible();

  await first.getByRole("button", { name: /확인$/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "알림을 확인했습니다." })).toBeVisible();
  await expect(list.locator(`li[data-alert-id="${alertId}"]`)).toHaveCount(0);
  expect((await alerts("unacknowledged")).alerts.totalCount).toBe(before.alerts.totalCount - 1);

  await page.reload();
  await panel.getByRole("group", { name: "알림 상태" }).getByRole("button", { name: "확인함" }).click();
  await expect(list.locator(`li[data-alert-id="${alertId}"]`)).toContainText("확인함");
  // CSV — 화면의 조건(보안·확인함)의 알림 전부.
  const acknowledged = await alerts("acknowledged");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const text = await readFile((await (await download).path())!, "utf8");
  expect(text).toContain("범주,security\r\n");
  expect(text).toContain("상태,acknowledged\r\n");
  const rows = text.split("\r\n").filter((line) => line.startsWith("alerts,"));
  expect(rows).toHaveLength(acknowledged.alerts.totalCount);
  expect(rows.some((line) => line.startsWith(`alerts,${alertId},`))).toBe(true);
});

test("OPS-EMPTY-B @p1 @read 규칙을 켜지 않은 조직의 운영 · 보안은 빈 상태와 평가 전제 사유를 보인다", async ({ page }) => {
  await signIn(page, `owner@seed-${B.seed}.example.test`);
  const api = (await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${B.id}/alerts?status=unacknowledged&category=security`)).body as AlertsBody;
  // 대시보드 명세: 켠 규칙이 없으면 평가는 unavailable·evaluation_not_configured 이고 알림은 없다.
  expect(api.evaluation).toMatchObject({ availability: "unavailable", reason: "evaluation_not_configured" });
  await page.goto("/ops");
  const panel = page.getByRole("main").getByRole("region", { name: "보안 알림" });
  await expect(panel).toContainText("미확인 보안 알림이 없습니다");
  await expect(panel.getByRole("region", { name: "규칙별 평가" })).toContainText("켜진 알림 규칙이 없습니다");
});
