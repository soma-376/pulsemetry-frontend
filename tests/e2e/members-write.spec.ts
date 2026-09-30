import type { Page } from "@playwright/test";
import { expect, test, dashboardBase, enrollmentBase, seedOrganizations } from "./fixtures";
import { authenticatedRequest, seedPeriod, signIn, signOut } from "./helpers";

// 시드 A(백엔드 tools/dev-seed/README.md): member5는 디자인 팀의 일반 구성원, member9만 미배정, 팀은 넷, 초대 대기 1·만료 1.
// 쓰기 검증은 새 팀·새 초대를 만들고, 시드 구성원에게 한 변경은 같은 테스트 안에서 되돌린다.
const org = seedOrganizations[0];
const O = `/api/v1/organizations/${org.id}`;
const SEED_TEAMS = ["플랫폼", "제품", "데이터", "디자인"];
const TARGET = "member5@seed-a.example.test", OWNER = "owner@seed-a.example.test", ADMIN = "admin@seed-a.example.test", UNASSIGNED = "member9@seed-a.example.test";
const CODE = /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/;
const unique = () => Date.now().toString(36);
const key = () => ({ "Idempotency-Key": crypto.randomUUID() });

type ApiMember = { memberId: string; account: string; team: { teamId: string | null; teamName: string }; role: string; version: number };
type ApiTeam = { teamId: string; teamName: string; version: number };
type ApiInvitation = { invitationId: string; email: string; role: string; status: string; memberId: string; memberVersion: number; team: { teamId: string; teamName: string } | null };

async function roster(page: Page): Promise<ApiMember[]> {
  const { start, end } = seedPeriod();
  const response = await authenticatedRequest(page, dashboardBase(), `${O}/members?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul&limit=100`);
  expect(response.status).toBe(200);
  return response.body.members.items;
}
const memberOf = async (page: Page, account: string) => (await roster(page)).find((member) => member.account === account)!;
async function teams(page: Page): Promise<ApiTeam[]> {
  const response = await authenticatedRequest(page, dashboardBase(), `${O}/teams?limit=100`);
  expect(response.status).toBe(200);
  return response.body.teams.items;
}
async function invitations(page: Page, status: string): Promise<ApiInvitation[]> {
  const response = await authenticatedRequest(page, enrollmentBase(), `${O}/invitations?limit=100&status=${status}&memberStatus=invited`);
  expect(response.status).toBe(200);
  return response.body.items;
}
/** 실패한 테스트가 시드를 바꾼 채로 두지 않게 구성원의 팀과 역할을 되돌린다. */
async function restoreMember(page: Page, account: string, teamName: string, role: string) {
  const [member, list] = [await memberOf(page, account), await teams(page)];
  const teamId = list.find((team) => team.teamName === teamName)?.teamId ?? null;
  if (member.team.teamId === teamId && member.role === role) return;
  const response = await authenticatedRequest(page, enrollmentBase(), `${O}/members/${member.memberId}`, "PATCH",
    { expectedVersion: member.version, ...(member.team.teamId !== teamId ? { teamId } : {}), ...(member.role !== role ? { role } : {}) });
  expect(response.status).toBe(200);
}
async function openMembers(page: Page, email: string) {
  await signIn(page, email);
  const loaded = page.waitForResponse((response) => new URL(response.url()).pathname === `${O}/members/dashboard` && response.status() === 200);
  await page.goto("/members");
  await loaded;
  await expect(page.getByRole("region", { name: "구성원 목록", exact: true }).getByRole("button", { name: /구성원 상세$/ })).toHaveCount(12);
}
const rowOf = (page: Page, account: string) => page.getByRole("region", { name: "구성원 목록", exact: true }).getByRole("button", { name: `${account} 구성원 상세`, exact: true });
const toast = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });
function editor(page: Page) {
  const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  return { drawer, team: drawer.getByLabel("팀", { exact: true }), role: drawer.getByLabel("역할", { exact: true }), save: drawer.getByRole("button", { name: "변경사항 저장", exact: true }) };
}

