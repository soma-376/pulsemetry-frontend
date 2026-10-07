import { openDashboard } from "./helpers";
import { expect, test, type Page } from "@playwright/test";

async function selectCalendarPreset(page: Page, preset: string) {
  await page.getByRole("toolbar", { name: "전역 필터" }).getByRole("button", { name: /^\d{4}\.\d{2}\.\d{2} ~ / }).click();
  const calendar = page.getByRole("dialog", { name: "기간 선택" });
  await calendar.getByRole("button", { name: preset, exact: true }).click();
  await calendar.getByRole("button", { name: "적용", exact: true }).click();
}

test.beforeEach(async ({ page }) => { await openDashboard(page, "/overview"); });

test("filters update data and chart; incomplete and empty queries are explicit", async ({ page }) => {
  const chart = page.getByRole("slider");
  await expect(chart).toHaveAttribute("aria-valuemax", "7");
  await selectCalendarPreset(page, "오늘");
  await expect(chart).toHaveAttribute("aria-valuemax", "1");
  await expect(page.getByRole("button", { name: "2026.09.13 ~ 2026.09.13", exact: true })).toBeVisible();
  await expect(page.getByText("조직 전체 · 2026-09-13 ~ 2026-09-13")).toBeVisible();
  await selectCalendarPreset(page, "이번 달");
  await expect(chart).toHaveAttribute("aria-valuemax", "13");
  await selectCalendarPreset(page, "최근 1년");
  await expect(page.getByText("데이터가 없는 날짜는 차트에서 제외됩니다. 전체 기간 비교는 보류합니다.")).toBeVisible();
  await expect(chart).toHaveAttribute("aria-valuemax", "63");
  await selectCalendarPreset(page, "이번 주");
  await page.getByRole("button", { name: "2026.09.07 ~ 2026.09.13", exact: true }).click();
  const calendar = page.getByRole("dialog", { name: "기간 선택" });
  await calendar.getByRole("button", { name: "다음 달" }).click();
  await calendar.locator('[title="2026-10-05"]').click();
  await expect(calendar.getByRole("button", { name: "적용" })).toBeDisabled();
  await calendar.locator('[title="2026-10-07"]').click();
  await expect(chart).toHaveAttribute("aria-valuemax", "7"); // Draft has not been applied.
  await calendar.getByRole("button", { name: "적용" }).click();
  await expect(page.getByRole("button", { name: "2026.10.05 ~ 2026.10.07", exact: true })).toBeVisible();
  await expect(page.getByText("선택한 기간에 데이터가 없습니다")).toBeVisible();
  await expect(page.getByRole("table", { name: "계약·좌석 현황" })).toBeVisible();
});

test("chart supports pointer inspection and keyboard date navigation", async ({ page }) => {
  const chart = page.getByRole("slider");
  await chart.hover({ position: { x: 30, y: 150 } });
  await expect(chart.getByText("환산가치", { exact: true })).toBeVisible();
  await chart.focus();
  await chart.press("Home");
  await expect(chart).toHaveAttribute("aria-valuetext", /2026-09-07/);
  await expect(chart).toHaveAttribute("aria-valuetext", /Claude.*Codex/);
  await chart.press("ArrowRight");
  await expect(chart).toHaveAttribute("aria-valuetext", /2026-09-08/);
  await chart.press("End");
  await expect(chart).toHaveAttribute("aria-valuetext", /2026-09-13/);
  await chart.press("Escape");
  await expect(chart.getByText("환산가치", { exact: true })).not.toBeVisible();
});

