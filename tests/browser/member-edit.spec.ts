import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { mockMembers } from "./members-fixture";

const patches = (api: Awaited<ReturnType<typeof mockMembers>>) => api.commands.filter((command) => command.method === "PATCH" && command.path.startsWith("members/"));

test("member edits prefill current values, discard cancellation, persist saves and support unassignment", async ({ page }) => {
  const api = await mockMembers(page);
  await openDashboard(page, "/members");
  const target = structuredClone(api.members.find((member) => member.team.teamId === "team-platform" && member.role === "member" && member.periodUsage)!);
  const members = page.getByRole("region", { name: "구성원 목록", exact: true });
  await members.getByRole("textbox", { name: "구성원 검색" }).fill(target.account);
  const row = members.getByRole("button", { name: `${target.account} 구성원 상세`, exact: true });
  await row.click();
  const modal = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  const team = modal.getByLabel("팀", { exact: true });
  const role = modal.getByLabel("역할", { exact: true });
  const save = modal.getByRole("button", { name: "변경사항 저장", exact: true });
  const cancel = modal.getByRole("button", { name: "취소", exact: true });
  await expect(modal).toContainText(target.account);
  await expect(team).toHaveValue("team-platform");
  await expect(role).toHaveValue("member");
  // 역할 선택지는 서버가 받는 두 가지뿐이다.
  await expect(role.getByRole("option")).toHaveText(["구성원", "관리자"]);
  // 고른 역할의 권한 설명은 초대 폼과 같은 문장이다.
  await expect(modal).toContainText("구성원은 웹 대시보드에 접근하지 않습니다. CLI를 설치해 자기 사용량을 수집하는 대상입니다");
  await expect(modal.locator("header").getByLabel("팀", { exact: true })).toHaveCount(0);
  await expect(modal.locator("header").getByLabel("역할", { exact: true })).toHaveCount(0);
  await expect(modal.getByRole("heading", { name: "팀 · 역할", exact: true })).toBeVisible();
  await expect(modal.locator("footer")).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(cancel).toBeDisabled();
  await team.selectOption("team-data");
  await role.selectOption("admin");
  await expect(save).toBeEnabled();
  await expect(modal.locator("footer")).toBeVisible();
  await cancel.click();
  await expect(modal).toBeVisible();
  await expect(team).toHaveValue("team-platform");
  await expect(role).toHaveValue("member");
  await expect(save).toBeDisabled();
  await expect(cancel).toBeDisabled();
  // 저장하지 않고 닫으면 입력을 버린다.
  await team.selectOption("team-data");
  await role.selectOption("admin");
  await modal.getByRole("button", { name: "상세 패널 닫기", exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(patches(api)).toHaveLength(0);
  await row.click();
  await expect(team).toHaveValue("team-platform");
  await expect(role).toHaveValue("member");

  // 저장은 바뀐 필드와 조회가 준 version을 보낸다. 서버가 확정한 뒤에 닫고 알린다.
  await team.selectOption("team-data");
  await role.selectOption("admin");
  await save.click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: `${target.account}의 팀·역할을 변경했습니다.` })).toBeVisible();
  expect(patches(api)).toHaveLength(1);
  expect(patches(api)[0].path).toBe(`members/${target.memberId}`);
  expect(patches(api)[0].body).toEqual({ expectedVersion: target.version, teamId: "team-data", role: "admin" });
  await expect(row.getByText("데이터", { exact: true })).toBeVisible();
  await expect(row.getByText("관리자", { exact: true })).toBeVisible();

  // 화면을 떠났다 돌아와도 서버에 저장된 값이다.
  await page.getByRole("link", { name: "개요", exact: true }).click();
  await page.getByRole("link", { name: "구성원", exact: true }).click();
  await members.getByRole("textbox", { name: "구성원 검색" }).fill(target.account);
  await row.click();
  await expect(team).toHaveValue("team-data");
  await expect(role).toHaveValue("admin");
  // 팀만 비우면 역할은 보내지 않는다.
  await team.selectOption("");
  await save.click();
  await expect(modal).not.toBeVisible();
  expect(patches(api)[1].body).toEqual({ expectedVersion: target.version + 1, teamId: null });
  await expect(row.getByText("미배정", { exact: true })).toBeVisible();
  await expect(row.getByText("관리자", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "팀 미배정 사용자", exact: true })).toContainText(target.account);

  await page.setViewportSize({ width: 390, height: 844 });
  await row.click();
  await expect(team).toHaveValue("");
  await expect(role).toHaveValue("admin");
  await expect(modal.locator("section").first().locator("..")).toHaveCSS("opacity", "1");
  await expect(modal.locator("section").first()).toHaveCSS("transform", "none");
  const bounds = (await modal.locator("section").first().boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390.5);
  await page.screenshot({ path: "test-results/member-edit-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
  await expect(row).toBeFocused();
});

