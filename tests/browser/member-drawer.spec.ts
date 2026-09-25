import { expect, test } from "@playwright/test";
import { openDashboard } from "./helpers";

test("row opens the standard-width drawer with vendor-specific seats and independent role edits", async ({ page }) => {
  await openDashboard(page, "/members");
  const members = page.getByRole("region", { name: "구성원 목록", exact: true });
  const initialRows = members.getByRole("button", { name: /구성원 상세$/ });
  await expect(initialRows).toHaveCount(20);
  for (const state of ["활성", "회수 후보", "신호 대기"]) {
    expect(await initialRows.filter({ has: page.getByText(state, { exact: true }) }).count()).toBeGreaterThanOrEqual(3);
  }
  const activeColor = await members.getByText("활성", { exact: true }).first().evaluate((element) => getComputedStyle(element).color);
  await members.screenshot({ path: "test-results/member-status-first-page.png" });
  await members.getByRole("textbox", { name: "구성원 검색" }).fill("jiwon.kim@codeworks.io");
  const row = members.getByRole("button", { name: "jiwon.kim@codeworks.io 구성원 상세", exact: true });
  await expect(members.getByText("벤더 좌석", { exact: true })).toHaveCount(0);
  await expect(members.getByRole("button", { name: "수정", exact: true })).toHaveCount(0);
  await expect(row.getByText("활성", { exact: true })).toHaveCount(0);
  await expect(row.getByText("회수 후보", { exact: true })).toBeVisible();
  await row.focus();
  await row.press("Enter");
  const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  await expect(drawer).toBeVisible();
  const panel = drawer.locator("section").first();
  await expect(panel).toHaveCSS("max-width", "480px");
  const seats = drawer.getByRole("list", { name: "벤더별 좌석 상세" });
  await expect(seats.getByRole("listitem").filter({ hasText: "Claude" })).toContainText("회수 후보");
  await expect(seats.getByRole("listitem").filter({ hasText: "Codex" })).toContainText("활성");
  await expect(seats.getByText("활성", { exact: true })).toHaveCSS("color", activeColor);
  await expect(drawer).not.toContainText("워크스페이스");
  await expect(drawer).not.toContainText("데모");
  await expect(seats).toContainText("2026.09.12 10:30");
  await expect(seats.getByRole("button", { name: "Claude 표준 좌석 회수", exact: true })).toBeVisible();
  await expect(seats.getByRole("listitem").filter({ hasText: "Codex" }).getByRole("button")).toHaveCount(0);
  await seats.getByRole("button", { name: "Claude 표준 좌석 회수", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "좌석 회수 확인", exact: true });
  await expect(confirmation).toContainText("Claude");
  await expect(confirmation).toContainText("좌석 배정은 변경되지 않았습니다");
  await confirmation.getByRole("button", { name: "닫기", exact: true }).last().click();
  await expect(confirmation).not.toBeVisible();
  await expect(drawer).toBeVisible();
  const originalSeats = await seats.innerText();
  await drawer.getByLabel("역할", { exact: true }).selectOption("viewer");
  await drawer.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(drawer.getByRole("button", { name: "변경사항 저장" })).toBeDisabled();
  await expect(drawer.getByRole("status")).toContainText("변경했습니다");
  expect(await seats.innerText()).toBe(originalSeats);
  await page.screenshot({ path: "test-results/member-drawer-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await seats.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/member-drawer-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(row).toBeFocused();
});

test("candidate entry opens the same drawer and highlights the exact vendor seat", async ({ page }) => {
  await openDashboard(page, "/members");
  const candidates = page.getByRole("region", { name: "좌석 회수 후보", exact: true });
  await candidates.getByRole("button", { name: "seoyeon.kim@codeworks.io Codex 표준 좌석 상세", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  await expect(drawer).toContainText("seoyeon.kim@codeworks.io");
  await expect(drawer.locator('[data-highlighted="true"]')).toContainText("Codex");
  await expect(drawer.getByRole("listitem")).toHaveCount(2);
  await drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
  await expect(drawer).not.toBeVisible();
  await page.getByRole("link", { name: "설정", exact: true }).click();
  await page.getByLabel("좌석 회수 기준", { exact: true }).selectOption("30");
  await page.getByRole("link", { name: "구성원", exact: true }).click();
  await expect(candidates.getByRole("button", { name: /좌석 상세$/ })).toHaveCount(1);
});

test("unobserved vendor seats show a waiting state without reclaim actions", async ({ page }) => {
  await openDashboard(page, "/members");
  const members = page.getByRole("region", { name: "구성원 목록", exact: true });
  await members.getByRole("textbox", { name: "구성원 검색" }).fill("sujin.kim@codeworks.io");
  const row = members.getByRole("button", { name: "sujin.kim@codeworks.io 구성원 상세", exact: true });
  await expect(row).toContainText("신호 대기");
  await expect(row).toContainText("기록 없음");
  await row.click();
  const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  await expect(drawer).toContainText("아직 어떤 벤더에서도 활동이 관측되지 않았습니다");
  await expect(drawer).toContainText("Codex");
  await expect(drawer).toContainText("관측 기록 없음");
  await expect(drawer.getByRole("button", { name: /좌석 회수$/ })).toHaveCount(0);
});
