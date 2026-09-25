import { expect, test, type Locator } from "@playwright/test";
import { openDashboard } from "./helpers";
import { buildMembers } from "../../src/lib/metrics/members";
import { buildTeams } from "../../src/lib/metrics/teams";
import { usd } from "../../src/lib/format";

const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
const memberAccounts = (region: Locator) => region.getByRole("button", { name: /구성원 상세$/ }).evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")!.replace(" 구성원 상세", "")));

test("members sort the whole search result, keep sorting through more and put missing values last", async ({ page }) => {
  await openDashboard(page, "/members");
  const members = page.getByRole("region", { name: "구성원 목록", exact: true });
  await expect(members).toBeVisible();
  const model = buildMembers();
  const alphabetical = model.memberRows.map((row) => row.account).sort(collator.compare);
  expect(await memberAccounts(members)).toEqual(alphabetical.slice(0, 20));
  await members.getByRole("button", { name: "사용자 정렬", exact: true }).click();
  expect(await memberAccounts(members)).toEqual([...alphabetical].reverse().slice(0, 20));
  await members.getByRole("button", { name: "다음 20명 더보기", exact: true }).click();
  expect(await memberAccounts(members)).toEqual([...alphabetical].reverse().slice(0, 40));
  const cost = members.getByRole("button", { name: "사용 환산액 정렬", exact: true });
  await cost.click();
  await expect(cost).toHaveAccessibleDescription(/^내림차순 정렬 중/);
  const costs = [...model.memberRows].sort((a, b) => (b.costValue ?? -Infinity) - (a.costValue ?? -Infinity) || collator.compare(a.account, b.account));
  expect(await memberAccounts(members)).toEqual(costs.slice(0, 40).map((row) => row.account));
  const search = members.getByRole("textbox", { name: "구성원 검색" });
  await search.fill("플랫폼");
  await search.press("Enter");
  expect(await memberAccounts(members)).toEqual(costs.filter((row) => row.team === "플랫폼").map((row) => row.account));
  await search.fill("");
  await expect(cost).toHaveAccessibleDescription(/^내림차순 정렬 중/);
  expect(await memberAccounts(members)).toEqual(costs.slice(0, 40).map((row) => row.account));

  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  const invite = page.getByRole("dialog", { name: "구성원 초대", exact: true });
  await invite.getByRole("textbox", { name: "초대할 이메일" }).fill("zz-sort@codeworks.io");
  await invite.getByRole("textbox", { name: "초대할 이메일" }).press("Enter");
  await invite.getByRole("button", { name: "1명에게 초대 메일 발송", exact: true }).click();
  await invite.getByRole("button", { name: "취소", exact: true }).click();
  await expect(invite).not.toBeVisible();
  await search.fill("@codeworks.io");
  await search.press("Enter");
  expect((await memberAccounts(members)).at(-1)).toBe("zz-sort@codeworks.io");
  await cost.click();
  expect((await memberAccounts(members)).at(-1)).toBe("zz-sort@codeworks.io");
  const activity = members.getByRole("button", { name: "최근 관측 정렬", exact: true });
  await activity.click();
  const latest = [...model.memberRows].sort((a, b) => (a.idleDays ?? Infinity) - (b.idleDays ?? Infinity) || collator.compare(a.account, b.account));
  expect((await memberAccounts(members)).slice(0, model.memberRows.length)).toEqual(latest.map((row) => row.account));
  expect((await memberAccounts(members)).at(-1)).toBe("zz-sort@codeworks.io");
  await activity.click();
  expect((await memberAccounts(members)).at(-1)).toBe("zz-sort@codeworks.io");
  await members.screenshot({ path: "test-results/member-sorting.png" });
});

