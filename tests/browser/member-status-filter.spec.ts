import { expect, test } from "@playwright/test";
import { openDashboard } from "./helpers";

test("status header menu supports keyboard selection, search, reset and dismissal", async ({ page }) => {
  await openDashboard(page, "/members");
  const card = page.getByRole("region", { name: "구성원 목록", exact: true });
  const trigger = card.getByRole("button", { name: /^상태 필터/ });
  const menu = page.getByRole("menu", { name: "상태 필터" });
  const rows = card.getByRole("button", { name: /구성원 상세$/ });
  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: "전체", exact: true })).toBeFocused();
  await page.screenshot({ path: "test-results/member-status-menu-desktop.png" });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveText("상태: 회수 후보");
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) await expect(row.getByText("회수 후보", { exact: true })).toBeVisible();
  const account = (await rows.first().getAttribute("aria-label"))!.replace(" 구성원 상세", "");
  const search = card.getByRole("textbox", { name: "구성원 검색" });
  await search.fill(account);
  await search.press("Enter");
  await expect(rows).toHaveCount(1);
  await trigger.click();
  await expect(menu.getByRole("menuitemradio", { name: "회수 후보", exact: true })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitemradio", { name: "전체", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await search.fill("");
  await expect(rows).toHaveCount(20);
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await trigger.click();
  await expect(menu).not.toBeVisible();
  await trigger.click();
  await search.click();
  await expect(menu).not.toBeVisible();
  await expect(search).toBeFocused();
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(menu).not.toBeVisible();
  await expect(rows.first()).toBeFocused();
});

test("status menu uses theme tokens and remains inside a narrow viewport", async ({ page }) => {
  await openDashboard(page, "/members");
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole("button", { name: "내비게이션 접기/펼치기" }).click();
  const trigger = page.getByRole("button", { name: "상태 필터", exact: true });
  const menu = page.getByRole("menu", { name: "상태 필터" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await trigger.click();
    await expect(menu).toBeVisible();
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(800);
    expect(await menu.evaluate((element) => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--card)";
      element.appendChild(probe);
      const matches = getComputedStyle(element).backgroundColor === getComputedStyle(probe).backgroundColor;
      probe.remove();
      return matches;
    })).toBe(true);
    await page.screenshot({ path: `test-results/member-status-menu-${theme}.png` });
    await page.keyboard.press("Escape");
  }
});
