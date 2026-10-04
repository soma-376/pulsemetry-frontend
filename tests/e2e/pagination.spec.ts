import type { Page } from "@playwright/test";
import { dashboardBase, expect, test, seedOrganizations } from "./fixtures";
import { authenticatedRequest, seedPeriod, selectPeriod, signIn } from "./helpers";

// 페이지 나눔과 검색 — 시드 A 는 목록이 한 쪽에 들어가므로, 앱이 보내는 조회의 limit 만 작게 바꿔(시험 이름에 적는다) 실제 서버가 cursor 쪽으로 나눠 주게 한다.
// 다른 질의(기간·snapshotId·cursor)는 그대로다. 화면은 같은 snapshot 의 쪽을 이어 전부를 보여야 하고(대시보드 명세 §1 목록 규칙), 검색은 이메일·이름·팀이다.
// 구성원 화면의 첫 쪽(members/dashboard)은 쪽 크기를 받지 않아 시드 A(12명)는 한 쪽이다 — 구성원 cursor 이어 읽기와 "다음 N명 더보기"(한 화면 20명)는
// 실서버 조직에 그만한 로스터가 없어 목 시험(members-*.spec, 45명)이 덮는다. 쓰기는 없다.
const [A] = seedOrganizations;
const O = `/api/v1/organizations/${A.id}`;

/** 앱의 대시보드 조회 가운데 [path] 에 맞는 것의 limit 을 [limit] 으로 바꾼다. 바꾼 요청의 질의를 돌려준다. */
async function shrinkLimit(page: Page, path: RegExp, limit: number) {
  const dashboard = new URL(dashboardBase()).origin;
  const sent: URLSearchParams[] = [];
  await page.route((url) => url.origin === dashboard && path.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.searchParams.has("limit")) {
      url.searchParams.set("limit", String(limit));
      sent.push(new URLSearchParams(url.search));
    }
    await route.continue({ url: url.toString() });
  });
  return sent;
}
type Member = { account: string; displayName: string; team: { teamName: string } };

test("PAGE-MEMBERS-A @p1 @read 구성원 명단은 서버 명단 전부이고, 한글 팀·특수문자·결과 없음 검색이 서버 명단과 같다", async ({ page }) => {
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  const { start, end } = seedPeriod();
  const all = (await authenticatedRequest(page, dashboardBase(), `${O}/members?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul&limit=100`)).body.members.items as Member[];
  await page.goto("/members");
  await selectPeriod(page, start, end);
  const list = page.getByRole("region", { name: "구성원 목록", exact: true });
  const rows = list.getByRole("button", { name: / 구성원 상세$/ });
  await expect(rows).toHaveCount(all.length);

  // 검색은 이메일·이름·팀(입력란 안내). 한글 팀 이름으로 거르면 서버 명단에서 같은 조건의 사람만.
  const search = list.getByRole("textbox", { name: "구성원 검색" });
  const matches = (keyword: string) => all.filter((member) => [member.account, member.displayName, member.team.teamName].some((value) => value.toLowerCase().includes(keyword.toLowerCase())));
  const team = all.find((member) => /[가-힣]/.test(member.team.teamName))!.team.teamName;
  await search.fill(team);
  await expect(rows).toHaveCount(matches(team).length);
  await expect(list).toContainText(`검색 결과 ${matches(team).length}명 · 전체 ${all.length}명 내 검색`);
  // 정규식·특수문자는 글자 그대로다 — 오류 없이 결과 없음이고, @ 는 모든 계정에 맞는다.
  for (const keyword of ["(", "[a-z]+", "없는-사람-zz"]) {
    await search.fill(keyword);
    await expect(list).toContainText("검색 결과가 없습니다");
    await expect(rows).toHaveCount(0);
  }
  await search.fill(`@seed-${A.seed}`);
  await expect(rows).toHaveCount(matches(`@seed-${A.seed}`).length);
  await search.fill("");
  await expect(rows).toHaveCount(all.length);
});

test("PAGE-TEAMS-A @p1 @read (팀 분석 조회 limit 2) 팀 분석은 같은 snapshot 의 쪽을 이어 서버의 팀 전부를 보인다", async ({ page }) => {
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  const { start, end } = seedPeriod();
  const teams = (await authenticatedRequest(page, dashboardBase(), `${O}/analytics/teams?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul&limit=50`)).body.teams;
  expect(teams.nextCursor).toBeNull();
  const sent = await shrinkLimit(page, /\/analytics\/teams(?:\?.*)?$/, 2);
  await page.goto("/teams");
  await selectPeriod(page, start, end);
  const axis = page.getByRole("region", { name: "팀별 사용량 비교", exact: true });
  for (const item of teams.items as { teamName: string }[]) await expect(axis).toContainText(item.teamName);
  const pages = sent.filter((query) => query.get("startDate") === start && query.get("endDate") === end);
  expect(pages.filter((query) => query.has("cursor")).length).toBeGreaterThanOrEqual(Math.ceil(teams.items.length / 2) - 1);
  expect(new Set(pages.filter((query) => query.has("cursor")).map((query) => query.get("snapshotId"))).size).toBe(1);
});

test("PAGE-SEATS-A @p1 @read (제품 좌석 조회 limit 2) 설정의 좌석 목록은 더 보기로 서버 cursor 를 이어 전부를 보이고 끝나면 더 보기가 없다", async ({ page }) => {
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  const vendors = (await authenticatedRequest(page, dashboardBase(), `${O}/settings`)).body.vendors.items as { vendorId: string; kind: string; displayName: string }[];
  const claude = vendors.find((vendor) => vendor.kind === "claude_team")!;
  const seats = (await authenticatedRequest(page, dashboardBase(), `${O}/vendors/${claude.vendorId}/seats?limit=200`)).body.seats.items as { account: string }[];
  expect(seats.length).toBeGreaterThan(2);
  await shrinkLimit(page, /\/vendors\/[^/]+\/seats$/, 2);
  await page.goto("/settings");
  await page.getByRole("button", { name: `${claude.displayName} 계약 설정 열기`, exact: true }).click();
  const drawer = page.getByRole("dialog", { name: `${claude.displayName} 계약 설정`, exact: true });
  const list = drawer.getByRole("list", { name: `${claude.displayName} 좌석 목록` });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  const more = drawer.getByRole("button", { name: "더 보기", exact: true });
  for (let shown = 2; shown < seats.length; shown = Math.min(shown + 2, seats.length)) {
    await more.click();
    await expect(list.getByRole("listitem")).toHaveCount(Math.min(shown + 2, seats.length));
  }
  await expect(more).toHaveCount(0);
  for (const seat of seats) await expect(list).toContainText(seat.account);
});
