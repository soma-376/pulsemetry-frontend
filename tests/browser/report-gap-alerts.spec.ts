import { expect, test } from "@playwright/test";
import { mockSession } from "./helpers";
import { mockOverview, testOrganizationId } from "./overview-fixture";

test("공통 알림함은 보고 공백의 확인·해소·재발을 구분하고 보안 목록에서 제외한다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  const basisAt = "2026-10-28T00:00:00Z";
  const thresholdReachedAt = "2026-11-04T00:00:00Z";
  const initial = {
    alertId: "gap-one",
    version: 1,
    ruleId: "installation_report_gap",
    category: "collection",
    status: "open",
    occurredAt: thresholdReachedAt,
    lastSeenAt: thresholdReachedAt,
    windowStart: basisAt,
    windowEnd: thresholdReachedAt,
    subject: "installation-a",
    eventCount: null,
    memberCount: 1,
    members: [{ memberId: "member-a", account: "member@example.test" }],
    evidence: {
      kind: "installation_report_gap",
      installationId: "installation-a",
      deviceName: "개발 노트북",
      basisAt,
      thresholdReachedAt,
      lastReceivedAt: basisAt,
      resolutionDetectedAt: null as string | null,
      resolutionReason: null as string | null,
    },
    acknowledgement: null as { acknowledgedAt: string } | null,
  };
  const alerts = [initial];
  const categories: (string | null)[] = [];
  await page.route("**/api/v1/organizations/*/alerts?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    categories.push(query.get("category"));
    const items = alerts.filter(
      (alert) =>
        (!query.has("category") || query.get("category") === alert.category) &&
        (query.get("status") === "all" ||
          (query.get("status") === "acknowledged") === !!alert.acknowledgement),
    );
    return route.fulfill({
      json: {
        meta: {
          organizationId: testOrganizationId,
          snapshotId: "gap-state",
          asOf: thresholdReachedAt,
        },
        evaluation: {
          status: "complete",
          reasons: [],
          asOf: thresholdReachedAt,
        },
        alerts: { items, totalCount: items.length, nextCursor: null },
      },
    });
  });
  await page.route("**/alerts/gap-one/acknowledge", (route) => {
    expect(route.request().postDataJSON()).toEqual({ expectedVersion: 1 });
    initial.acknowledgement = { acknowledgedAt: "2026-11-04T00:01:00Z" };
    return route.fulfill({
      json: {
        alertId: initial.alertId,
        version: initial.version,
        ...initial.acknowledgement,
        acknowledgedBy: "admin",
      },
    });
  });
  await page.goto("/overview");
  await page
    .getByRole("button", { name: "알림, 미확인 1건", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "알림", exact: true });
  const row = drawer.locator('[data-alert-id="gap-one"]');
  await expect(row).toContainText("보고 공백 지속");
  await expect(row).toContainText("미확인");
  await row.getByRole("button", { name: /확인$/ }).click();
  await drawer
    .getByRole("group", { name: "알림 상태" })
    .getByRole("button", { name: "전체", exact: true })
    .click();
  await expect(row).toContainText("확인함");
  await expect(row).toContainText("보고 공백 지속");
  await row.getByText("상세", { exact: true }).click();
  await expect(row).toContainText("168시간 도달");
  await expect(row).not.toContainText("위반 수");
  initial.status = "closed";
  initial.evidence.resolutionDetectedAt = "2026-11-04T00:02:00Z";
  initial.evidence.resolutionReason = "report_resumed";
  await page.reload();
  await page
    .getByRole("button", { name: "알림, 미확인 0건", exact: true })
    .click();
  await drawer
    .getByRole("group", { name: "알림 상태" })
    .getByRole("button", { name: "전체", exact: true })
    .click();
  await expect(row).toContainText("보고 재개로 해소");
  await expect(row).toContainText("확인함");
  alerts.push({
    ...initial,
    alertId: "gap-two",
    status: "open",
    acknowledgement: null,
    evidence: {
      ...initial.evidence,
      basisAt: "2026-11-04T00:02:00Z",
      thresholdReachedAt: "2026-11-11T00:02:00Z",
      resolutionDetectedAt: null,
      resolutionReason: null,
    },
  });
  await page.reload();
  await page
    .getByRole("button", { name: "알림, 미확인 1건", exact: true })
    .click();
  const recurrence = drawer.locator('[data-alert-id="gap-two"]');
  await expect(recurrence).toContainText("미확인");
  await expect(recurrence).toContainText("보고 공백 지속");
  await expect(row).toHaveCount(0);
  alerts[1].status = "closed";
  alerts[1].evidence.resolutionDetectedAt = "2026-11-11T00:03:00Z";
  alerts[1].evidence.resolutionReason = "report_resumed";
  await page.reload();
  await page
    .getByRole("button", { name: "알림, 미확인 1건", exact: true })
    .click();
  await expect(recurrence).toContainText("보고 재개로 해소");
  await expect(recurrence).toContainText("미확인");
  await expect(recurrence.getByRole("button", { name: /확인$/ })).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.goto("/security");
  const security = page.getByRole("region", { name: "보안 알림", exact: true });
  await expect(security).toContainText("미확인 보안 알림이 없습니다");
  await expect(security).not.toContainText("설치 보고 공백 알림");
  expect(categories).toContain("security");
});

for (const status of ["open", "closed"]) {
  test(`근거 없는 보고 공백도 전용 상태와 안내를 유지한다: ${status}`, async ({
    page,
  }) => {
    await mockSession(page);
    await mockOverview(page);
    await page.route("**/api/v1/organizations/*/alerts?*", (route) =>
      route.fulfill({
        json: {
          meta: {
            organizationId: testOrganizationId,
            snapshotId: "gap-null",
            asOf: "2026-11-04T00:00:00Z",
          },
          evaluation: {
            status: "complete",
            reasons: [],
            asOf: "2026-11-04T00:00:00Z",
          },
          alerts: {
            items: [
              {
                alertId: "gap-null",
                version: 1,
                ruleId: "installation_report_gap",
                category: "collection",
                status,
                occurredAt: "2026-11-04T00:00:00Z",
                lastSeenAt: "2026-11-04T00:00:00Z",
                windowStart: "2026-10-28T00:00:00Z",
                windowEnd: "2026-11-04T00:00:00Z",
                subject: "installation-a",
                eventCount: null,
                memberCount: 0,
                members: [],
                evidence: null,
                acknowledgement: null,
              },
            ],
            totalCount: 1,
            nextCursor: null,
          },
        },
      }),
    );
    await page.goto("/overview");
    await page
      .getByRole("button", { name: "알림, 미확인 1건", exact: true })
      .click();
    const row = page.locator('[data-alert-id="gap-null"]');
    await expect(row).toContainText(
      status === "open" ? "보고 공백 지속" : "보고 공백 종료",
    );
    await expect(row).toContainText("설치 보고 근거를 확인할 수 없습니다");
    await row.getByText("상세", { exact: true }).click();
    await expect(row).toContainText(
      "단순 보고 공백은 전송 손실이나 사용 이벤트 수가 아닙니다",
    );
    await expect(row).not.toContainText("위반 수");
    await expect(row).not.toContainText("묶음 구간");
    await expect(row.getByText("설치 ID", { exact: true })).toHaveCount(0);
  });
}
