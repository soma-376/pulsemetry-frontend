import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { testOrganizationId } from "./overview-fixture";
import { teamsFixture } from "./teams-fixture";
import { presentTeams, type AxisKey } from "../../src/lib/metrics/teams-presentation";
import type { TeamsView } from "../../src/lib/api/teams";

test("team mix displays server product usage, keeps unmapped observations separate and follows metric and date selection", async ({ page }) => {
  await openDashboard(page, "/teams");
  const card = page.getByRole("region", { name: "팀별 벤더 비중", exact: true });
  await expect(card).toBeVisible();
  await expect(page.getByRole("region", { name: "팀별 모델 믹스" })).toHaveCount(0);
  for (const name of ["Claude (Anthropic)", "ChatGPT / Codex (OpenAI)", "미확인 제품"]) await expect(card.getByText(name, { exact: true })).toBeVisible();
  await expect(card).toContainText("사용량 미수집 벤더 제외");
  // 화면이 받은 것과 같은 fixture 응답의 팀별 제품 값에서 기대값을 만든다.
  const data = teamsFixture(new URL(`http://fixture/api/v1/organizations/${testOrganizationId}/analytics/teams?startDate=2026-09-07&endDate=2026-09-13&compare=prev_week`));
  const model = presentTeams({ ...data, teams: data.teams.items } as unknown as TeamsView);
  for (const [label, axis] of [["비용", "cost"], ["토큰", "token"], ["세션", "session"]] as [string, AxisKey][]) {
    await page.getByRole("tab", { name: label, exact: true }).click();
    const expected = model.productMix(axis).columns;
    const bars = card.getByRole("img");
    await expect(bars).toHaveCount(expected.length);
    for (const [index, column] of expected.entries()) {
      await expect(bars.nth(index)).toHaveAttribute("aria-label", `${column.team} · ${column.totalText} · ${column.segments.map((segment) => segment.tip).join(", ")}`);
    }
  }
  // 미배정의 매핑 없는 관측은 따로 쌓인다.
  await expect(card.getByRole("img", { name: /^미배정 · / })).toHaveAttribute("aria-label", /미확인 제품 33\.3%/);
  await page.getByRole("toolbar", { name: "전역 필터" }).getByRole("button", { name: /^\d{4}\.\d{2}\.\d{2} ~ / }).click();
  const calendar = page.getByRole("dialog", { name: "기간 선택" });
  await calendar.getByRole("button", { name: "오늘", exact: true }).click();
  await calendar.getByRole("button", { name: "적용", exact: true }).click();
  // 오늘 하루를 다시 조회했다(시작일 = 종료일).
  await expect(page.getByRole("status").filter({ hasText: "팀별 비교" })).toContainText(/팀별 비교 · (\d{4}-\d{2}-\d{2}) ~ \1/);
  await card.screenshot({ path: "test-results/team-vendor-mix-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "내비게이션 접기/펼치기" }).click();
  await card.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.screenshot({ path: "test-results/team-vendor-mix-mobile.png" });
});
