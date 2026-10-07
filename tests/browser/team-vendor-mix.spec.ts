import { expect, test } from "@playwright/test";
import { openDashboard } from "./helpers";
import { buildTeams, type AxisKey } from "../../src/lib/metrics/teams";

test("team mix displays product vendors and follows metric and date selection", async ({ page }) => {
  await openDashboard(page, "/teams");
  const card = page.getByRole("region", { name: "팀별 벤더 비중", exact: true });
  await expect(card).toBeVisible();
  await expect(page.getByRole("region", { name: "팀별 모델 믹스" })).toHaveCount(0);
  await expect(card.getByText("Claude", { exact: true })).toBeVisible();
  await expect(card.getByText("Codex", { exact: true })).toBeVisible();
  await expect(card).toContainText("사용량 미수집 벤더 제외");
  const model = buildTeams();
  for (const [label, axis] of [["비용", "cost"], ["토큰", "token"], ["세션", "session"]] as [string, AxisKey][]) {
    await page.getByRole("tab", { name: label, exact: true }).click();
    const expected = model.vendorMix(axis).columns;
    const bars = card.getByRole("img");
    await expect(bars).toHaveCount(expected.length);
    for (const [index, column] of expected.entries()) {
      await expect(bars.nth(index)).toHaveAttribute("aria-label", `${column.team} · ${column.totalText} · ${column.segments.map((segment) => segment.tip).join(", ")}`);
    }
  }
  await page.getByRole("toolbar", { name: "전역 필터" }).getByRole("button", { name: /^\d{4}\.\d{2}\.\d{2} ~ / }).click();
  const calendar = page.getByRole("dialog", { name: "기간 선택" });
  await calendar.getByRole("button", { name: "오늘", exact: true }).click();
  await calendar.getByRole("button", { name: "적용", exact: true }).click();
  const daily = buildTeams("prev_week", { start: "2026-09-13", end: "2026-09-13" }).vendorMix("session").columns[0];
  await expect(card.getByRole("img").first()).toHaveAttribute("aria-label", `${daily.team} · ${daily.totalText} · ${daily.segments.map((segment) => segment.tip).join(", ")}`);
  await card.screenshot({ path: "test-results/team-vendor-mix-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "내비게이션 접기/펼치기" }).click();
  await card.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.screenshot({ path: "test-results/team-vendor-mix-mobile.png" });
});
