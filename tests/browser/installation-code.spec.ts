import { expect, test, type Page } from "@playwright/test";
import { openDashboard } from "./helpers";
import { mockMembers, type MembersFixture } from "./members-fixture";

// 활성 구성원의 설치 전용 코드(서버 ADR 0055). 코드 발급과 메일 발송은 다른 사실이다 — 발송 상태는 서버 값으로만 보인다.
const issued = (api: MembersFixture) => api.commands.filter((command) => command.method === "POST" && command.path.endsWith("/installation-invitations"));

async function openMember(page: Page, account: string) {
  const members = page.getByRole("region", { name: "구성원 목록", exact: true });
  await members.getByRole("textbox", { name: "구성원 검색" }).fill(account);
  await members.getByRole("button", { name: `${account} 구성원 상세`, exact: true }).click();
  return page.getByRole("dialog", { name: "구성원 상세", exact: true }).getByRole("region", { name: "설치 코드", exact: true });
}

test("활성 구성원 상세에서 설치 코드를 발급하면 코드와 메일 발송 상태를 따로 보이고, 발송 결과를 다시 읽으며, 다시 내면 이전 코드를 폐기했다고 말한다", async ({ page }) => {
  const api = await mockMembers(page);
  await openDashboard(page, "/members");
  const target = api.members[0];
  const panel = await openMember(page, target.account);
  await expect(panel).toContainText("가입에는 쓸 수 없고 설치에 한 번 씁니다");
  const waiting = panel.getByRole("status", { name: `${target.account} 쓰지 않은 설치 코드`, exact: true });
  await expect(waiting).toHaveText("쓰지 않은 설치 코드가 없습니다.");
  const start = panel.getByRole("button", { name: `${target.account} 설치 코드 발급`, exact: true });

  // 확인 전에는 보내지 않는다.
  await start.click();
  await expect(panel.getByRole("alert")).toContainText("이전에 발급한 설치 코드는 더 이상 쓸 수 없습니다");
  await panel.getByRole("button", { name: "되돌리기", exact: true }).click();
  expect(issued(api)).toHaveLength(0);

  await start.click();
  await panel.getByRole("button", { name: "발급 확인", exact: true }).click();
  const result = panel.getByRole("status", { name: `${target.account} 설치 코드 발급 결과`, exact: true });
  await expect(result.getByLabel(`${target.account} 설치 코드`, { exact: true })).toHaveText("FAKE-INST-0001");
  // 발송 상태는 서버의 초대 목록 값이다 — 발급 결과와 따로 보인다.
  const delivery = waiting.getByLabel(`${target.account} 설치 코드 메일 발송 상태`, { exact: true });
  await expect(delivery).toHaveText("메일 발송 대기");
  await expect(waiting).toContainText("발급 ·");
  await expect(result).toContainText("계정 만들기 링크는 없습니다");
  expect(issued(api)).toHaveLength(1);
  expect(issued(api)[0]).toMatchObject({ path: `members/${target.memberId}/installation-invitations`, body: { expectedVersion: target.version } });

  // 발송 작업이 보내면 목록이 sent 를 준다 — 화면이 다시 읽어 바꾼다.
  const invitation = api.invitations.find((item) => item.memberId === target.memberId)!;
  invitation.delivery = { ...invitation.delivery, status: "sent", lastAttemptAt: "2026-09-22T00:00:05Z", sentAt: "2026-09-22T00:00:05Z", attempts: 1 };
  await expect(delivery).toContainText("메일 발송됨", { timeout: 10_000 });

  await start.click();
  await panel.getByRole("button", { name: "발급 확인", exact: true }).click();
  await expect(result.getByLabel(`${target.account} 설치 코드`, { exact: true })).toHaveText("FAKE-INST-0002");
  await expect(result).toContainText("이전 설치 코드 1개는 더 이상 쓸 수 없습니다");
  expect(api.invitations.find((item) => item.invitationId === invitation.invitationId)!.status).toBe("revoked");
});

test("메일이 꺼진 서버에서는 코드를 직접 전달하라고 하고, 상세를 연 뒤 구성원이 바뀌었으면 거절 사유를 보인다", async ({ page }) => {
  const api = await mockMembers(page, { mail: false });
  await openDashboard(page, "/members");
  const [first, second] = api.members;
  let panel = await openMember(page, first.account);
  await panel.getByRole("button", { name: `${first.account} 설치 코드 발급`, exact: true }).click();
  await panel.getByRole("button", { name: "발급 확인", exact: true }).click();
  const result = panel.getByRole("status", { name: `${first.account} 설치 코드 발급 결과`, exact: true });
  await expect(panel.getByLabel(`${first.account} 설치 코드 메일 발송 상태`, { exact: true })).toHaveText("메일 발송 꺼짐 · 코드를 직접 전달하세요");
  await expect(result).toContainText("코드는 지금만 볼 수 있으니 대상자에게 직접 전달하세요");
  await page.getByRole("button", { name: "상세 패널 닫기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "구성원 상세", exact: true })).toBeHidden();

  panel = await openMember(page, second.account);
  // 다른 곳에서 이 구성원이 바뀌었다 — 서버는 409 version_conflict 로 거절한다.
  api.members.find((member) => member.memberId === second.memberId)!.version += 1;
  await panel.getByRole("button", { name: `${second.account} 설치 코드 발급`, exact: true }).click();
  await panel.getByRole("button", { name: "발급 확인", exact: true }).click();
  await expect(panel).toContainText("다른 곳에서 변경되었습니다");
  await expect(panel.getByRole("status", { name: `${second.account} 설치 코드 발급 결과`, exact: true })).toHaveCount(0);
});

test("초대 대기자의 상세에는 설치 코드 발급이 없다 — 초대를 다시 보낸다", async ({ page }) => {
  const api = await mockMembers(page);
  await openDashboard(page, "/members");
  const waiting = api.invitations.find((item) => item.status === "pending")!;
  await page.getByRole("button", { name: `${waiting.email} 초대 팀/역할 수정`, exact: true }).click();
  const modal = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  await expect(modal).toContainText(waiting.email);
  await expect(modal.getByRole("region", { name: "설치 코드", exact: true })).toHaveCount(0);
});
