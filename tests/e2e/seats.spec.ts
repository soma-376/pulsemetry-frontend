import { expect, test, dashboardBase, seedOrganizations } from "./fixtures";
import { authenticatedRequest, seedPeriod, signIn, signOut } from "./helpers";
import type { Page } from "@playwright/test";

// 백엔드 tools/dev-seed/README.md 의 A 좌석 원장: Claude(Team — 벤더 API 없음) member4 등 수동 기록, Copilot 연결 원천 seed-dev-7(member7 에 관리자가 이음).
// 커넥터 경로는 모의 벤더 서버(Copilot 좌석 API 흉내)를 가리키는 서버로만 돌린다 — 실제 벤더를 부르지 않는다.
const A = seedOrganizations[0];

function mockVendor() {
  const value = process.env.E2E_MOCK_VENDOR_URL;
  if (!value) throw new Error("E2E 선행 조건 실패: E2E_MOCK_VENDOR_URL에 모의 벤더 서버 주소를 설정하고, enrollment-api 의 벤더 연결 기준 주소(pulsemetry.vendor-connections.base-urls.*)를 그 서버로 두세요.");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("모의 벤더 서버는 로컬 주소여야 합니다.");
  return value.replace(/\/$/, "");
}
type VendorCall = { method: string; path: string; body: { selected_usernames?: string[] } | null; authorization: string | null };
const vendorCalls = async (): Promise<VendorCall[]> => (await (await fetch(`${mockVendor()}/__calls`)).json()).calls;

async function memberId(page: Page, email: string) {
  const { start, end } = seedPeriod();
  const members = await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/members?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul&limit=100`);
  expect(members.status).toBe(200);
  return members.body.members.items.find((member: { account: string }) => member.account === email).memberId as string;
}
const seatsOf = async (page: Page, id: string) =>
  (await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/members/${id}/seats`)).body.seats as { account: string; state: string; source: string; reclaimMethod: string | null }[];

