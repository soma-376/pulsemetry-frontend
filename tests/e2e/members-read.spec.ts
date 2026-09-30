import { expect, test, dashboardBase, seedOrganizations } from "./fixtures";
import { authenticatedRequest, seedPeriod, selectPeriod, signIn, signOut } from "./helpers";

// 백엔드 tools/dev-seed/README.md의 A 시나리오: 관리자 2명 + 일반 구성원 10명, 미배정 1명,
// 팀 플랫폼 4·제품 4·데이터 2·디자인 1, 최근 28일 활성 8명, 미사용 초대 2개(대기·만료 각 1개).
const A = { roster: 12, unassigned: "member9@seed-a.example.test", active: 8, product: 4, teams: ["플랫폼", "제품", "데이터", "디자인"],
  waiting: "member12@seed-a.example.test", expired: "member13@seed-a.example.test", seats: 10 };

test("MEMBERS-A @p0 @read 명단·요약·미배정·초대 대기를 서버 값으로 표시하고 검색·새로고침·내보내기가 전체 명단을 쓴다", async ({ page }) => {
  const org = seedOrganizations[0];
  const { start, end } = seedPeriod();
  const dashboardRequest = (url: string) => {
    const parsed = new URL(url);
    return parsed.pathname === `/api/v1/organizations/${org.id}/members/dashboard` && parsed.searchParams.get("startDate") === start && parsed.searchParams.get("endDate") === end;
  };
  await signIn(page, `owner@seed-${org.seed}.example.test`);
  await page.goto("/members");
  const list = page.getByRole("region", { name: "구성원 목록", exact: true });
  await expect(list).toBeVisible();
  const loaded = page.waitForResponse((response) => dashboardRequest(response.url()));
  await selectPeriod(page, start, end);
  const response = await loaded;
  expect(response.status()).toBe(200);
  expect(response.request().headers().authorization).toMatch(/^Bearer /);
  const body = await response.json();
  expect(body.meta).toMatchObject({ organizationId: org.id, startDate: start, endDate: end });
  // 시드 시나리오의 독립 기대값.
  expect(body.summary.rosterMembers).toBe(A.roster);
  expect(body.summary.unassignedMembers).toBe(1);
  expect(body.summary.activeUsers).toBe(A.active);

  const rows = list.getByRole("button", { name: /구성원 상세$/ });
  await expect(rows).toHaveCount(A.roster);
  await expect(page.getByRole("group", { name: "구성원", exact: true })).toContainText(`${A.roster}명`);
  await expect(page.getByRole("group", { name: "구성원", exact: true })).toContainText(`기간 활성 ${A.active}명`);
  await expect(page.getByRole("group", { name: "팀 미배정", exact: true })).toContainText("1명");
  // 좌석은 시드 A 의 좌석 원장이다 — 보유 10석(Claude 5·OpenAI 2·Copilot 3). Cursor 는 좌석을 기록하지 않아 요약은 늘 partial 이다.
  // 후보 수는 원장의 값(0 포함)이고, 낮춘 사유를 화면에서 지우지 않는다.
  expect(body.summary.seats).toMatchObject({ availability: "partial", data: { assigned: A.seats } });
  const seatCard = page.getByRole("group", { name: "좌석 회수 후보", exact: true });
  await expect(seatCard).toContainText(`${body.summary.seats.data.reclaimCandidates}석`);
  await expect(seatCard).toContainText(" 제품이 있습니다");
  const reclaim = page.getByRole("region", { name: "좌석 회수 후보", exact: true });
  await expect(reclaim).toContainText(`전체 ${body.reclaimCandidates.data.totalCount}석`);
  // 판정하지 못한 좌석이 있으면(partial) 빈 목록을 "후보 없음"으로 보이지 않는다.
  if (body.reclaimCandidates.availability === "partial") {
    await expect(reclaim).toContainText("판정한 좌석만 후보로 보여 줍니다");
    await expect(reclaim).not.toContainText("회수 후보가 없습니다");
  }

  const unassigned = page.getByRole("region", { name: "팀 미배정 사용자", exact: true });
  await expect(unassigned).toContainText(A.unassigned);
  await expect(unassigned.getByRole("combobox")).toHaveCount(1);
  // 팀 선택지는 서버의 팀 목록이다. 순서는 계약이 아니다.
  expect((await unassigned.getByRole("combobox").getByRole("option").allTextContents()).sort()).toEqual(["팀 선택", ...A.teams].sort());

  // 아직 합류하지 않은 사람만 초대 대기에 보인다. 가입·설치 중 하나만 남은 활성 구성원의 초대는 아니다.
  const pending = page.getByRole("region", { name: "초대 대기", exact: true });
  await expect(pending).toContainText(A.waiting);
  await expect(pending).toContainText(A.expired);
  await expect(pending).toContainText("만료됨");
  await expect(pending).not.toContainText("member2@seed-a.example.test");
  await expect(page.getByRole("group", { name: "초대 대기", exact: true })).toContainText("1명");
  await expect(page.getByRole("group", { name: "초대 대기", exact: true })).toContainText("만료 1명");

  // 검색은 전체 명단에서 계정과 팀 이름으로 찾는다.
  const search = list.getByRole("textbox", { name: "구성원 검색" });
  await search.fill("member9");
  await search.press("Enter");
  await expect(rows).toHaveCount(1);
  await expect(rows).toHaveAttribute("aria-label", `${A.unassigned} 구성원 상세`);
  await search.fill("제품");
  await search.press("Enter");
  await expect(rows).toHaveCount(A.product);
  await search.fill("");
  await expect(rows).toHaveCount(A.roster);

  // 서버의 cursor 페이지가 같은 snapshot으로 같은 명단을 준다(화면은 100명 단위로 읽으므로 작은 페이지로 직접 확인한다).
  const accounts = new Set<string>();
  let cursor: string | null = null, pages = 0;
  do {
    const query = new URLSearchParams({ startDate: start, endDate: end, timeZone: "Asia/Seoul", limit: "5", snapshotId: body.meta.snapshotId });
    if (cursor) query.set("cursor", cursor);
    const next = await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${org.id}/members?${query}`);
    expect(next.status).toBe(200);
    expect(next.body.meta.snapshotId).toBe(body.meta.snapshotId);
    for (const item of next.body.members.items) accounts.add(item.account);
    cursor = next.body.members.nextCursor;
    pages++;
  } while (cursor);
  expect(pages).toBe(3);
  expect(accounts.size).toBe(A.roster);
  for (const account of accounts) await expect(list.getByRole("button", { name: `${account} 구성원 상세`, exact: true })).toBeVisible();

  // 상세는 서버가 준 값을 보여 준다.
  await list.getByRole("button", { name: `${A.unassigned} 구성원 상세`, exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "구성원 상세" });
  await expect(drawer).toContainText("미배정");
  await expect(drawer).toContainText("확인 불가");
  await drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
  await expect(drawer).not.toBeVisible();

  // 전체 명단 CSV — 헤더 한 줄과 구성원 12줄.
  const download = page.waitForEvent("download");
  await list.getByRole("button", { name: "전체 명단 CSV", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`members_${start}_${end}.csv`);
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const lines = Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "").trimEnd().split("\r\n");
  expect(lines).toHaveLength(A.roster + 1);
  expect(lines[0].startsWith("계정,이름,팀,역할")).toBe(true);
  expect(lines.some((line) => line.startsWith(`${A.unassigned},`) && line.includes(",미배정,"))).toBe(true);

  // 새로고침해도 세션과 명단이 유지된다. 기간은 기본값으로 돌아가므로 명단 수만 확인한다.
  const reloaded = page.waitForResponse((item) => new URL(item.url()).pathname === `/api/v1/organizations/${org.id}/members/dashboard` && item.status() === 200);
  await page.reload();
  await reloaded;
  await expect(rows).toHaveCount(A.roster);
  await expect(page.getByRole("region", { name: "팀 미배정 사용자", exact: true })).toContainText(A.unassigned);
  await signOut(page);
});

test("MEMBERS-B @p0 @read 구성원이 오너뿐인 조직도 빈 값으로 지어내지 않고 표시한다", async ({ page }) => {
  const org = seedOrganizations[1];
  await signIn(page, `owner@seed-${org.seed}.example.test`);
  const loaded = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/organizations/${org.id}/members/dashboard`);
  await page.goto("/members");
  expect((await loaded).status()).toBe(200);
  const list = page.getByRole("region", { name: "구성원 목록", exact: true });
  await expect(list.getByRole("button", { name: /구성원 상세$/ })).toHaveCount(1);
  await expect(list.getByRole("button", { name: "owner@seed-b.example.test 구성원 상세", exact: true })).toContainText("신호 대기");
  await expect(page.getByRole("group", { name: "구성원", exact: true })).toContainText("1명");
  await expect(page.getByRole("region", { name: "초대 대기", exact: true })).toContainText("초대 대기 중인 구성원이 없습니다");
  await expect(page.getByRole("region", { name: "팀 미배정 사용자", exact: true })).toContainText("owner@seed-b.example.test");
  await signOut(page);
});