test("pending invitations are edited by member id from the pending card without changing their expiry", async ({ page }) => {
  const api = await mockMembers(page, { invitations: [] });
  await openDashboard(page, "/members");
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  const invitation = page.getByRole("dialog", { name: "구성원 초대", exact: true });
  const email = invitation.getByRole("textbox", { name: "초대할 이메일" });
  await email.fill("edit@example.test");
  await email.press("Enter");
  await invitation.getByRole("combobox", { name: "팀", exact: true }).selectOption("team-platform");
  await invitation.getByRole("button", { name: "1명 초대 코드 발급", exact: true }).click();
  await expect(invitation.getByRole("status")).toContainText("초대 코드 1건을 발급했습니다");
  await invitation.getByRole("button", { name: "완료", exact: true }).click();
  await expect(invitation).not.toBeVisible();
  const pending = page.getByRole("region", { name: "초대 대기", exact: true });
  await expect(pending).toContainText("플랫폼 · 구성원");
  const expiry = await pending.locator("span").filter({ hasText: /^\d+일 남음$/ }).innerText();
  const invited = api.invitations.find((item) => item.email === "edit@example.test")!;

  await pending.getByRole("button", { name: "edit@example.test 초대 팀/역할 수정", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  await expect(modal).toContainText("edit@example.test");
  await expect(modal.getByLabel("팀", { exact: true })).toHaveValue("team-platform");
  await expect(modal.getByLabel("역할", { exact: true })).toHaveValue("member");
  await expect(modal).toContainText("초대를 수락하면 변경한 팀과 역할이 적용됩니다.");
  await expect(modal).toContainText("초대 대기");
  // 아직 합류하지 않은 사람에게는 사용 기록과 좌석이 없다.
  await expect(modal.getByRole("region", { name: "기간 사용" })).toHaveCount(0);
  await expect(modal.getByRole("region", { name: "벤더 좌석" })).toHaveCount(0);
  await modal.getByLabel("팀", { exact: true }).selectOption("team-data");
  await modal.getByLabel("역할", { exact: true }).selectOption("admin");
  await modal.getByRole("button", { name: "변경사항 저장", exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "edit@example.test의 초대 팀·역할을 변경했습니다." })).toBeVisible();
  // 초대 목록이 준 구성원 ID와 version으로 저장한다. 이메일로 찾지 않는다.
  expect(patches(api)[0].path).toBe(`members/${invited.memberId}`);
  expect(patches(api)[0].body).toEqual({ expectedVersion: 1, teamId: "team-data", role: "admin" });
  await expect(pending).toContainText("데이터 · 관리자");
  await expect(pending).toContainText(expiry);

  await pending.getByRole("button", { name: "edit@example.test 초대 팀/역할 수정", exact: true }).click();
  await expect(modal.getByLabel("팀", { exact: true })).toHaveValue("team-data");
  await expect(modal.getByLabel("역할", { exact: true })).toHaveValue("admin");
  await modal.getByLabel("팀", { exact: true }).selectOption("");
  await expect(modal.locator("section").first().locator("..")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/invite-edit-desktop.png" });
  await modal.getByRole("button", { name: "변경사항 저장", exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(patches(api)[1].body).toEqual({ expectedVersion: 2, teamId: null });
  await expect(pending).toContainText("팀 미배정 · 관리자");
  await expect(pending).toContainText(expiry);
  // 초대 대기자는 명단의 구성원이 아니다.
  const members = page.getByRole("region", { name: "구성원 목록", exact: true });
  await members.getByRole("textbox", { name: "구성원 검색" }).fill("edit@example.test");
  await members.getByRole("textbox", { name: "구성원 검색" }).press("Enter");
  await expect(members.getByRole("button", { name: /구성원 상세$/ })).toHaveCount(0);
});

test("a stale version is refused, the input is kept, and the latest values load only when asked", async ({ page }) => {
  const api = await mockMembers(page);
  await openDashboard(page, "/members");
  const target = api.members.find((member) => member.team.teamId === "team-product" && member.role === "member" && member.periodUsage)!;
  const opened = target.version;
  const members = page.getByRole("region", { name: "구성원 목록", exact: true });
  await members.getByRole("textbox", { name: "구성원 검색" }).fill(target.account);
  await members.getByRole("button", { name: `${target.account} 구성원 상세`, exact: true }).click();
  const modal = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  const team = modal.getByLabel("팀", { exact: true });
  const role = modal.getByLabel("역할", { exact: true });
  const save = modal.getByRole("button", { name: "변경사항 저장", exact: true });
  await team.selectOption("team-data");

  // 다른 곳에서 같은 구성원을 관리자로 바꿨다.
  target.role = "admin"; target.version += 1;
  await save.click();
  const alert = modal.getByRole("alert");
  await expect(alert).toContainText("다른 곳에서 변경되었습니다");
  expect(patches(api)[0].body).toEqual({ expectedVersion: opened, teamId: "team-data" });
  // 덮어쓰지 않고, 입력도 지우지 않는다.
  expect(target.team.teamId).toBe("team-product");
  await expect(team).toHaveValue("team-data");
  await expect(team).toBeDisabled();
  await expect(save).toBeDisabled();
  await alert.getByRole("button", { name: "입력 취소 후 최신 내용 불러오기", exact: true }).click();
  await expect(modal.getByRole("alert")).toHaveCount(0);
  await expect(team).toHaveValue("team-product");
  await expect(role).toHaveValue("admin");
  await expect(save).toBeDisabled();

  await team.selectOption("team-data");
  await save.click();
  await expect(modal).not.toBeVisible();
  expect(patches(api)[1].body).toEqual({ expectedVersion: opened + 1, teamId: "team-data" });
  expect(target.team.teamId).toBe("team-data");
  expect(target.role).toBe("admin");
});

test("several unassigned members are assigned in one command and a stale list is reloaded before retrying", async ({ page }) => {
  const api = await mockMembers(page);
  await openDashboard(page, "/members");
  const unassigned = api.members.filter((member) => member.team.teamId === null).map((member) => structuredClone(member));
  expect(unassigned.length).toBe(5);
  const card = page.getByRole("region", { name: "팀 미배정 사용자", exact: true });
  const apply = card.getByRole("button", { name: /배정$/ });
  await expect(card.getByRole("combobox")).toHaveCount(5);
  await expect(apply).toHaveText("팀 배정");
  await expect(apply).toBeDisabled();
  await card.getByLabel(`${unassigned[0].account} 팀 선택`, { exact: true }).selectOption("team-platform");
  await card.getByLabel(`${unassigned[1].account} 팀 선택`, { exact: true }).selectOption("team-data");
  await expect(apply).toHaveText("2명 배정");
  await apply.click();
  await expect(page.getByRole("status").filter({ hasText: "2명을 팀에 배정했습니다." })).toBeVisible();
  const commands = api.commands.filter((command) => command.path === "member-team-assignments");
  expect(commands).toHaveLength(1);
  expect(commands[0].idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  expect(commands[0].body).toEqual({ assignments: [
    { memberId: unassigned[0].memberId, teamId: "team-platform", expectedVersion: unassigned[0].version },
    { memberId: unassigned[1].memberId, teamId: "team-data", expectedVersion: unassigned[1].version },
  ] });
  // 서버가 확정한 뒤에 목록에서 빠진다.
  await expect(card.getByRole("combobox")).toHaveCount(3);
  await expect(card).not.toContainText(unassigned[0].account);
  await expect(page.getByRole("group", { name: "팀 미배정", exact: true })).toContainText("3명");

  // 고른 뒤 다른 곳에서 그 구성원이 바뀌면 거절된다. 최신 목록을 읽은 뒤에 다시 보낸다.
  await card.getByLabel(`${unassigned[2].account} 팀 선택`, { exact: true }).selectOption("team-product");
  api.members.find((member) => member.memberId === unassigned[2].memberId)!.version += 1;
  await apply.click();
  const alert = card.getByRole("alert");
  await expect(alert).toContainText("다른 곳에서 변경되었습니다");
  await expect(card.getByRole("combobox")).toHaveCount(3);
  await expect(apply).toBeDisabled();
  await alert.getByRole("button", { name: "최신 목록 불러오기", exact: true }).click();
  await expect(card.getByRole("alert")).toHaveCount(0);
  await expect(card.getByLabel(`${unassigned[2].account} 팀 선택`, { exact: true })).toHaveValue("team-product");
  await apply.click();
  await expect(card.getByRole("combobox")).toHaveCount(2);
  const retried = api.commands.filter((command) => command.path === "member-team-assignments");
  expect(retried).toHaveLength(3);
  expect(retried[2].body).toEqual({ assignments: [{ memberId: unassigned[2].memberId, teamId: "team-product", expectedVersion: unassigned[2].version + 1 }] });
});