async function openMember(page: Page, email: string) {
  await page.goto("/members");
  const list = page.getByRole("region", { name: "구성원 목록", exact: true });
  await list.getByRole("textbox", { name: "구성원 검색" }).fill(email);
  await list.getByRole("button", { name: `${email} 구성원 상세`, exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  await expect(drawer.getByRole("list", { name: "벤더별 좌석 상세" })).toBeVisible();
  return drawer;
}

test("SEATS-ADMIN @p0 @write 벤더 API 가 없는 좌석의 회수는 관리자 조치 확인으로만 끝나고 새로고침 뒤에도 이어지며 복원도 확인으로 끝난다", async ({ page }) => {
  const account = "member4@seed-a.example.test";
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  const id = await memberId(page, account);
  const before = (await seatsOf(page, id)).find(seat => seat.account === account)!;
  expect(before).toMatchObject({ state: "assigned", reclaimMethod: "admin_action" });

  let drawer = await openMember(page, account);
  // 좌석 항목만 — 작업 패널의 대상 목록도 listitem 이다.
  const seat = drawer.locator("li[data-seat-id]").filter({ hasText: "Claude" });
  await expect(seat).toContainText("벤더 콘솔에서 직접 해지 후 확인");
  await seat.getByRole("button", { name: /좌석 회수$/ }).click();
  const modal = page.getByRole("dialog", { name: "좌석 회수 확인", exact: true });
  await expect(modal).toContainText("벤더 콘솔에서 직접 해지 후 확인");
  await modal.getByRole("button", { name: "회수 실행" }).click();
  await expect(modal.getByRole("region", { name: "좌석 회수 작업" }).getByRole("status")).toContainText("관리자 조치 대기");
  // 조치 대기는 완료가 아니다 — 원장은 그대로다.
  expect((await seatsOf(page, id)).find(item => item.account === account)!.state).toBe("assigned");

  // 새로고침 뒤에도 좌석의 최근 작업을 다시 찾아 확인한다.
  await page.reload();
  drawer = await openMember(page, account);
  const reclaim = drawer.getByRole("region", { name: "좌석 회수 작업" });
  await expect(reclaim.getByRole("status")).toContainText("관리자 조치 대기");
  await reclaim.getByRole("button", { name: "해지 완료 확인" }).click();
  await expect(reclaim.getByRole("status")).toContainText("회수 · 완료");
  await expect.poll(async () => (await seatsOf(page, id)).find(item => item.account === account)).toMatchObject({ state: "released", source: "admin_action" });

  await reclaim.getByRole("button", { name: "복원" }).click();
  const restore = drawer.getByRole("region", { name: "좌석 복원 작업" });
  await expect(restore.getByRole("status")).toContainText("관리자 조치 대기");
  await restore.getByRole("button", { name: "배정 완료 확인" }).click();
  await expect(restore.getByRole("status")).toContainText("복원 · 완료");
  await expect.poll(async () => (await seatsOf(page, id)).find(item => item.account === account)).toMatchObject({ state: "assigned", source: "admin_action" });
  await drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
  await signOut(page);
});

test("SEATS-CONNECTOR @p0 @write 벤더 연결을 다시 만들고 동기화한 뒤 커넥터로 회수·복원하며 모의 벤더가 실제 요청을 받는다", async ({ page }) => {
  test.setTimeout(180_000);
  const vendor = mockVendor();
  await fetch(`${vendor}/__reset`, { method: "POST" });
  const credential = `fake-vendor-credential-e2e-${Date.now()}`;
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  await page.goto("/settings");
  await page.getByRole("button", { name: "GitHub Copilot 계약 설정 열기" }).click();
  const source = page.getByRole("dialog", { name: "GitHub Copilot 계약 설정" }).getByRole("region", { name: "좌석 원천" });
  // 시드의 연결은 이 서버의 키로 풀 수 없는 자리표시자다(다시 돌리면 앞 실행이 만든 연결) — 지우고 다시 만든다.
  await expect(source).toContainText("벤더 동기화");
  await source.getByRole("button", { name: "연결 삭제", exact: true }).click();
  await source.getByRole("button", { name: "연결 삭제 확인", exact: true }).click();
  await expect(source).toContainText("관리자 기록(연결 전 임시)");
  await source.getByRole("button", { name: "연결 추가" }).click();
  await source.getByLabel("organization").fill("seed-org");
  await source.getByLabel("관리자 자격증명(저장 후 다시 보이지 않습니다)").fill(credential);
  await source.getByRole("button", { name: "연결 저장" }).click();
  await expect(source).toContainText("설정됨");
  await expect(source).toContainText("벤더 동기화");
  expect(await page.content()).not.toContain(credential);
  await source.getByRole("button", { name: "지금 동기화" }).click();
  await expect(source.getByRole("status")).toContainText("완료", { timeout: 30_000 });
  const listed = (await vendorCalls()).filter(call => call.method === "GET" && call.path === "/orgs/seed-org/copilot/billing/seats");
  expect(listed.length).toBeGreaterThan(0);
  expect(listed.every(call => call.authorization === `Bearer ${credential}`)).toBe(true);

  const account = "member7@seed-a.example.test";
  const id = await memberId(page, account);
  await expect.poll(async () => (await seatsOf(page, id)).find(seat => seat.account === "seed-dev-7")).toMatchObject({ state: "assigned", source: "connector", reclaimMethod: "vendor_control" });
  let drawer = await openMember(page, account);
  await drawer.locator("li[data-seat-id]").filter({ hasText: "seed-dev-7" }).getByRole("button", { name: /좌석 회수$/ }).click();
  const modal = page.getByRole("dialog", { name: "좌석 회수 확인", exact: true });
  await expect(modal).toContainText("벤더 API로 해지");
  await modal.getByRole("button", { name: "회수 실행" }).click();
  // 주기 실행이 벤더를 부른 뒤에야 끝난다(Copilot 취소는 주기 말 효력 — 해제 예정).
  await expect(modal.getByRole("region", { name: "좌석 회수 작업" }).getByRole("status")).toContainText("회수 · 완료", { timeout: 30_000 });
  await expect.poll(async () => (await seatsOf(page, id)).find(seat => seat.account === "seed-dev-7")?.state).toBe("pending_release");
  expect((await vendorCalls()).filter(call => call.method === "DELETE").map(call => call.body?.selected_usernames)).toEqual([["seed-dev-7"]]);

  await page.reload();
  drawer = await openMember(page, account);
  const reclaim = drawer.getByRole("region", { name: "좌석 회수 작업" });
  await expect(reclaim.getByRole("status")).toContainText("회수 · 완료");
  await reclaim.getByRole("button", { name: "복원" }).click();
  await expect(drawer.getByRole("region", { name: "좌석 복원 작업" }).getByRole("status")).toContainText("복원 · 완료", { timeout: 30_000 });
  await expect.poll(async () => (await seatsOf(page, id)).find(seat => seat.account === "seed-dev-7")).toMatchObject({ state: "assigned", source: "vendor_control" });
  expect((await vendorCalls()).filter(call => call.method === "POST").map(call => call.body?.selected_usernames)).toEqual([["seed-dev-7"]]);
  await drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
  await signOut(page);
});

test("SEATS-CSV @p0 @write 관리자 기록 제품의 CSV 는 오류가 있으면 파일을 거절하고, 미리보기 뒤 적용한 행만 원장에 남는다", async ({ page }) => {
  const account = "e2e-csv@seed-a.example.test";
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  await page.goto("/settings");
  await page.getByRole("button", { name: "ChatGPT / Codex (OpenAI) 계약 설정 열기" }).click();
  const drawer = page.getByRole("dialog", { name: "ChatGPT / Codex (OpenAI) 계약 설정" });
  const seats = drawer.getByRole("region", { name: "좌석", exact: true });
  await expect(seats.getByRole("list", { name: "ChatGPT / Codex (OpenAI) 좌석 목록" })).toContainText("member3@seed-a.example.test");
  // 이메일 외의 개인 정보 열은 받지 않는다 — 파일 전체를 거절한다.
  await seats.getByLabel("좌석 CSV").fill(`account,name\n${account},E2E`);
  await seats.getByRole("button", { name: "미리보기" }).click();
  await expect(seats).toContainText("CSV 파일 형식을 확인하세요");

  await seats.getByLabel("좌석 CSV").fill(`account,status\n${account},assigned`);
  await seats.getByRole("button", { name: "미리보기" }).click();
  const result = seats.getByRole("region", { name: "가져오기 결과" });
  await expect(result).toContainText(/새 배정|다시 배정/);
  await seats.getByRole("button", { name: "적용" }).click();
  await expect(result).toContainText("적용했습니다");
  await expect(seats.getByRole("list", { name: "ChatGPT / Codex (OpenAI) 좌석 목록" })).toContainText(account);

  // 시드를 원래대로 — 같은 파일 경로로 해제를 기록한다(파일에 없는 좌석은 그대로).
  await seats.getByLabel("좌석 CSV").fill(`account,status\n${account},released`);
  await seats.getByRole("button", { name: "미리보기" }).click();
  await expect(result).toContainText("해제");
  await seats.getByRole("button", { name: "적용" }).click();
  await expect(result).toContainText("적용했습니다");
  const vendors = (await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/settings`)).body.vendors.items as { kind: string; seats: { data: { assigned: number } } }[];
  expect(vendors.find(vendor => vendor.kind === "openai_biz")!.seats.data.assigned).toBe(2);
  await drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
  await signOut(page);
});

test("SEATS-OVERVIEW @p0 @read 개요의 제품별 배정 좌석은 구성원 요약과 같은 좌석 원장이고, 좌석을 기록하지 않은 제품은 사유를 말한다", async ({ page }) => {
  // 시드 A 좌석 원장의 독립 기대값 — 보유 10석(Claude 5·OpenAI 2·Copilot 3), Cursor 는 좌석 기록 없음. 쓰기 테스트는 끝에 원래 수로 되돌린다.
  const expected: Record<string, string> = { "Claude (Anthropic)": "배정 5석", "ChatGPT / Codex (OpenAI)": "배정 2석", "GitHub Copilot": "배정 3석", Cursor: "배정 이 제품은 좌석을 기록하지 않았습니다" };
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  const { start, end } = seedPeriod();
  const summary = (await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/members/dashboard?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul`)).body.summary.seats;
  expect(summary.data.assigned).toBe(10);
  await page.goto("/overview");
  const table = page.getByRole("table", { name: "계약·좌석 현황" });
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    for (const [name, text] of Object.entries(expected)) {
      const row = table.getByRole("row").filter({ has: page.getByRole("button", { name: `${name} 벤더 상세`, exact: true }) });
      await expect(row.getByRole("cell").nth(1)).toContainText(text);
    }
  }
  // 판정하지 못한 좌석이 있으면 후보 수가 판정한 좌석만이라고 말한다(빈 후보를 "0석 확정"으로 보이지 않는다).
  const candidates = (await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/seat-reclaim-candidates?limit=50`)).body.candidates;
  const card = page.getByRole("region", { name: "계약·좌석 현황", exact: true });
  if (candidates.availability === "partial") await expect(card).toContainText("회수 후보는 판정한 좌석만");
  else await expect(card).not.toContainText("회수 후보는 판정한 좌석만");
  await signOut(page);
});
