import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { mockMembers } from "./members-fixture";
import { serveSettings } from "./onboarding-fixture";

for (const editing of [false, true]) {
  test(`팀 ${editing ? "이름 변경" : "생성"} 중 입력·충돌 동작을 잠그고 실패 후 재시도한다`, async ({
    page,
  }) => {
    serveSettings(page);
    const api = await mockMembers(page, { invitations: [] });
    await openDashboard(page, "/members");
    await page.getByRole("button", { name: "팀 관리", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "팀 관리", exact: true });
    await drawer
      .getByRole("button", {
        name: editing ? "플랫폼 팀 수정" : "팀 만들기",
        exact: true,
      })
      .click();
    const name = drawer.getByRole("textbox", { name: "팀 이름", exact: true });
    const draft = editing ? "플랫폼 변경" : "새로운 팀";
    await name.fill(draft);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let fail = true;
    let requests = 0;
    await page.route("**/api/v1/organizations/*/teams{,/*}", async (route) => {
      if (!["POST", "PATCH"].includes(route.request().method()))
        return route.fallback();
      requests++;
      if (!fail) return route.fallback();
      await held;
      await route.fulfill({
        status: 503,
        json: { error: { code: "unavailable", message: "isolated failure" } },
      });
    });
    try {
      await drawer
        .getByRole("button", {
          name: editing ? "변경 저장" : "팀 생성",
          exact: true,
        })
        .dblclick();
      await expect.poll(() => requests).toBe(1);
      await expect(
        drawer.getByRole("button", { name: "저장 중…", exact: true }),
      ).toBeDisabled();
      await expect(name).toBeDisabled();
      await expect(
        drawer.getByRole("button", { name: "취소", exact: true }),
      ).toBeDisabled();
      await expect(
        drawer.getByRole("button", { name: "상세 패널 닫기", exact: true }),
      ).toBeDisabled();
      await expect(
        drawer.getByText("요청 처리 중에는 닫을 수 없습니다"),
      ).toBeVisible();
      if (editing)
        await expect(
          drawer.getByRole("button", { name: "팀 삭제", exact: true }),
        ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(drawer).toBeVisible();
    } finally {
      release();
    }
    await expect(drawer.getByRole("alert")).toContainText(
      "서버에 연결하지 못했습니다",
    );
    await expect(name).toBeEnabled();
    await expect(
      drawer.getByText("Esc 키 또는 바깥 영역을 눌러 닫기"),
    ).toBeVisible();
    await expect(name).toHaveValue(draft);
    await expect(
      drawer.getByRole("button", { name: "상세 패널 닫기", exact: true }),
    ).toBeEnabled();
    expect(
      api.commands.filter((command) => command.path.startsWith("teams")),
    ).toHaveLength(0);
    fail = false;
    await drawer
      .getByRole("button", {
        name: editing ? "변경 저장" : "팀 생성",
        exact: true,
      })
      .click();
    await expect(
      drawer.getByRole("button", { name: `${draft} 팀 수정`, exact: true }),
    ).toBeVisible();
    expect(requests).toBe(2);
    expect(
      api.commands.filter((command) => command.path.startsWith("teams")),
    ).toHaveLength(1);
    await drawer
      .getByRole("button", { name: "상세 패널 닫기", exact: true })
      .click();
    await expect(drawer).not.toBeVisible();
  });
}
