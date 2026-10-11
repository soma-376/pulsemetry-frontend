import { expect, test } from "./fixtures";
import { signIn } from "./helpers";

// 역할 설명을 실제 서버·시드로 본다. 기대값은 대시보드 명세 §1(조직 조회는 owner·admin만, 구성원은 403)에서 쓴다.
// 쓰기는 없다(초대·역할 변경을 저장하지 않는다).
const MEMBER_HINT =
  "구성원은 웹 대시보드에 접근하지 않습니다. CLI를 설치해 자기 사용량을 수집하는 대상입니다";
const ADMIN_HINT =
  "관리자는 웹 대시보드를 보고 계약·수집 정책·팀·구성원을 변경합니다";

test("ROLE-TEXT @p1 @read 초대와 역할 편집의 역할 설명이 서버 인가와 같다 — 구성원은 대시보드에 접근하지 않는다", async ({
  page,
}) => {
  await signIn(page, "owner@seed-a.example.test");
  await page.goto("/members");
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  const invite = page.getByRole("dialog", { name: "구성원 초대", exact: true });
  await expect(invite).toContainText(MEMBER_HINT);
  await invite
    .getByRole("combobox", { name: "역할", exact: true })
    .selectOption("admin");
  await expect(invite).toContainText(ADMIN_HINT);
  await expect(invite).not.toContainText("조회만");
  await page.keyboard.press("Escape");
  await expect(invite).toHaveCount(0);
  // 구성원 상세의 역할 편집도 같은 문장이다.
  await page
    .getByRole("region", { name: "구성원 목록", exact: true })
    .getByRole("button", {
      name: "member3@seed-a.example.test 구성원 상세",
      exact: true,
    })
    .click();
  const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  await expect(drawer.getByLabel("역할", { exact: true })).toHaveValue(
    "member",
  );
  await expect(drawer).toContainText(MEMBER_HINT);
});
