import { expect, test } from "@playwright/test";
import { openDashboard, saveOnboardingContract, signIn } from "./helpers";
import {
  fixtureInvitations,
  mockMembers,
  notSent,
  type FixtureInvitation,
} from "./members-fixture";

const base = fixtureInvitations[0];
const invitation = (
  id: string,
  email: string,
  delivery: FixtureInvitation["delivery"],
): FixtureInvitation => ({
  ...base,
  invitationId: id,
  email,
  memberId: `member-${id}`,
  status: "pending",
  expiresAt: new Date(Date.now() + 60 * 3_600_000).toISOString(),
  delivery,
});
const mail = (
  status: string,
  extra: Partial<FixtureInvitation["delivery"]> = {},
): FixtureInvitation["delivery"] => ({
  status,
  reason: null,
  queuedAt: "2026-09-30T13:00:00Z",
  lastAttemptAt: null,
  sentAt: null,
  failureCode: null,
  attempts: 0,
  ...extra,
});

test("the waiting list shows each mail's delivery state and says sent only when the server does", async ({
  page,
}) => {
  const api = await mockMembers(page, {
    invitations: [
      invitation("i-queued", "queued@example.test", mail("queued")),
      invitation(
        "i-sent",
        "sent@example.test",
        mail("sent", {
          sentAt: "2026-09-30T13:43:38Z",
          lastAttemptAt: "2026-09-30T13:43:38Z",
          attempts: 1,
        }),
      ),
      invitation(
        "i-failed",
        "failed@example.test",
        mail("failed", {
          failureCode: "recipient_rejected",
          lastAttemptAt: "2026-09-30T13:01:00Z",
          attempts: 1,
        }),
      ),
      invitation(
        "i-retry",
        "retry@example.test",
        mail("queued", {
          failureCode: "smtp_unavailable",
          lastAttemptAt: "2026-09-30T13:01:00Z",
          attempts: 1,
        }),
      ),
      invitation("i-none", "none@example.test", notSent("not_queued")),
    ],
  });
  await openDashboard(page, "/members");
  const pending = page.getByRole("region", { name: "초대 대기", exact: true });
  const state = (email: string) =>
    pending.getByLabel(`${email} 메일 발송 상태`, { exact: true });
  await expect(state("queued@example.test")).toHaveText("메일 발송 대기");
  await expect(state("sent@example.test")).toHaveText(
    "메일 발송됨 · 2026.09.30 22:43",
  );
  await expect(state("failed@example.test")).toHaveText(
    "메일 발송 실패 · 받는 메일 서버가 주소를 거부했습니다",
  );
  await expect(state("retry@example.test")).toHaveText(
    "발송 재시도 대기 · 메일 서버에 연결하지 못했습니다",
  );
  await expect(state("none@example.test")).toHaveText("보낸 메일 없음");
  // 발송됨은 서버가 sent라고 한 한 건뿐이다.
  await expect(pending.getByText(/메일 발송됨/)).toHaveCount(1);

  // 발송 작업이 끝나면(서버 상태가 바뀌면) 목록이 스스로 따라온다.
  const waiting = api.invitations.find(
    (item) => item.invitationId === "i-queued",
  )!;
  waiting.delivery = mail("sent", {
    sentAt: "2026-09-30T13:50:00Z",
    lastAttemptAt: "2026-09-30T13:50:00Z",
    attempts: 1,
  });
  await expect(state("queued@example.test")).toHaveText(
    "메일 발송됨 · 2026.09.30 22:50",
  );

  // 실패한 메일은 다시 보낼 수 있다. 다시 보내기는 새 코드의 새 메일이다.
  await pending
    .getByRole("button", {
      name: "failed@example.test 초대 다시 보내기",
      exact: true,
    })
    .click();
  await expect(pending.getByRole("alert")).toContainText(
    "새 코드를 발급하고 초대 메일을 다시 보냅니다. 이전 메일의 설치 코드는 더 이상 쓸 수 없습니다.",
  );
  await pending
    .getByRole("button", { name: "다시 보내기 확인", exact: true })
    .click();
  await expect(state("failed@example.test")).toHaveText("메일 발송 대기");
  await expect(
    page.getByRole("status").filter({
      hasText: "failed@example.test의 새 초대 메일을 발송 대기열에 넣었습니다.",
    }),
  ).toBeVisible();
  await expect(pending).not.toContainText("발송 대기열에 넣었습니다");
  expect(
    api.commands
      .filter((command) => command.path.endsWith("/reissue"))
      .map((command) => command.path),
  ).toEqual(["invitations/i-failed/reissue"]);
  expect(
    api.invitations.find((item) => item.invitationId === "i-failed")!.status,
  ).toBe("revoked");
});