test("overview summary links to the team analysis drawer", async ({ page }) => {
  const mix = page.getByRole("region", { name: "모델 구성", exact: true });
  await expect(mix).toBeVisible();
  const modelOption = mix.getByRole("button", { name: /gpt-5-codex/ });
  await modelOption.click();
  await expect(modelOption).toHaveAttribute("aria-pressed", "true");
  await mix.getByRole("button", { name: "선택 해제" }).click();
  await expect(modelOption).toHaveAttribute("aria-pressed", "false");
  const table = page.getByRole("table", { name: "팀별 요약" });
  await expect(table.locator("tbody tr")).toHaveCount(6);
  await expect(table.locator("tbody tr").last()).toContainText("미배정");
  await expect(table).toContainText("Claude · Codex");
  await table.getByRole("button", { name: /사용 환산액/ }).click();
  await expect(table.getByRole("columnheader", { name: /사용 환산액/ })).toHaveAttribute("aria-sort", "ascending");
  await table.getByRole("link", { name: "플랫폼", exact: true }).click();
  await expect(page).toHaveURL(/\/teams\?team=team-1$/);
  const analysis = page.getByRole("region", { name: "팀별 사용량 비교" });
  const dialog = page.getByRole("dialog", { name: "플랫폼 팀" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "상세 패널 닫기" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByLabel("플랫폼 팀 내용")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "상세 패널 닫기" })).toBeFocused();
  await expect(dialog.locator(":scope > div")).toHaveCSS("opacity", "1");
  await expect(dialog.locator(":scope > div > section")).toHaveCSS("transform", "none");
  await page.screenshot({ path: "test-results/team-detail.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(analysis.getByRole("checkbox", { name: "플랫폼 추이 선 표시" })).toBeChecked();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("small viewport and reduced motion keep content usable", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "내비게이션 접기/펼치기" }).click();
  await selectCalendarPreset(page, "이번 달");
  await expect(page.getByRole("slider")).toHaveAttribute("aria-valuemax", "13");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.getByRole("link", { name: /전체 5팀 보기/ }).click();
  await page.getByRole("region", { name: "팀별 사용량 비교" }).getByRole("button", { name: "플랫폼", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "플랫폼 팀" })).toBeVisible();
  await page.getByRole("button", { name: "상세 패널 닫기" }).click();
  await expect(page.getByRole("dialog", { name: "플랫폼 팀" })).not.toBeVisible();
  await page.getByRole("main").evaluate((element) => element.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/teams-small.png", fullPage: true });
});

test("team rows open details across the row while trend checkboxes stay independent", async ({ page }) => {
  await openDashboard(page, "/teams");
  const analysis = page.getByRole("region", { name: "팀별 사용량 비교" });
  const checkbox = analysis.getByRole("checkbox", { name: "미배정 추이 선 표시" });
  const row = checkbox.locator("..").locator("..");
  await page.getByRole("heading", { name: "팀 분석", exact: true }).hover();
  await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await row.hover();
  await expect(row).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(row).toHaveCSS("cursor", "pointer");
  const trigger = analysis.getByRole("button", { name: "미배정", exact: true });
  const dialog = page.getByRole("dialog", { name: "미배정", exact: true });
  const size = await row.boundingBox();
  // Clicking the numeric area and the far-right arrow both opens the same drawer.
  await row.click({ position: { x: size!.width / 2, y: size!.height / 2 } });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(checkbox).toBeChecked();
  await expect(row.locator(":scope > span").last()).toHaveText("›");
  await row.click({ position: { x: size!.width - 12, y: size!.height / 2 } });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  await expect(dialog).not.toBeVisible();
  await trigger.focus();
  await trigger.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("팀에 배정되지 않은 사용량입니다.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(checkbox).not.toBeChecked();
  await checkbox.focus();
  await checkbox.press("Space");
  await expect(checkbox).toBeChecked();
  await expect(dialog).not.toBeVisible();
  await trigger.focus();
  await trigger.press("Space");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("heading", { name: "팀 분석", exact: true }).hover();
  await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("overview has no browser errors and sidebar stays viewport height", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openDashboard(page, "/overview");
  await expect(page.getByRole("slider")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "주 내비게이션" });
  await expect(nav).toHaveCSS("height", "1000px");
  const main = page.getByRole("main");
  await expect(main.locator("..")).toHaveCSS("width", "1440px");
  await expect(main.locator("..")).toHaveCSS("overflow", "hidden");
  await main.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect((await nav.boundingBox())?.y).toBe(0);
  await main.evaluate((element) => element.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/overview-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
