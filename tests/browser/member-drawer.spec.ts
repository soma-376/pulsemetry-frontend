import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { fixtureCandidates, fixtureMembers, mockMembers } from "./members-fixture";

const members = fixtureMembers();

test("row opens the standard-width drawer with the server values of that member", async ({ page }) => {
  await mockMembers(page);
  await openDashboard(page, "/members");
  const list = page.getByRole("region", { name: "구성원 목록", exact: true });
  const rows = list.getByRole("button", { name: /구성원 상세$/ });
  await expect(rows).toHaveCount(20);
  const target = members.find((member) => member.periodUsage && member.team.teamId)!;
  await list.getByRole("textbox", { name: "구성원 검색" }).fill(target.account);
  const row = list.getByRole("button", { name: `${target.account} 구성원 상세`, exact: true });
  await expect(row.getByText("활성", { exact: true })).toBeVisible();
  await row.focus();
  await row.press("Enter");
  const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  await expect(drawer).toBeVisible();
  const panel = drawer.locator("section").first();
  await expect(panel).toHaveCSS("max-width", "480px");
  await expect(drawer).toContainText(target.account);
  await expect(drawer.getByRole("region", { name: "팀 및 역할" })).toContainText(target.displayName);
  await expect(drawer.getByRole("region", { name: "팀 및 역할" })).toContainText(target.team.teamName);
  await expect(drawer.getByRole("region", { name: "팀 및 역할" })).toContainText("구성원");
  await expect(drawer.getByRole("region", { name: "기간 사용" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "설치 코드", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(drawer.getByRole("button", { name: "벤더 좌석", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(drawer.getByRole("list", { name: "벤더별 좌석 상세" })).toHaveCount(0);
  await expect(drawer).not.toContainText("데모");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(row).toBeFocused();
});

test("candidate entry opens the drawer of the member the server named", async ({ page }) => {
  await mockMembers(page);
  await openDashboard(page, "/members");
  const candidate = fixtureCandidates(members)[0];
  const candidates = page.getByRole("region", { name: "좌석 회수 후보", exact: true });
  await expect(candidates.getByRole("button", { name: /좌석 상세$/ })).toHaveCount(3);
  await candidates.getByRole("button", { name: `${candidate.account} 좌석 상세`, exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  await expect(drawer).toContainText(candidate.account);
  await expect(drawer.getByText("회수 후보", { exact: true }).first()).toBeVisible();
  // 좌석은 서버의 구성원 좌석이다 — 회수 후보여도 회수할 수 있는지는 서버가 말한다.
  const expand = drawer.getByRole("button", { name: "벤더 좌석", exact: true });
  await expand.focus();
  await expand.press("Enter");
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  const seats = drawer.getByRole("list", { name: "벤더별 좌석 상세" });
  await expect(seats).toContainText("Claude");
  await expect(seats).toContainText("회수할 수 없음 — 관리 기능이 꺼진 서버입니다");
  await expect(seats.getByRole("button", { name: /좌석 회수$/ })).toHaveCount(0);
  await drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
  await expect(drawer).not.toBeVisible();
});

test("without a seat ledger no member is a reclaim candidate and unobserved members keep empty values", async ({ page }) => {
  await mockMembers(page, { candidates: false });
  await openDashboard(page, "/members");
  const list = page.getByRole("region", { name: "구성원 목록", exact: true });
  await expect(page.getByRole("region", { name: "좌석 회수 후보", exact: true })).toContainText("등록한 제품이 없어 좌석 원장이 없습니다");
  await expect(page.getByRole("group", { name: "좌석 회수 후보", exact: true })).toContainText("-석");
  const target = members.find((member) => !member.lastUsedAt)!;
  await list.getByRole("textbox", { name: "구성원 검색" }).fill(target.account);
  const row = list.getByRole("button", { name: `${target.account} 구성원 상세`, exact: true });
  await expect(row).toContainText("신호 대기");
  await expect(row.getByText("회수 후보", { exact: true })).toHaveCount(0);
  await row.click();
  const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  await expect(drawer.getByText("신호 대기", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("region", { name: "기간 사용" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: /좌석 회수$/ })).toHaveCount(0);
});
