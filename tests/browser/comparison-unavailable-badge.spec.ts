import { expect, authenticatedTest as test } from "./fixtures";
import { mockIngestStatus, mockOverview } from "./overview-fixture";
import { mockTeams } from "./teams-fixture";

const unavailable = {
  status: "unavailable" as const,
  reasons: ["previous_period_incomplete"],
  previousValue: null,
  absoluteChange: null,
  percentChange: null,
  change: null,
};

// 데이터 품질 배지는 PROJ-319에서 정리했지만 비교 불가는 증감 자리가 비는 이유라 남긴다.
test("개요 KPI와 팀별 요약은 비교할 수 없는 증감 자리에 비교 불가와 사유를 보여 준다", async ({
  page,
}) => {
  await mockOverview(page, (data) => {
    data.summary!.equivalentCostUsd.comparison = unavailable;
    data.teamUsage!.topTeams[0].equivalentCostUsd.comparison = unavailable;
  });
  await page.goto("/overview?startDate=2026-09-07&endDate=2026-09-13");

  const cost = page.getByRole("region", { name: "사용 환산액", exact: true });
  const badge = cost.getByLabel(/^비교 불가: /);
  await expect(badge).toBeVisible();
  await expect(cost).toContainText("전주 대비");
  const tip = badge.locator('span[aria-hidden="true"]');
  await expect(tip).toBeHidden();
  await badge.focus();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("비교 기간");

  const table = page.getByRole("table", { name: "팀별 요약", exact: true });
  const rows = table.locator("tbody tr");
  await expect(rows.first().getByLabel(/^비교 불가: /)).toBeVisible();
  await expect(rows.nth(1).getByLabel(/^비교 불가: /)).toHaveCount(0);
});

test("팀별 사용량 비교는 비교할 수 없는 팀의 증감 자리에 비교 불가를 보여 준다", async ({
  page,
}) => {
  await mockIngestStatus(page);
  await mockTeams(page, {
    modify: (data) => {
      Object.assign(
        data.teams.items[0].metrics.equivalentCostUsd.comparison,
        unavailable,
      );
    },
  });
  await page.goto("/teams?startDate=2026-09-07&endDate=2026-09-13");
  const card = page.getByRole("region", {
    name: "팀별 사용량 비교",
    exact: true,
  });
  await expect(card.getByLabel(/^비교 불가: /)).toHaveCount(1);
});
