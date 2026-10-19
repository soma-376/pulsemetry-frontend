import { expect, test, type Page } from "./fixtures";
import { openDashboard } from "./helpers";
import { fixtureMembers, mockMembers } from "./members-fixture";

async function prepare(page: Page) {
  const members = fixtureMembers(53).map((member, index) => ({
    ...member,
    team: { teamId: "team-platform", teamName: "플랫폼" },
    status: index === 52 ? "suspended" : "active",
  }));
  const state = await mockMembers(page, { members, invitations: [] });
  await openDashboard(page, "/teams");
  // helper의 nav click 뒤 실제 경로 전환이 끝나야 이전 개요를 reload하지 않는다.
  await expect(page).toHaveURL(/\/teams(?:\?.*)?$/);
  await expect(
    page.getByRole("button", { name: "팀 관리", exact: true }),
  ).toBeVisible();
  // 온보딩이 읽었던 디렉터리 캐시와 무관하게 관리 드로어의 최초 조회를 검사한다.
  await page.reload();
  await expect(
    page.getByRole("button", { name: "팀 관리", exact: true }),
  ).toBeVisible();
  return state;
}

test("팀 관리는 전체 현재 구성원 53명과 빈 팀 0명을 표시하며 명단을 내려받지 않는다", async ({
  page,
}) => {
  await prepare(page);
  const rosterRequests: string[] = [];
  page.on("request", (request) => {
    if (
      /\/api\/v1\/organizations\/[^/]+\/members(?:\/|$)/.test(
        new URL(request.url()).pathname,
      )
    )
      rosterRequests.push(request.url());
  });
  await page.getByRole("button", { name: "팀 관리", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "팀 관리", exact: true });
  const platform = drawer.getByRole("button", { name: "플랫폼 팀 수정" });
  await expect(platform).toContainText("구성원 53명");
  await expect(
    drawer.getByRole("button", { name: "제품 팀 수정" }),
  ).toContainText("구성원 0명");
  await platform.click();
  await expect(drawer.getByRole("region", { name: "팀 삭제" })).toContainText(
    "현재 구성원 53명이 미배정이 됩니다",
  );
  expect(rosterRequests).toEqual([]);
});

test("인원 필드가 없는 이전 서버 응답은 0명 대신 확인 불가로 안내한다", async ({
  page,
}) => {
  const state = await prepare(page);
  await page.route("**/api/v1/organizations/*/teams?*", (route) =>
    route.fulfill({
      json: {
        meta: {
          organizationId: new URL(route.request().url()).pathname
            .split("/organizations/")[1]
            .split("/")[0],
          snapshotId: "older-directory",
        },
        teams: { items: state.teams, nextCursor: null },
      },
    }),
  );
  await page.getByRole("button", { name: "팀 관리", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "팀 관리", exact: true });
  const platform = drawer.getByRole("button", { name: "플랫폼 팀 수정" });
  await expect(platform).toContainText("구성원 수 확인 불가");
  await platform.click();
  const deletion = drawer.getByRole("region", { name: "팀 삭제" });
  await expect(deletion).toContainText("현재 구성원 수를 확인할 수 없습니다");
  await expect(deletion).not.toContainText("현재 구성원 0명");
});

test("팀 인원 최초 조회 중과 실패에는 0명을 표시하지 않고 재시도로 실제 인원을 복구한다", async ({
  page,
}) => {
  await prepare(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let fail = true;
  await page.route("**/api/v1/organizations/*/teams?*", async (route) => {
    if (!fail) return route.fallback();
    await held;
    return route.fulfill({
      status: 503,
      json: { error: { code: "unavailable", message: "isolated failure" } },
    });
  });
  await page.getByRole("button", { name: "팀 관리", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "팀 관리", exact: true });
  try {
    await expect(
      drawer
        .getByRole("status")
        .filter({ hasText: "팀 목록을 불러오는 중입니다" }),
    ).toBeVisible();
    await expect(drawer).not.toContainText("구성원 0명");
    release();
    await expect(drawer.getByRole("alert")).toContainText(
      "서버에 연결하지 못했습니다",
    );
    await expect(drawer).not.toContainText("구성원 0명");
    fail = false;
    await drawer
      .getByRole("button", { name: "다시 조회", exact: true })
      .click();
    await expect(
      drawer.getByRole("button", { name: "플랫폼 팀 수정" }),
    ).toContainText("구성원 53명");
  } finally {
    release();
  }
});
