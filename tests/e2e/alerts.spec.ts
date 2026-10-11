import type { Page } from "@playwright/test";
import {
  expect,
  test,
  dashboardBase,
  enrollmentBase,
  seedOrganizations,
} from "./fixtures";
import {
  authenticatedRequest,
  seedPeriod,
  selectPeriod,
  signIn,
} from "./helpers";
import { PreparationError } from "./harness";

// 현재 규칙의 저장·확인 흐름을 검증한다. 과거 모델·도구 알림도 확인 이력으로 남아 있을 수 있다.
const A = seedOrganizations[0];

type Rule = {
  ruleId: string;
  enabled: boolean;
  availability: string;
  reason: string | null;
  version: number;
};
const settings = async (page: Page) =>
  (
    await authenticatedRequest(
      page,
      dashboardBase(),
      `/api/v1/organizations/${A.id}/settings`,
    )
  ).body as { alertRules: Rule[] };
const overviewAlerts = async (page: Page) => {
  const { start, end } = seedPeriod();
  return (
    await authenticatedRequest(
      page,
      dashboardBase(),
      `/api/v1/organizations/${A.id}/analytics/overview?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul`,
    )
  ).body.alerts as {
    availability: string;
    reason: string | null;
    unacknowledgedTotal: number | null;
    security: number | null;
    cost: number | null;
  };
};

test("ALERTS-RULES @p0 @write 미등록 제품 알림의 켜짐은 새로고침 뒤에도 남는다", async ({
  page,
}) => {
  await signIn(page, "owner@seed-" + A.seed + ".example.test");
  const before = (await settings(page)).alertRules.find(
    (rule) => rule.ruleId === "product_not_registered",
  );
  if (!before)
    throw new PreparationError(
      "등록 제품 기준 알림 마이그레이션을 적용한 서버가 필요합니다.",
    );
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "알림 규칙", exact: true });
  const toggle = section.getByRole("button", {
    name: "미등록 제품 사용 알림",
    exact: true,
  });
  try {
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute(
      "aria-pressed",
      String(before.enabled),
    );
    await expect(
      section.getByRole("button", { name: "한도 초과 알림", exact: true }),
    ).toBeDisabled();
    await toggle.click();
    await expect(toggle).toHaveAttribute(
      "aria-pressed",
      String(!before.enabled),
    );
    await page.reload();
    await expect(toggle).toHaveAttribute(
      "aria-pressed",
      String(!before.enabled),
    );
    expect(
      (await settings(page)).alertRules.find(
        (rule) => rule.ruleId === "product_not_registered",
      ),
    ).toMatchObject({
      enabled: !before.enabled,
      availability: "available",
      reason: null,
    });
  } finally {
    const latest = (await settings(page)).alertRules.find(
      (rule) => rule.ruleId === "product_not_registered",
    )!;
    if (latest.enabled !== before.enabled) {
      const restored = await authenticatedRequest(
        page,
        enrollmentBase(),
        "/api/v1/organizations/" +
          A.id +
          "/settings/alert-rules/product_not_registered",
        "PATCH",
        { expectedVersion: latest.version, enabled: before.enabled },
      );
      expect(restored.status).toBe(200);
    }
  }
});

test("ALERTS-ACK @p0 @write 개요의 알림 건수는 서버의 미확인 수이고, 목록에서 확인하면 줄어든 채 새로고침 뒤에도 남는다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  // 선행 조건: 서버의 주기 평가(로컬 1분)가 켜진 규칙을 모두 한 번은 평가했다 — 규칙별 평가 시각(알림 목록의 evaluation.rules)으로 본다.
  // 개요의 availability 는 첫 평가 회차 도중에도 available 이 될 수 있어(규칙 하나라도 기록되면) 그것만으로는 기다리지 않는다.
  const rulesEvaluated = async () => {
    const response = await authenticatedRequest(
      page,
      dashboardBase(),
      `/api/v1/organizations/${A.id}/alerts?limit=1`,
    );
    const rules = (response.body?.evaluation?.rules ?? []) as {
      enabled: boolean;
      evaluatedAt: string | null;
    }[];
    return (
      response.status === 200 &&
      rules.some((rule) => rule.enabled) &&
      rules
        .filter((rule) => rule.enabled)
        .every((rule) => rule.evaluatedAt !== null)
    );
  };
  await expect
    .poll(rulesEvaluated, { timeout: 120_000, intervals: [2_000] })
    .toBe(true);
  expect((await overviewAlerts(page)).availability).toBe("available");
  const before = await overviewAlerts(page);
  if (!before.unacknowledgedTotal)
    throw new PreparationError(
      "미확인 알림이 있는 격리 테스트 데이터가 필요합니다. 새 시드 A는 관측 제품이 모두 등록되어 자동으로 보안 알림을 만들지 않습니다.",
    );
  expect(before.security! + before.cost!).toBe(before.unacknowledgedTotal);

  const { start, end } = seedPeriod();
  await page.goto("/overview");
  await selectPeriod(page, start, end);
  const kpi = page.getByRole("region", {
    name: "보안 경보 및 알림",
    exact: true,
  });
  await expect(kpi).toContainText(
    `현재 미확인 · 보안 ${before.security} · 비용 ${before.cost}`,
  );
  await expect(kpi).toContainText(String(before.unacknowledgedTotal));
  await kpi.getByRole("button", { name: "알림 보기", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "알림", exact: true });
  const list = drawer.getByRole("list", { name: "알림 목록" });
  await expect(list.getByRole("listitem")).toHaveCount(
    Math.min(before.unacknowledgedTotal, 20),
  );
  await expect(
    drawer.getByRole("region", { name: "규칙별 평가" }),
  ).toContainText("미등록 제품 사용 알림");
  const first = list.getByRole("listitem").first();
  const alertId = await first.getAttribute("data-alert-id");
  await first.getByRole("button", { name: /확인$/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "알림을 확인했습니다." }),
  ).toBeVisible();
  await expect(list.locator(`li[data-alert-id="${alertId}"]`)).toHaveCount(0);
  // 서버의 미확인 수가 하나 줄었고 화면은 그 값이다(화면이 세지 않는다).
  const after = await overviewAlerts(page);
  expect(after.unacknowledgedTotal).toBe(before.unacknowledgedTotal - 1);
  await expect(kpi).toContainText(
    `현재 미확인 · 보안 ${after.security} · 비용 ${after.cost}`,
  );

  // 새로고침 뒤에도 서버의 확인 기록이 남아 있다.
  await page.reload();
  await selectPeriod(page, start, end);
  await expect(
    page.getByRole("region", { name: "보안 경보 및 알림", exact: true }),
  ).toContainText(`현재 미확인 · 보안 ${after.security} · 비용 ${after.cost}`);
  await page
    .getByRole("region", { name: "보안 경보 및 알림", exact: true })
    .getByRole("button", { name: "알림 보기", exact: true })
    .click();
  await drawer
    .getByRole("group", { name: "알림 상태" })
    .getByRole("button", { name: "확인함" })
    .click();
  await expect(
    drawer
      .getByRole("list", { name: "알림 목록" })
      .locator(`li[data-alert-id="${alertId}"]`),
  ).toContainText("확인함");
  await page.keyboard.press("Escape");
});
