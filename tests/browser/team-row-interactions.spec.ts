import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";

test("team rows open details across the row while trend checkboxes stay independent", async ({
  page,
}) => {
  await openDashboard(page, "/teams");
  const analysis = page.getByRole("region", { name: "팀별 사용량 비교" });
  const checkbox = analysis.getByRole("checkbox", {
    name: "미배정 추이 선 표시",
  });
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
  await expect(
    dialog.getByText("팀에 배정되지 않은 사용량입니다."),
  ).toBeVisible();
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
