import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { fixtureMembers, mockMembers } from "./members-fixture";

test.beforeEach(async ({ page }) => {
  await mockMembers(page);
  await openDashboard(page, "/members");
  await expect(
    page.getByRole("region", { name: "구성원 목록", exact: true }),
  ).toBeVisible();
  await page.clock.install({ time: new Date("2026-09-22T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-22T00:00:01Z"));
});

test("typing keeps results until a pause, while Enter and clearing apply immediately", async ({
  page,
}) => {
  const members = page.getByRole("region", {
    name: "구성원 목록",
    exact: true,
  });
  const input = members.getByRole("textbox", { name: "구성원 검색" });
  const rows = members.getByRole("button", { name: /구성원 상세$/ });
  const account = (await rows.first().getAttribute("aria-label"))!.replace(
    " 구성원 상세",
    "",
  );
  await expect(rows).toHaveCount(20);
  await input.fill("not-a-member");
  await expect(input).toHaveValue("not-a-member");
  await page.clock.runFor(200);
  await expect(rows).toHaveCount(20);
  await input.fill(account.toUpperCase());
  await page.clock.runFor(249);
  await expect(rows).toHaveCount(20);
  await page.clock.runFor(1);
  // debounce 경계 검증 후에는 비동기 응답을 반영하는 타이머도 진행한다.
  await page.clock.resume();
  await expect(rows).toHaveCount(1);
  await expect(rows).toHaveAttribute("aria-label", `${account} 구성원 상세`);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await input.fill("not-a-member");
  await expect(rows).toHaveCount(1);
  const enterSearch = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      request.method() === "GET" &&
      url.pathname.endsWith("/members") &&
      url.searchParams.get("q") === "not-a-member"
    );
  });
  await input.press("Enter");
  // 멈춘 시계에서 요청이 시작돼야 한다. 250ms debounce를 기다리지 않는다.
  await enterSearch;
  await page.clock.resume();
  await expect(rows).toHaveCount(0);
  await expect(members.getByText("검색 결과가 없습니다")).toBeVisible();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await input.fill(account);
  await input.fill("");
  await page.clock.runFor(0);
  await expect(rows).toHaveCount(20);
  await page.clock.runFor(300);
  await expect(rows).toHaveCount(20);
});

test("Korean IME searches after an input pause without compositionend or losing focus", async ({
  page,
}) => {
  const members = page.getByRole("region", {
    name: "구성원 목록",
    exact: true,
  });
  const input = members.getByRole("textbox", { name: "구성원 검색" });
  const rows = members.getByRole("button", { name: /구성원 상세$/ });
  const ime = await page.context().newCDPSession(page);
  await input.focus();
  await ime.send("Input.imeSetComposition", {
    text: "플",
    selectionStart: 1,
    selectionEnd: 1,
  });
  await page.clock.runFor(200);
  await expect(rows).toHaveCount(20);
  await ime.send("Input.imeSetComposition", {
    text: "플랫폼",
    selectionStart: 3,
    selectionEnd: 3,
  });
  await expect(input).toHaveValue("플랫폼");
  // 조합 확정용 Enter를 검색 실행으로 처리하지 않습니다.
  await input.dispatchEvent("keydown", {
    key: "Enter",
    isComposing: true,
    keyCode: 229,
  });
  await page.clock.runFor(249);
  await expect(rows).toHaveCount(20);
  await page.clock.runFor(1);
  await page.clock.resume();
  await expect(members).toContainText("검색 결과");
  await expect(input).toBeFocused();
  const platformMembers = fixtureMembers().filter(
    (member) => member.team.teamId === "team-platform",
  );
  await expect(rows).toHaveCount(platformMembers.length);
  for (const row of await rows.all())
    await expect(row.getByText("플랫폼", { exact: true })).toBeVisible();
  await ime.send("Input.imeSetComposition", {
    text: "",
    selectionStart: 0,
    selectionEnd: 0,
  });
  await expect(input).toHaveValue("");
  await expect(rows).toHaveCount(20);
  await page.clock.runFor(300);
  await expect(rows).toHaveCount(20);
  await expect(input).toBeFocused();
  await ime.detach();
});

test("search preserves list height and scroll position, then releases space when cleared", async ({
  page,
}) => {
  const members = page.getByRole("region", {
    name: "구성원 목록",
    exact: true,
  });
  const input = members.getByRole("textbox", { name: "구성원 검색" });
  const rows = members.getByRole("button", { name: /구성원 상세$/ });
  const main = page.getByRole("main");
  const loadMore = members.getByRole("button", {
    name: /^다음 \d+명 더보기$/,
  });
  await expect(rows).toHaveCount(20);
  const initialHeight = (await members.boundingBox())!.height;
  await expect(loadMore).toHaveText("다음 20명 더보기");
  await loadMore.click();
  await expect(rows).toHaveCount(40);
  await input.focus();
  await main.evaluate((element) => {
    const card = element.querySelector('[aria-label="구성원 목록"]')!;
    element.scrollTop +=
      card.getBoundingClientRect().top -
      element.getBoundingClientRect().top -
      24;
  });
  const originalHeight = (await members.boundingBox())!.height;
  const originalScroll = await main.evaluate((element) => element.scrollTop);
  expect(originalScroll).toBeGreaterThan(0);
  await input.fill("no-such-member");
  await page.clock.runFor(250);
  await page.clock.resume();
  await expect(rows).toHaveCount(0);
  await expect(members.getByText("검색 결과가 없습니다")).toBeVisible();
  expect(
    Math.abs((await members.boundingBox())!.height - originalHeight),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(
      (await main.evaluate((element) => element.scrollTop)) - originalScroll,
    ),
  ).toBeLessThanOrEqual(1);

  // 검색 결과가 더 많아졌다가 다시 줄어드는 경우에도 스크롤 영역이 갑자기 줄지 않습니다.
  await input.fill("@codeworks.io");
  const accounts = fixtureMembers()
    .map((member) => member.account)
    .sort();
  const labels = accounts.map((account) => `${account} 구성원 상세`);
  await expect(rows).toHaveCount(20);
  for (const [index, label] of labels.slice(0, 20).entries())
    await expect(rows.nth(index)).toHaveAttribute("aria-label", label);
  await expect(loadMore).toHaveText("다음 20명 더보기");
  await loadMore.click();
  await expect(rows).toHaveCount(40);
  for (const [index, label] of labels.slice(20, 40).entries())
    await expect(rows.nth(index + 20)).toHaveAttribute("aria-label", label);
  await expect(loadMore).toHaveText(`다음 ${accounts.length - 40}명 더보기`);
  await loadMore.click();
  await expect(rows).toHaveCount(accounts.length);
  for (const [index, label] of labels.slice(40).entries())
    await expect(rows.nth(index + 40)).toHaveAttribute("aria-label", label);
  await expect(loadMore).toHaveCount(0);
  const expandedHeight = (await members.boundingBox())!.height;
  expect(expandedHeight).toBeGreaterThan(originalHeight);
  const account = (await rows.first().getAttribute("aria-label"))!.replace(
    " 구성원 상세",
    "",
  );
  await input.fill(account);
  await input.press("Enter");
  await expect(rows).toHaveCount(1);
  expect(
    Math.abs((await members.boundingBox())!.height - expandedHeight),
  ).toBeLessThanOrEqual(1);

  await input.fill("");
  await expect(rows).toHaveCount(20);
  expect(
    Math.abs((await members.boundingBox())!.height - initialHeight),
  ).toBeLessThanOrEqual(1);
  await page.clock.runFor(300);
  await expect(rows).toHaveCount(20);
});