test("MEMBERS-W1 @p0 @write 팀·역할 저장이 새로고침 뒤에도 남고, 미배정 배정과 다른 탭의 변경 뒤 409를 처리한다", async ({ page, context }) => {
  await openMembers(page, OWNER);
  try {
    const teamId = Object.fromEntries((await teams(page)).map((team) => [team.teamName, team.teamId]));
    const before = await memberOf(page, TARGET);
    expect([before.team.teamName, before.role]).toEqual(["디자인", "member"]);
    const { drawer, team, role, save } = editor(page);

    // 역할 변경 — 서버의 역할 둘만 고를 수 있고, 저장은 서버가 확정한 뒤에 화면에 반영된다.
    await rowOf(page, TARGET).click();
    await expect(team).toHaveValue(teamId["디자인"]);
    await expect(role).toHaveValue("member");
    await expect(role.getByRole("option")).toHaveText(["구성원", "관리자"]);
    await expect(save).toBeDisabled();
    await role.selectOption("admin");
    const patched = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === `${O}/members/${before.memberId}`);
    await save.click();
    const saved = await patched;
    expect(saved.status()).toBe(200);
    expect(saved.request().postDataJSON()).toEqual({ expectedVersion: before.version, role: "admin" });
    await expect(drawer).not.toBeVisible();
    await expect(toast(page, `${TARGET}의 팀·역할을 변경했습니다.`)).toBeVisible();
    await expect(rowOf(page, TARGET)).toContainText("관리자");
    const promoted = await memberOf(page, TARGET);
    expect([promoted.role, promoted.team.teamName]).toEqual(["admin", "디자인"]);
    expect(promoted.version).not.toBe(before.version);
    await page.reload();
    await expect(rowOf(page, TARGET)).toContainText("관리자");
    await expect(rowOf(page, TARGET)).toContainText("디자인");

    // 팀을 비우면 미배정 카드로 옮겨 간다.
    const unassigned = page.getByRole("region", { name: "팀 미배정 사용자", exact: true });
    await expect(unassigned.getByRole("combobox")).toHaveCount(1);
    await rowOf(page, TARGET).click();
    await expect(role).toHaveValue("admin");
    await team.selectOption("");
    await save.click();
    await expect(drawer).not.toBeVisible();
    await expect(unassigned.getByRole("combobox")).toHaveCount(2);
    await expect(unassigned).toContainText(TARGET);
    await expect(unassigned).toContainText(UNASSIGNED);
    await expect(page.getByRole("group", { name: "팀 미배정", exact: true })).toContainText("2명");
    expect((await memberOf(page, TARGET)).team.teamId).toBeNull();

    // 미배정 카드의 배정 — 고른 사람만 보낸다. 시드의 미배정 구성원은 그대로 둔다.
    const apply = unassigned.getByRole("button", { name: /배정$/ });
    await expect(apply).toBeDisabled();
    await unassigned.getByLabel(`${TARGET} 팀 선택`, { exact: true }).selectOption({ label: "디자인" });
    await expect(apply).toHaveText("1명 배정");
    const assigned = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `${O}/member-team-assignments`);
    await apply.click();
    const assignment = await assigned;
    expect(assignment.status()).toBe(200);
    expect(assignment.request().headers()["idempotency-key"]).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    expect(assignment.request().postDataJSON().assignments.map((item: { memberId: string; teamId: string }) => [item.memberId, item.teamId])).toEqual([[before.memberId, teamId["디자인"]]]);
    await expect(toast(page, "1명을 팀에 배정했습니다.")).toBeVisible();
    await expect(unassigned.getByRole("combobox")).toHaveCount(1);
    await expect(unassigned).not.toContainText(TARGET);
    await page.reload();
    await expect(rowOf(page, TARGET)).toContainText("디자인");
    await expect(page.getByRole("group", { name: "팀 미배정", exact: true })).toContainText("1명");
    await expect(page.getByRole("region", { name: "팀 미배정 사용자", exact: true })).toContainText(UNASSIGNED);

    // 이 탭에서 편집기를 열어 둔 사이 다른 탭(다른 관리자)이 같은 구성원을 바꾼다.
    await rowOf(page, TARGET).click();
    await expect(role).toHaveValue("admin");
    await team.selectOption({ label: "데이터" });
    const other = await context.newPage();
    const otherErrors: string[] = [];
    other.on("pageerror", (error) => otherErrors.push(error.message));
    await openMembers(other, ADMIN);
    const second = editor(other);
    await rowOf(other, TARGET).click();
    await expect(second.role).toHaveValue("admin");
    await second.role.selectOption("member");
    await second.save.click();
    await expect(second.drawer).not.toBeVisible();
    await expect(rowOf(other, TARGET)).toContainText("구성원");

    const refused = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === `${O}/members/${before.memberId}`);
    await save.click();
    expect((await refused).status()).toBe(409);
    const alert = drawer.getByRole("alert");
    await expect(alert).toContainText("다른 곳에서 변경되었습니다");
    // 서버는 오래된 요청으로 덮어쓰지 않았고, 화면은 입력을 지우지 않았다.
    const kept = await memberOf(page, TARGET);
    expect([kept.team.teamName, kept.role]).toEqual(["디자인", "member"]);
    await expect(team).toHaveValue(teamId["데이터"]);
    await expect(save).toBeDisabled();
    await alert.getByRole("button", { name: "입력 취소 후 최신 내용 불러오기", exact: true }).click();
    await expect(drawer.getByRole("alert")).toHaveCount(0);
    await expect(team).toHaveValue(teamId["디자인"]);
    await expect(role).toHaveValue("member");
    await expect(save).toBeDisabled();
    await drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
    await expect(drawer).not.toBeVisible();
    await expect(rowOf(page, TARGET)).toContainText("구성원");

    // 다른 관리자의 탭: 자기 역할은 잠겨 있고, 소유자의 역할은 서버가 거절하지만 소유자의 팀은 바꿀 수 있다.
    await rowOf(other, ADMIN).click();
    await expect(second.role).toBeDisabled();
    await expect(second.drawer).toContainText("자기 역할은 바꿀 수 없습니다.");
    await second.drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
    await expect(second.drawer).not.toBeVisible();
    const owner = await memberOf(other, OWNER);
    expect(owner.team.teamName).toBe("플랫폼");
    await rowOf(other, OWNER).click();
    await second.role.selectOption("member");
    await second.save.click();
    await expect(second.drawer.getByRole("alert")).toContainText("소유자의 역할은 바꿀 수 없습니다.");
    await expect(second.role).toHaveValue("member");
    await second.drawer.getByRole("button", { name: "취소", exact: true }).click();
    await expect(second.drawer.getByRole("alert")).toHaveCount(0);
    await second.team.selectOption({ label: "데이터" });
    const ownerPatched = other.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === `${O}/members/${owner.memberId}`);
    await second.save.click();
    const ownerSaved = await ownerPatched;
    expect(ownerSaved.status()).toBe(200);
    // 바꾸지 않은 역할은 보내지 않는다. 명단은 소유자도 관리자로 보여 주기 때문이다.
    expect(ownerSaved.request().postDataJSON()).toEqual({ expectedVersion: owner.version, teamId: teamId["데이터"] });
    await expect(second.drawer).not.toBeVisible();
    await expect(rowOf(other, OWNER)).toContainText("데이터");
    expect(otherErrors, "두 번째 탭의 런타임 오류").toEqual([]);
    await signOut(other);
    await other.close();
  } finally {
    await restoreMember(page, TARGET, "디자인", "member");
    await restoreMember(page, OWNER, "플랫폼", "admin");
  }
  const after = await roster(page);
  expect(after.filter((member) => member.team.teamId === null).map((member) => member.account)).toEqual([UNASSIGNED]);
  expect(after.find((member) => member.account === OWNER)!.team.teamName).toBe("플랫폼");
  await signOut(page);
});