test("team comparison sorts numbers, keeps chart selections and resets on axis changes", async ({ page }) => {
  await openDashboard(page, "/teams");
  const panel = page.getByRole("region", { name: "팀별 사용량 비교", exact: true });
  await expect(panel).toBeVisible();
  const names = () => panel.locator('button[aria-haspopup="dialog"]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  const model = buildTeams();
  const by = (axis: "cost" | "token" | "session", key: "totalValue" | "perUserValue" | "unitValue" | "deltaValue", direction = -1) => [...model.axes[axis].rows].sort((a, b) => direction * (a[key]! - b[key]!) || collator.compare(a.team, b.team)).map((row) => row.team);
  expect(await names()).toEqual(by("cost", "totalValue"));
  await panel.getByRole("checkbox", { name: "플랫폼 추이 선 표시" }).uncheck();
  for (const [label, key] of [["사용자당", "perUserValue"], ["세션당", "unitValue"], ["전주 대비", "deltaValue"]] as const) {
    const header = panel.getByRole("button", { name: `${label} 정렬`, exact: true });
    await header.click();
    expect(await names()).toEqual(by("cost", key));
    await header.click();
    expect(await names()).toEqual(by("cost", key, 1));
  }
  await expect(panel.getByRole("checkbox", { name: "플랫폼 추이 선 표시" })).not.toBeChecked();
  await panel.getByRole("button", { name: "팀 정렬", exact: true }).click();
  expect(await names()).toEqual(model.axes.cost.rows.map((row) => row.team).sort(collator.compare));
  await panel.getByRole("button", { name: "플랫폼", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "플랫폼 팀", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "플랫폼 팀", exact: true })).not.toBeVisible();
  for (const [label, axis] of [["토큰", "token"], ["세션", "session"]] as const) {
    await panel.getByRole("tab", { name: label, exact: true }).click();
    expect(await names()).toEqual(by(axis, "totalValue"));
  }
  await panel.getByRole("button", { name: "전주 대비 정렬", exact: true }).click();
  await page.getByRole("combobox", { name: "비교", exact: true }).selectOption("none");
  await expect(panel.getByRole("button", { name: "증감 정렬", exact: true })).toBeDisabled();
  expect(await names()).toEqual(by("session", "totalValue"));
  await panel.screenshot({ path: "test-results/team-sorting.png" });
});

test("user usage sorts before pagination and totals the actual visible rows", async ({ page }) => {
  await openDashboard(page, "/teams");
  const usage = page.getByRole("region", { name: "사용자별 사용량", exact: true });
  await expect(usage).toBeVisible();
  const accounts = () => usage.locator("span").filter({ hasText: /^[\w.]+@codeworks\.io$/ }).allTextContents();
  const model = buildTeams();
  const data = model.users(model.teams[0].team);
  const by = (key: "sessionCount" | "tokenValue" | "costValue" | "cacheValue" | "idleDays", direction: number) => [...data.rows].sort((a, b) => direction * (a[key] - b[key]) || collator.compare(a.account, b.account));
  const initial = by("costValue", -1).slice(0, model.userPageSize);
  expect(await accounts()).toEqual(initial.map((row) => row.account));
  await expect(usage).toContainText(`${initial.length}명 합계 ${usd(initial.reduce((sum, row) => sum + row.costValue, 0))}`);
  await usage.getByRole("button", { name: /다음 \d+명 더보기/ }).click();
  const count = Math.min(model.userPageSize * 2, data.rows.length);
  for (const [label, key] of [["세션", "sessionCount"], ["총 토큰", "tokenValue"], ["캐시 적중", "cacheValue"], ["마지막 사용", "idleDays"]] as const) {
    const header = usage.getByRole("button", { name: `${label} 정렬`, exact: true });
    await header.click();
    expect(await accounts()).toEqual(by(key, key === "idleDays" ? 1 : -1).slice(0, count).map((row) => row.account));
  }
  await usage.getByRole("button", { name: "계정 정렬", exact: true }).click();
  const alphabetical = [...data.rows].sort((a, b) => collator.compare(a.account, b.account)).slice(0, count);
  expect(await accounts()).toEqual(alphabetical.map((row) => row.account));
  await expect(usage).toContainText(`${count}명 합계 ${usd(alphabetical.reduce((sum, row) => sum + row.costValue, 0))}`);
  await usage.screenshot({ path: "test-results/user-sorting.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "내비게이션 접기/펼치기" }).click();
  await usage.getByRole("button", { name: "환산 금액 정렬", exact: true }).click();
  await expect(usage.getByRole("button", { name: "환산 금액 정렬", exact: true })).toHaveAccessibleDescription(/^내림차순 정렬 중/);
  await usage.screenshot({ path: "test-results/user-sorting-mobile.png" });
});
