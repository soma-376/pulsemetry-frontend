import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { mockMembers } from "./members-fixture";

for (const gesture of ["double click", "dismiss while pending"] as const) {
  test(`member save serializes ${gesture} and recovers from a failed save`, async ({
    page,
  }) => {
    const api = await mockMembers(page);
    const target = api.members.find(
      (member) => member.role === "member" && member.periodUsage,
    )!;
    let attempts = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/api/bff/enrollment/api/v1/organizations/*/members/*",
      async (route) => {
        if (route.request().method() !== "PATCH") return route.fallback();
        const attempt = ++attempts;
        await pending;
        if (attempt === 1) {
          return route.fulfill({
            status: 503,
            json: {
              error: {
                code: "unavailable",
                message: "Temporary local test failure",
              },
            },
          });
        }
        return route.fallback();
      },
    );
    await openDashboard(page, "/members");
    await page
      .getByRole("textbox", { name: "구성원 검색" })
      .fill(target.account);
    await page
      .getByRole("button", {
        name: `${target.account} 구성원 상세`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "구성원 상세",
      exact: true,
    });
    const team = dialog.getByLabel("팀", { exact: true });
    const destination =
      target.team.teamId === "team-data" ? "team-platform" : "team-data";
    await team.selectOption(destination);
    const save = dialog.getByRole("button", {
      name: "변경사항 저장",
      exact: true,
    });
    try {
      if (gesture === "double click") await save.dblclick();
      else await save.click();
      await expect.poll(() => attempts).toBeGreaterThan(0);
      await expect(team).toBeDisabled();
      await expect(
        dialog.getByRole("button", { name: "상세 패널 닫기" }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await page.mouse.click(20, 200);
      await expect(dialog).toBeVisible();
      // Let any duplicate second event finish dispatching while the first response is held.
      await expect.poll(() => attempts).toBe(1);
    } finally {
      release();
    }
    await expect(dialog.getByRole("alert")).toContainText(
      "서버에 연결하지 못했습니다",
    );
    await expect(team).toHaveValue(destination);
    await expect(team).toBeEnabled();
    await save.click();
    await expect(dialog).not.toBeVisible();
    expect(attempts).toBe(2);
    expect(target.team.teamId).toBe(destination);
    expect(
      api.commands.filter((command) => command.method === "PATCH"),
    ).toHaveLength(1);
  });
}