test("MEMBERS-W2 @p0 @write 팀을 만들고 이름을 바꾸고 삭제하면 서버 목록과 새로고침 뒤 화면이 같다", async ({ page }) => {
  await openMembers(page, OWNER);
  const name = `E2E 팀 ${unique()}`, renamed = `${name} 2`;
  try {
    await page.getByRole("button", { name: "팀 관리", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "팀 관리", exact: true });
    const list = drawer.getByRole("list", { name: "팀 목록" });
    await expect(list.getByRole("listitem")).toHaveCount(SEED_TEAMS.length);
    // 시드: 디자인 팀에는 구성원 한 명, 초대 없음.
    await expect(list.getByRole("button", { name: "디자인 팀 수정", exact: true })).toContainText("구성원 1명 · 초대 0명");

    // 같은 이름은 서버가 거절하고 입력을 남긴다.
    await drawer.getByRole("button", { name: "팀 만들기", exact: true }).click();
    const input = drawer.getByRole("textbox", { name: "팀 이름", exact: true });
    await input.fill("플랫폼");
    await drawer.getByRole("button", { name: "팀 생성", exact: true }).click();
    await expect(input).toHaveAccessibleDescription(/같은 이름의 팀이 있습니다/);
    await expect(input).toHaveValue("플랫폼");
    expect((await teams(page)).map((team) => team.teamName).sort()).toEqual([...SEED_TEAMS].sort());

    await input.fill(name);
    const created = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `${O}/teams`);
    await drawer.getByRole("button", { name: "팀 생성", exact: true }).click();
    const creation = await created;
    expect(creation.status()).toBe(201);
    expect(creation.request().headers()["idempotency-key"]).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    await expect(drawer.getByRole("status")).toContainText(`${name} 팀을 저장했습니다`);
    await expect(list.getByRole("button", { name: `${name} 팀 수정`, exact: true })).toContainText("구성원 0명 · 초대 0명");
    const team = (await teams(page)).find((item) => item.teamName === name)!;
    expect(team).toBeTruthy();

    // 이름 변경은 조회가 준 version을 보낸다.
    await list.getByRole("button", { name: `${name} 팀 수정`, exact: true }).click();
    await expect(input).toHaveValue(name);
    await input.fill(renamed);
    const patched = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === `${O}/teams/${team.teamId}`);
    await drawer.getByRole("button", { name: "변경 저장", exact: true }).click();
    const rename = await patched;
    expect(rename.status()).toBe(200);
    expect(rename.request().postDataJSON()).toEqual({ teamName: renamed, expectedVersion: team.version });
    await expect(list.getByRole("button", { name: `${renamed} 팀 수정`, exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
    await expect(drawer).not.toBeVisible();

    // 새로고침해도 남아 있고, 미배정 카드의 선택지에도 새 이름으로 있다.
    await page.reload();
    const options = page.getByRole("region", { name: "팀 미배정 사용자", exact: true }).getByRole("combobox").getByRole("option");
    await expect(options).toHaveCount(SEED_TEAMS.length + 2);
    expect(await options.allTextContents()).toContain(renamed);
    expect(await options.allTextContents()).not.toContain(name);
    const latest = (await teams(page)).find((item) => item.teamId === team.teamId)!;
    expect(latest.teamName).toBe(renamed);
    expect(latest.version).not.toBe(team.version);

    // 삭제는 한 번 더 확인하고 If-Match로 보낸다.
    await page.getByRole("button", { name: "팀 관리", exact: true }).click();
    await list.getByRole("button", { name: `${renamed} 팀 수정`, exact: true }).click();
    await drawer.getByRole("button", { name: "팀 삭제", exact: true }).click();
    const removed = page.waitForResponse((response) => response.request().method() === "DELETE" && new URL(response.url()).pathname === `${O}/teams/${team.teamId}`);
    await drawer.getByRole("button", { name: "팀 삭제 확인", exact: true }).click();
    const removal = await removed;
    expect(removal.status()).toBe(204);
    expect(removal.request().headers()["if-match"]).toBe(`"team-${latest.version}"`);
    await expect(drawer.getByRole("status")).toContainText(`${renamed} 팀을 삭제했습니다`);
    await expect(list.getByRole("listitem")).toHaveCount(SEED_TEAMS.length);
    await drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
    await page.reload();
    await expect(page.getByRole("region", { name: "팀 미배정 사용자", exact: true }).getByRole("combobox").getByRole("option")).toHaveCount(SEED_TEAMS.length + 1);
  } finally {
    for (const team of await teams(page)) {
      if (team.teamName.startsWith("E2E 팀 ")) await authenticatedRequest(page, enrollmentBase(), `${O}/teams/${team.teamId}`, "DELETE", undefined, { "If-Match": `"team-${team.version}"` });
    }
  }
  expect((await teams(page)).map((team) => team.teamName).sort()).toEqual([...SEED_TEAMS].sort());
  await signOut(page);
});

// 초대 코드가 화면에 보이는 시나리오다. 코드 값을 실패 메시지에 싣지 않고, 끝날 때 화면에서 지운 뒤 만든 초대를 모두 취소한다.
test("MEMBERS-W3 @p0 @write 초대 코드를 발급·편집·재발급·취소하고 취소한 사람을 다시 초대한다", async ({ page }) => {
  await openMembers(page, OWNER);
  const email = `e2e-${unique()}@example.test`;
  const pending = page.getByRole("region", { name: "초대 대기", exact: true });
  const waitingCard = page.getByRole("group", { name: "초대 대기", exact: true });
  const dialog = page.getByRole("dialog", { name: "구성원 초대", exact: true });
  const input = dialog.getByRole("textbox", { name: "초대할 이메일" });
  /** 코드 값을 실패 메시지에 싣지 않도록 형식 검사를 참·거짓으로만 단언한다. */
  const readCode = async (scope: typeof pending) => {
    const code = scope.getByLabel(`${email} 초대 코드`, { exact: true });
    await expect(code).toBeVisible();
    const value = await code.innerText();
    expect(CODE.test(value), "초대 코드 형식").toBe(true);
    return value;
  };
  const add = async (value: string) => { await input.fill(value); await input.press("Enter"); await expect(input).toHaveValue(""); };
  try {
    await expect(waitingCard).toContainText("1명");
    // 발급 — 코드는 발급 결과에만 있고, 화면은 발송했다고 말하지 않는다.
    await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
    await dialog.getByRole("combobox", { name: "팀", exact: true }).selectOption({ label: "제품" });
    await add(email);
    const issued = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `${O}/invitations/batch`);
    await dialog.getByRole("button", { name: "1명 초대 코드 발급", exact: true }).click();
    const issue = await issued;
    expect(issue.status()).toBe(200);
    expect(issue.request().headers()["idempotency-key"]).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    const result = dialog.getByRole("status");
    await expect(result).toContainText("초대 코드 1건을 발급했습니다");
    const firstCode = await readCode(result);
    await expect(dialog).not.toContainText(/발송 완료|발송했습니다|보냈습니다/);
    const first = (await invitations(page, "pending")).find((item) => item.email === email)!;
    expect([first.role, first.team?.teamName]).toEqual(["member", "제품"]);

    // 이미 초대한 사람과 이미 구성원인 사람은 새 코드를 받지 않는다.
    await add(email);
    await add("member2@seed-a.example.test");
    await dialog.getByRole("button", { name: "2명 초대 코드 발급", exact: true }).click();
    await expect(result).toContainText("발급한 초대 코드가 없습니다 · 발급하지 않음 2건");
    await expect(result).toContainText("이미 초대한 이메일입니다");
    await expect(result).toContainText("이미 구성원입니다");
    await expect(result.locator("code")).toHaveCount(0);
    await dialog.getByRole("button", { name: "완료", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect((await invitations(page, "pending")).filter((item) => item.email === email)).toHaveLength(1);

    await expect(pending).toContainText(email);
    await expect(pending).toContainText("제품 · 구성원");
    await expect(pending).toContainText("3일 남음");
    await expect(pending.locator("code")).toHaveCount(0);
    await expect(waitingCard).toContainText("2명");
    // 초대 대기자는 아직 명단의 구성원이 아니다.
    await expect(rowOf(page, email)).toHaveCount(0);

    // 대기자 편집 — 초대 목록이 준 구성원 ID와 version으로 저장한다.
    await pending.getByRole("button", { name: `${email} 초대 팀/역할 수정`, exact: true }).click();
    const { drawer, team, role, save } = editor(page);
    await expect(drawer).toContainText(email);
    await expect(role).toHaveValue("member");
    await team.selectOption({ label: "데이터" });
    await role.selectOption("admin");
    const patched = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === `${O}/members/${first.memberId}`);
    await save.click();
    const edit = await patched;
    expect(edit.status()).toBe(200);
    expect(edit.request().postDataJSON().expectedVersion).toBe(first.memberVersion);
    await expect(drawer).not.toBeVisible();
    await expect(toast(page, `${email}의 초대 팀·역할을 변경했습니다.`)).toBeVisible();
    await expect(pending).toContainText("데이터 · 관리자");
    await page.reload();
    await expect(pending).toContainText("데이터 · 관리자");
    const edited = (await invitations(page, "pending")).find((item) => item.email === email)!;
    expect([edited.invitationId, edited.memberId, edited.role, edited.team?.teamName]).toEqual([first.invitationId, first.memberId, "admin", "데이터"]);

    // 재발급 — 기존 초대는 폐기되고 같은 사람에게 새 초대와 새 코드가 생긴다.
    await pending.getByRole("button", { name: `${email} 초대 코드 재발급`, exact: true }).click();
    await expect(pending.getByRole("status")).toContainText("새 초대 코드를 발급했습니다. 이전 코드는 더 이상 쓸 수 없습니다");
    const secondCode = await readCode(pending);
    expect(secondCode !== firstCode, "재발급한 코드는 이전 코드와 다르다").toBe(true);
    await expect(pending).not.toContainText(/발송|보냈/);
    const reissued = (await invitations(page, "pending")).filter((item) => item.email === email);
    expect(reissued).toHaveLength(1);
    expect(reissued[0].invitationId).not.toBe(first.invitationId);
    expect([reissued[0].memberId, reissued[0].role, reissued[0].team?.teamName]).toEqual([first.memberId, "admin", "데이터"]);
    expect((await invitations(page, "revoked")).some((item) => item.invitationId === first.invitationId)).toBe(true);
    await expect(pending.getByText(email, { exact: true })).toHaveCount(1);
    await expect(waitingCard).toContainText("2명");

    // 취소 — 확인한 뒤에 폐기하고 목록에서 빠진다.
    await pending.getByRole("button", { name: `${email} 초대 취소`, exact: true }).click();
    await expect(pending.getByRole("alert")).toContainText("초대 코드를 폐기합니다");
    const revoked = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `${O}/invitations/${reissued[0].invitationId}/revoke`);
    await pending.getByRole("button", { name: "초대 취소 확인", exact: true }).click();
    expect((await revoked).status()).toBe(204);
    await expect(toast(page, `${email}의 초대를 취소했습니다.`)).toBeVisible();
    await expect(pending).not.toContainText(email);
    await expect(waitingCard).toContainText("1명");
    expect((await invitations(page, "pending")).some((item) => item.email === email)).toBe(false);

    // 취소한 사람은 다시 초대할 수 있다. 같은 구성원에게 새 코드가 발급된다.
    await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
    await dialog.getByRole("combobox", { name: "팀", exact: true }).selectOption("");
    await add(email);
    await dialog.getByRole("button", { name: "1명 초대 코드 발급", exact: true }).click();
    await expect(result).toContainText("초대 코드 1건을 발급했습니다");
    expect([firstCode, secondCode].includes(await readCode(result)), "다시 초대한 코드는 새 코드다").toBe(false);
    await dialog.getByRole("button", { name: "완료", exact: true }).click();
    await expect(pending).toContainText(email);
    await expect(pending).toContainText("팀 미배정 · 구성원");
    const again = (await invitations(page, "pending")).find((item) => item.email === email)!;
    expect([again.memberId, again.role, again.team]).toEqual([first.memberId, "member", null]);
  } finally {
    // 실패 스크린샷은 테스트 본문이 끝난 뒤에 찍힌다. 그 전에 코드를 화면에서 지운다(코드는 화면 상태에만 있다).
    await page.reload();
    for (const item of [...await invitations(page, "pending"), ...await invitations(page, "expired")]) {
      if (item.email.startsWith("e2e-")) await authenticatedRequest(page, enrollmentBase(), `${O}/invitations/${item.invitationId}/revoke`, "POST", {}, key());
    }
  }
  // 시드의 대기 1명·만료 1명만 남는다.
  expect((await invitations(page, "pending")).map((item) => item.email)).toEqual(["member12@seed-a.example.test"]);
  expect((await invitations(page, "expired")).map((item) => item.email)).toEqual(["member13@seed-a.example.test"]);
  await signOut(page);
});
