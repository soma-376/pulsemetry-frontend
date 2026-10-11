import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { mockMembers } from "./members-fixture";

test("pending invitations remain below the cards with resend and revoke actions", async ({
  page,
}) => {
  const api = await mockMembers(page, { invitations: [] });
  await openDashboard(page, "/members");
  await expect(
    page.getByRole("region", { name: "등록한 개발자", exact: true }),
  ).toHaveCount(0);
  const pending = page.getByRole("region", { name: "초대 대기", exact: true });
  await expect(pending).toContainText("초대 대기 중인 구성원이 없습니다");
  const cards = pending.locator("..");
  // 요약 카드 넷 다음이 초대 대기 위젯이다(같은 이름의 요약 카드는 위젯이 아니다).
  expect(
    await cards
      .locator(":scope > *")
      .evaluateAll((children) =>
        children.findIndex(
          (child) =>
            child.tagName === "SECTION" &&
            child.getAttribute("aria-label") === "초대 대기",
        ),
      ),
  ).toBe(4);
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "구성원 초대", exact: true });
  const email = dialog.getByRole("textbox", { name: "초대할 이메일" });
  await email.fill("pending@example.test");
  await email.press("Enter");
  await dialog
    .getByRole("button", { name: "1명 초대 코드 발급", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "초대 코드 1건을 발급했습니다",
  );
  await dialog.getByRole("button", { name: "완료", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(pending).toContainText("pending@example.test");
  await expect(pending).toContainText("3일 남음");
  await expect(
    page.getByRole("group", { name: "초대 대기", exact: true }),
  ).toContainText("1명");
  // 목록에는 코드가 없다. 발급 창을 닫으면 다시 볼 수 없다.
  await expect(pending.locator("code")).toHaveCount(0);

  // 발급 직후의 메일은 발송 대기다. 발송됨이라고 말하지 않는다.
  await expect(
    pending.getByLabel("pending@example.test 메일 발송 상태", { exact: true }),
  ).toHaveText("메일 발송 대기");
  // 다시 보내기는 기존 코드를 폐기하는 일이라 먼저 알리고 확인받는다.
  const first = api.invitations.find(
    (item) => item.email === "pending@example.test",
  )!.invitationId;
  await pending
    .getByRole("button", {
      name: "pending@example.test 초대 다시 보내기",
      exact: true,
    })
    .click();
  await expect(pending.getByRole("alert")).toContainText(
    "이전 메일의 설치 코드는 더 이상 쓸 수 없습니다",
  );
  expect(
    api.commands.some((command) => command.path.endsWith("/reissue")),
  ).toBe(false);
  await pending
    .getByRole("button", { name: "다시 보내기 확인", exact: true })
    .click();
  const resendToast = page.getByRole("status").filter({
    hasText: "pending@example.test의 새 초대 메일을 발송 대기열에 넣었습니다.",
  });
  await expect(resendToast).toBeVisible();
  await expect(pending).not.toContainText("발송 대기열에 넣었습니다");
  await expect(pending).toContainText(
    "이전 설치 코드는 더 이상 쓸 수 없습니다",
  );
  await resendToast.getByRole("button", { name: "알림 닫기" }).click();
  await expect(resendToast).not.toBeVisible();
  await expect(
    pending.getByLabel("pending@example.test 초대 코드", { exact: true }),
  ).toHaveText("FAKE-CODE-0002");
  await expect(pending).not.toContainText(/발송됨|발송 완료|보냈습니다/);
  const reissue = api.commands.find((command) =>
    command.path.endsWith("/reissue"),
  )!;
  expect(reissue.path).toBe(`invitations/${first}/reissue`);
  expect(reissue.body).toEqual({});
  expect(reissue.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  await expect(
    pending.getByRole("button", {
      name: "pending@example.test 초대 다시 보내기",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    pending.locator(".font-mono").filter({ hasText: "pending@example.test" }),
  ).toHaveCount(1);

  // 초대 대기자는 아직 구성원이 아니다.
  const members = page.getByRole("region", {
    name: "구성원 목록",
    exact: true,
  });
  await members
    .getByRole("textbox", { name: "구성원 검색" })
    .fill("pending@example.test");
  await members.getByRole("textbox", { name: "구성원 검색" }).press("Enter");
  await expect(
    members.getByRole("button", { name: /구성원 상세$/ }),
  ).toHaveCount(0);
  await members.getByRole("textbox", { name: "구성원 검색" }).fill("");
  await expect(members.getByText("벤더 좌석", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "test-results/members-pending-desktop.png",
    fullPage: true,
  });
  await members.screenshot({ path: "test-results/members-table-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "내비게이션 접기/펼치기" }).click();
  await members.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/members-pending-mobile.png",
    fullPage: true,
  });
  await members.locator(".overflow-x-auto").evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await members.screenshot({ path: "test-results/members-table-mobile.png" });

  // 취소는 한 번 더 확인한 뒤에 보낸다. 재발급으로 바뀐 초대 ID를 쓴다.
  const second = api.invitations.find(
    (item) =>
      item.email === "pending@example.test" && item.status === "pending",
  )!.invitationId;
  expect(second).not.toBe(first);
  await pending
    .getByRole("button", {
      name: "pending@example.test 초대 취소",
      exact: true,
    })
    .click();
  await expect(pending.getByRole("alert")).toContainText(
    "초대 코드를 폐기합니다",
  );
  await pending.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(pending.getByRole("alert")).toHaveCount(0);
  expect(api.commands.some((command) => command.path.endsWith("/revoke"))).toBe(
    false,
  );
  await pending
    .getByRole("button", {
      name: "pending@example.test 초대 취소",
      exact: true,
    })
    .click();
  await pending
    .getByRole("button", { name: "초대 취소 확인", exact: true })
    .click();
  await expect(pending).toContainText("초대 대기 중인 구성원이 없습니다");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "pending@example.test의 초대를 취소했습니다." }),
  ).toBeVisible();
  expect(
    api.commands.find((command) => command.path.endsWith("/revoke"))!.path,
  ).toBe(`invitations/${second}/revoke`);
});
