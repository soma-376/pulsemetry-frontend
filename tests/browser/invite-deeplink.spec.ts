import { expect, test } from "@playwright/test";
import { openDashboard } from "./helpers";
import { mockMembers } from "./members-fixture";

/** 개요의 빈 상태가 쓰는 초대 딥링크(`/members?invite=1`) — 초대 창을 바로 열고, 닫으면 주소에서 지워 새로고침에서 다시 열리지 않는다. */
test("초대 딥링크는 구성원 화면의 초대 창을 바로 열고, 닫으면 다시 열리지 않는다", async ({ page }) => {
  await mockMembers(page);
  await openDashboard(page, "/members");
  await page.goto("/members?invite=1");
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "초대할 이메일" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/members$/);
  await page.reload();
  await expect(page.getByRole("region", { name: "구성원 목록", exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
