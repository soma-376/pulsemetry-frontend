import { expect, authenticatedTest as test } from "./fixtures";
import { mockTeams } from "./teams-fixture";
import { mockIngestStatus } from "./overview-fixture";

for (const choice of [
  { name: "결제", count: 5 },
  { name: "플랫폼", count: 24 },
]) {
  test(`새 snapshot에서도 사용자 팀·정렬·표시 개수를 유지한다 (${choice.name})`, async ({
    page,
  }) => {
    let snapshot = 1;
    await mockTeams(page, {
      modify: (data) => {
        data.meta.snapshotId = `refresh-${snapshot}`;
      },
    });
    await mockIngestStatus(page);
    await page.goto(
      "/teams?startDate=2026-09-07&endDate=2026-09-13&compare=none",
    );
    const users = page.getByRole("region", {
      name: "사용자별 사용량",
      exact: true,
    });
    const selected = users.getByRole("button", {
      name: choice.name,
      exact: true,
    });
    await selected.click();
    const accountSort = users.getByRole("button", {
      name: "계정 정렬",
      exact: true,
    });
    await accountSort.click();
    await expect(users).not.toContainText("모아 정렬하는 중입니다");
    if (choice.count === 24)
      await users
        .getByRole("button", { name: "다음 12명 더보기", exact: true })
        .click();
    await expect(users).toContainText(`${choice.count}명 합계`);
    snapshot++;
    const freshUsers = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname.endsWith("/users") &&
        url.searchParams.get("snapshotId") === `refresh-${snapshot}`
      );
    });
    await page.getByRole("button", { name: "새로고침", exact: true }).click();
    await freshUsers;
    await expect
      .poll(() =>
        page.getByRole("button", { name: "조회 중…", exact: true }).count(),
      )
      .toBe(0);
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(accountSort).toHaveAccessibleDescription(/오름차순 정렬 중/);
    await expect(users).toContainText(`${choice.count}명 합계`);
    if (choice.count === 24) {
      await page
        .getByRole("combobox", { name: "비교", exact: true })
        .selectOption("prev_week");
      await expect(accountSort).toHaveAccessibleDescription(
        /클릭하면 오름차순/,
      );
      await expect(users).toContainText("12명 합계");
    }
  });
}

test("재조회에서 선택한 팀이 사라지면 남은 첫 팀으로 이동한다", async ({
  page,
}) => {
  let removed = false;
  await mockTeams(page, {
    modify: (data) => {
      data.meta.snapshotId = removed ? "removed" : "original";
      if (removed) {
        data.teams.items = data.teams.items.filter(
          (team) => team.teamId !== "team_payments",
        );
        data.teams.totalCount = data.teams.items.length;
      }
    },
  });
  await mockIngestStatus(page);
  await page.goto(
    "/teams?startDate=2026-09-07&endDate=2026-09-13&compare=none",
  );
  const users = page.getByRole("region", {
    name: "사용자별 사용량",
    exact: true,
  });
  await users.getByRole("button", { name: "결제", exact: true }).click();
  await expect(users).toContainText("5명 합계");
  removed = true;
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(
    users.getByRole("button", { name: "결제", exact: true }),
  ).toHaveCount(0);
  await expect(
    users.getByRole("button", { name: "플랫폼", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(users).toContainText("12명 합계");
});
