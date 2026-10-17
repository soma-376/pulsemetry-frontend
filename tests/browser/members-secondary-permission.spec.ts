import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { mockMembers } from "./members-fixture";
import { serveSettings } from "./onboarding-fixture";

for (const secondary of ["teams?*", "invitations?*"]) {
  for (const cached of [false, true]) {
    test(`구성원 ${secondary} 권한 거부는 ${cached ? "재조회" : "최초 조회"}에서도 안내와 복구 경로를 표시한다`, async ({
      page,
    }) => {
      serveSettings(page);
      await mockMembers(page, { invitations: [] });
      const roster = page.getByRole("region", {
        name: "구성원 목록",
        exact: true,
      });
      if (cached) {
        await openDashboard(page, "/members");
        await expect(roster).toBeVisible();
      }
      let fail = true;
      let deniedRequests = 0;
      await page.route(`**/api/v1/organizations/*/${secondary}`, (route) => {
        if (!fail) return route.fallback();
        deniedRequests++;
        return route.fulfill({
          status: 403,
          json: { error: { code: "forbidden", message: "isolated forbidden" } },
        });
      });
      if (cached) {
        await page
          .getByRole("toolbar", { name: "공통 조회 도구" })
          .getByRole("button", { name: "새로고침", exact: true })
          .click();
      } else {
        await openDashboard(page, "/members");
      }
      await expect.poll(() => deniedRequests).toBeGreaterThan(0);
      await expect(roster).toHaveCount(0);
      const error = page.getByRole("alert").filter({
        hasText: "관리자 권한이 필요합니다.",
      });
      await expect(error).toBeVisible();
      const retry = error.getByRole("button", {
        name: "다시 조회",
        exact: true,
      });
      await expect(retry).toBeEnabled();
      fail = false;
      await retry.click();
      await expect(error).toHaveCount(0);
      await expect(roster).toBeVisible();
    });
  }
}

test("열린 구성원 상세의 재조회 권한 거부는 이전 입력을 숨기고 재시도 성공 뒤 복구한다", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-17T02:00:00Z") });
  const state = await mockMembers(page, { invitations: [] });
  await openDashboard(page, "/members");
  await page.getByRole("button", { name: /자동 갱신/ }).click();
  const target = state.members.find((member) => member.role === "member")!;
  await page.getByRole("textbox", { name: "구성원 검색" }).fill(target.account);
  await page
    .getByRole("button", { name: `${target.account} 구성원 상세`, exact: true })
    .click();
  const detail = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  const team = detail.getByRole("combobox", { name: "팀", exact: true });
  await expect(team).toBeEnabled();
  let deny = true;
  let deniedRequests = 0;
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) =>
      url.pathname.endsWith("/members") &&
      url.searchParams.get("memberId") === target.memberId,
    async (route) => {
      if (deny) {
        deniedRequests++;
        return route.fulfill({
          status: 403,
          json: { error: { code: "forbidden" } },
        });
      }
      await pending;
      return route.fallback();
    },
  );
  // 모달 밖 툴바를 강제로 누르지 않고 정상 자동 갱신으로 상세 재조회를 유발한다.
  await page.clock.fastForward(300_001);
  await expect.poll(() => deniedRequests).toBeGreaterThan(0);
  const error = detail
    .getByRole("alert")
    .filter({ hasText: "관리자 권한이 필요합니다." });
  await expect(error).toBeVisible();
  await expect(team).toHaveCount(0);
  await expect(
    detail.getByRole("button", { name: "변경사항 저장", exact: true }),
  ).toHaveCount(0);
  deny = false;
  try {
    await error.getByRole("button", { name: "다시 조회", exact: true }).click();
    await expect(team).toHaveCount(0);
  } finally {
    release();
  }
  await expect(error).toHaveCount(0);
  await expect(team).toBeEnabled();
  expect(state.commands).toHaveLength(0);
});