test("a server that does not send mail keeps the code-copy guidance and never says queued", async ({
  page,
}) => {
  const api = await mockMembers(page, {
    invitations: [
      invitation("i-off", "off@example.test", notSent("mail_disabled")),
    ],
    mail: false,
  });
  await openDashboard(page, "/members");
  const pending = page.getByRole("region", { name: "초대 대기", exact: true });
  await expect(
    pending.getByLabel("off@example.test 메일 발송 상태", { exact: true }),
  ).toHaveText("메일 발송 꺼짐 · 코드를 직접 전달하세요");
  // 메일이 없으면 "다시 보내기"가 아니라 코드 재발급이다.
  await expect(
    pending.getByRole("button", { name: /다시 보내기/ }),
  ).toHaveCount(0);
  await pending
    .getByRole("button", {
      name: "off@example.test 초대 코드 재발급",
      exact: true,
    })
    .click();
  await expect(pending.getByRole("alert")).toContainText(
    "새 코드를 발급합니다. 이전 코드는 더 이상 쓸 수 없습니다.",
  );
  await pending
    .getByRole("button", { name: "코드 재발급 확인", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "off@example.test의 새 초대 코드를 발급했습니다." }),
  ).toBeVisible();
  await expect(pending).toContainText(
    "메일을 발송하지 않습니다. 코드는 지금만 볼 수 있으니 대상자에게 직접 전달하세요.",
  );
  await expect(
    pending.getByLabel("off@example.test 초대 코드", { exact: true }),
  ).toHaveText("FAKE-CODE-0001");

  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  const input = dialog.getByRole("textbox", { name: "초대할 이메일" });
  await input.fill("manual@example.test");
  await input.press("Enter");
  await dialog
    .getByRole("button", { name: "1명 초대 코드 발급", exact: true })
    .click();
  const result = dialog.getByRole("status");
  await expect(result).toContainText(
    "메일을 발송하지 않습니다. 코드는 지금만 볼 수 있으니 대상자에게 직접 전달하세요.",
  );
  await expect(result).toContainText("메일 발송 꺼짐");
  await expect(
    result.getByLabel("manual@example.test 초대 코드", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/발송 대기|발송됨/)).toHaveCount(0);
  expect(
    api.invitations.find((item) => item.email === "manual@example.test")!
      .delivery.status,
  ).toBe("not_sent");
});

test("issuing from the invite dialog reports queued mail, not delivered mail", async ({
  page,
}) => {
  await mockMembers(page, { invitations: [] });
  await openDashboard(page, "/members");
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  const input = dialog.getByRole("textbox", { name: "초대할 이메일" });
  await input.fill("queued@example.test");
  await input.press("Enter");
  await dialog
    .getByRole("button", { name: "1명 초대 코드 발급", exact: true })
    .click();
  const result = dialog.getByRole("status");
  await expect(result).toContainText("초대 코드 1건을 발급했습니다");
  await expect(result).toContainText(
    "초대 메일을 발송 대기열에 넣었습니다. 발송 결과는 초대 대기 목록에서 확인하세요.",
  );
  await expect(result).toContainText("메일 발송 대기");
  await expect(dialog).not.toContainText(/발송됨|발송 완료|보냈습니다/);
  // 메일이 실패할 때를 위해 코드는 여전히 복사할 수 있다.
  await expect(
    result.getByLabel("queued@example.test 초대 코드", { exact: true }),
  ).toHaveText("FAKE-CODE-0001");
});

test("the onboarding team step issues invitations through the same command", async ({
  page,
}) => {
  const api = await mockMembers(page, { invitations: [] });
  await page.goto("/login");
  await signIn(page);
  await page.getByRole("radio", { name: /^수집하지 않음/ }).check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await saveOnboardingContract(page);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const invite = page.getByRole("region", { name: "구성원 초대", exact: true });
  await expect(invite).not.toContainText("연동 준비 중");
  const input = invite.getByRole("textbox", { name: "초대할 이메일" });
  await expect(input).toBeEnabled();
  // 팀 선택지는 서버의 팀 목록이다.
  await invite
    .getByRole("combobox", { name: "팀", exact: true })
    .selectOption({ label: "플랫폼" });
  await input.fill("first@example.test");
  await input.press("Enter");
  expect(
    api.commands.filter((command) => command.path === "invitations/batch"),
  ).toHaveLength(0);
  await invite
    .getByRole("button", { name: "1명 초대 코드 발급", exact: true })
    .click();
  await expect(invite.getByRole("status")).toContainText(
    "초대 코드 1건을 발급했습니다",
  );
  await expect(invite.getByRole("status")).toContainText("메일 발송 대기");
  const batch = api.commands.filter(
    (command) => command.path === "invitations/batch",
  );
  expect(batch).toHaveLength(1);
  expect(batch[0].body).toEqual({
    invitations: [
      { email: "first@example.test", teamId: "team-platform", role: "member" },
    ],
  });
  expect(batch[0].idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  // 초대는 온보딩 완료의 조건이 아니다. 그대로 끝낼 수 있다.
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page).toHaveURL(/\/overview(?:\?.*)?$/);
});
