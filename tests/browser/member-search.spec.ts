import { expect, test } from "@playwright/test";
import { openDashboard } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openDashboard(page, "/members");
  await page.clock.install({ time: new Date("2026-09-22T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-22T00:00:01Z"));
});

test("typing keeps results until a pause, while Enter and clearing apply immediately", async ({ page }) => {
  const members = page.getByRole("region", { name: "구성원 목록", exact: true });
  const input = members.getByRole("textbox", { name: "구성원 검색" });
  const rows = members.getByRole("button", { name: /팀\/역할 수정$/ });
  const account = (await rows.first().getAttribute("aria-label"))!.replace(" 팀/역할 수정", "");
  await expect(rows).toHaveCount(20);
  await input.fill("not-a-member");
  await expect(input).toHaveValue("not-a-member");
  await page.clock.runFor(200);
  await expect(rows).toHaveCount(20);
  await input.fill(account.toUpperCase());
  await page.clock.runFor(249);
  await expect(rows).toHaveCount(20);
  await page.clock.runFor(1);
  await expect(rows).toHaveCount(1);
  await expect(rows).toHaveAttribute("aria-label", `${account} 팀/역할 수정`);
  await input.fill("not-a-member");
  await expect(rows).toHaveCount(1);
  await input.press("Enter");
  await expect(rows).toHaveCount(0);
  await expect(members.getByText("검색 결과가 없습니다")).toBeVisible();
  await input.fill(account);
  await input.fill("");
  await expect(rows).toHaveCount(20);
  await page.clock.runFor(300);
  await expect(rows).toHaveCount(20);
});

test("Korean IME searches after an input pause without compositionend or losing focus", async ({ page }) => {
  const members = page.getByRole("region", { name: "구성원 목록", exact: true });
  const input = members.getByRole("textbox", { name: "구성원 검색" });
  const rows = members.getByRole("button", { name: /팀\/역할 수정$/ });
  const ime = await page.context().newCDPSession(page);
  await input.focus();
  await ime.send("Input.imeSetComposition", { text: "플", selectionStart: 1, selectionEnd: 1 });
  await page.clock.runFor(200);
  await expect(rows).toHaveCount(20);
  await ime.send("Input.imeSetComposition", { text: "플랫폼", selectionStart: 3, selectionEnd: 3 });
  await expect(input).toHaveValue("플랫폼");
  // 조합 확정용 Enter를 검색 실행으로 처리하지 않습니다.
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true, keyCode: 229 });
  await page.clock.runFor(249);
  await expect(rows).toHaveCount(20);
  await page.clock.runFor(1);
  await expect(members).toContainText("검색 결과");
  await expect(input).toBeFocused();
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) await expect(row.locator("..").getByText("플랫폼", { exact: true })).toBeVisible();
  await ime.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
  await expect(input).toHaveValue("");
  await expect(rows).toHaveCount(20);
  await page.clock.runFor(300);
  await expect(rows).toHaveCount(20);
  await expect(input).toBeFocused();
  await ime.detach();
});

test("search preserves list height and scroll position, then releases space when cleared", async ({ page }) => {
  const members = page.getByRole("region", { name: "구성원 목록", exact: true });
  const input = members.getByRole("textbox", { name: "구성원 검색" });
  const rows = members.getByRole("button", { name: /팀\/역할 수정$/ });
  const main = page.getByRole("main");
  await members.getByRole("button", { name: "다음 20명 더보기", exact: true }).click();
  await expect(rows).toHaveCount(40);
  await input.focus();
  await main.evaluate((element) => {
    const card = element.querySelector('[aria-label="구성원 목록"]')!;
    element.scrollTop += card.getBoundingClientRect().top - element.getBoundingClientRect().top - 24;
  });
  const originalHeight = (await members.boundingBox())!.height;
  const originalScroll = await main.evaluate((element) => element.scrollTop);
  expect(originalScroll).toBeGreaterThan(0);
  await input.fill("no-such-member");
  await page.clock.runFor(250);
  await expect(rows).toHaveCount(0);
  await expect(members.getByText("검색 결과가 없습니다")).toBeVisible();
  expect(Math.abs((await members.boundingBox())!.height - originalHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(await main.evaluate((element) => element.scrollTop) - originalScroll)).toBeLessThanOrEqual(1);

  // 검색 결과가 더 많아졌다가 다시 줄어드는 경우에도 스크롤 영역이 갑자기 줄지 않습니다.
  await input.fill("@codeworks.io");
  await page.clock.runFor(250);
  expect(await rows.count()).toBeGreaterThan(40);
  const expandedHeight = (await members.boundingBox())!.height;
  expect(expandedHeight).toBeGreaterThan(originalHeight);
  const account = (await rows.first().getAttribute("aria-label"))!.replace(" 팀/역할 수정", "");
  await input.fill(account);
  await input.press("Enter");
  await expect(rows).toHaveCount(1);
  expect(Math.abs((await members.boundingBox())!.height - expandedHeight)).toBeLessThanOrEqual(1);

  await input.fill("");
  await expect(rows).toHaveCount(40);
  expect(Math.abs((await members.boundingBox())!.height - originalHeight)).toBeLessThanOrEqual(1);
  await page.clock.runFor(300);
  await expect(rows).toHaveCount(40);
});
