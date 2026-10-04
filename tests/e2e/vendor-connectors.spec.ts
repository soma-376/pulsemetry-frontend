import type { Page } from "@playwright/test";
import { expect, test, dashboardBase, enrollmentBase } from "./fixtures";
import { authenticatedRequest, apiSession, seedPeriod, signIn } from "./helpers";
import { PreparationError } from "./harness";
import { currentDateIso } from "../../src/lib/date";

// 커넥터별 실서버 묶음 — 연결 → 동기화 → 원장 → 회수(벤더 요청 1회) → 복원(관리자 조치 확인) → 청구 조회, 오류 주입 하나씩.
// 벤더는 모의 서버(백엔드 tools/mock-vendor — 근거 문서의 공식 예시를 흉내)다. 실제 벤더를 부르지 않는다.
// fresh 조직 E(백엔드 tools/dev-seed 시나리오 E)에 계약을 등록하고 연결한다 — 시드 A·B·C 의 연결·원장·청구를 바꾸지 않는다.
// 기대값은 모의 서버 README 의 데이터(근거 문서의 예시)와 서버 명세(enrollment §12 벤더 연결·좌석 회수, dashboard 종량 지출)에서 쓴다.
const E = { seed: "e", id: "bd6fe5c2-6fdd-3433-b77e-5d5334b0bb8e" };
const O = `/api/v1/organizations/${E.id}`;
const MEMBER = "member1@seed-e.example.test";
const VENDORS = {
  claude: { kind: "claude_team", planId: "enterprise", displayName: "Claude Enterprise" },
  cursor: { kind: "cursor", planId: "cursor_enterprise", displayName: "Cursor Enterprise" },
} as const;

function mockVendor() {
  const value = process.env.E2E_MOCK_VENDOR_URL;
  if (!value) throw new PreparationError("E2E_MOCK_VENDOR_URL에 모의 벤더 서버 주소를 설정하고, enrollment-api 의 벤더 연결 기준 주소(pulsemetry.vendor-connections.base-urls.*)를 그 서버로 두세요.");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new PreparationError("모의 벤더 서버는 로컬 주소여야 합니다.");
  return value.replace(/\/$/, "");
}
type VendorCall = { method: string; path: string; query: Record<string, string>; body: Record<string, unknown> | null; authorization: string | null; xApiKey: string | null; anthropicVersion: string | null };
const vendorCalls = async (): Promise<VendorCall[]> => (await (await fetch(`${mockVendor()}/__calls`)).json()).calls;
const vendorPost = (path: string, body: unknown = {}) => fetch(`${mockVendor()}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const key = () => crypto.randomUUID();

type Vendor = { vendorId: string; kind: string; displayName: string; version: number; seatSource: { connection: { version: number; sync: { status: string; lastError: string | null }; check: { status: string } } | null } | null;
  meteredMonthToDate: { availability: string; reason: string | null; data: { startDate: string; endDate: string; actualBilledUsd: string | null; billingKind: string; source: string; finalized: boolean; equivalentCostUsd: string | null } | null } };

/**
 * 조직 E 를 이 시험의 전제로 맞춘다(다시 돌려도 같다): 두 제품의 Enterprise 계약 등록, 온보딩 완료, member1 합류(재발급한 코드로 가입).
 * 앞 실행이 남긴 연결은 지운다. 모의 벤더는 처음 상태로 돌린다.
 */
async function prepare(page: Page) {
  await fetch(`${mockVendor()}/__reset`, { method: "POST" });
  await signIn(page, `owner@seed-${E.seed}.example.test`);
  const request = (origin: string, path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => authenticatedRequest(page, origin, path, method, body, headers);
  const listed = async () => ((await request(dashboardBase(), `${O}/settings`)).body.vendors.items as Vendor[]);
  for (const spec of Object.values(VENDORS)) {
    if ((await listed()).some((vendor) => vendor.kind === spec.kind)) continue;
    const created = await request(enrollmentBase(), `${O}/vendors`, "POST", { kind: spec.kind, displayName: spec.displayName,
      contract: { planId: spec.planId, effectiveFrom: currentDateIso(), effectiveTo: null, termNote: null, tiers: [{ label: "Enterprise", seats: 3, monthlyFeePerSeatUsd: "60" }] } }, { "Idempotency-Key": key() });
    if (created.status !== 201) throw new PreparationError(`조직 E 에 ${spec.displayName} 계약을 등록하지 못했습니다(HTTP ${created.status}) — 시나리오 E 를 적재하세요.`);
  }
  for (const vendor of await listed()) {
    const connection = vendor.seatSource?.connection;
    if (!connection) continue;
    const removed = await request(enrollmentBase(), `${O}/vendors/${vendor.vendorId}/connection`, "DELETE", undefined, { "If-Match": `"connection-${connection.version}"` });
    if (removed.status !== 204) throw new PreparationError(`앞 실행의 ${vendor.displayName} 연결을 지우지 못했습니다(HTTP ${removed.status}).`);
  }
  const onboarding = (await request(enrollmentBase(), `${O}/onboarding`)).body;
  if (!onboarding.completed) {
    if (!onboarding.canComplete) throw new PreparationError(`조직 E 의 온보딩을 끝낼 수 없습니다(다음 단계 ${onboarding.nextStep}).`);
    const completed = await request(enrollmentBase(), `${O}/onboarding/complete`, "POST", {}, { "Idempotency-Key": key() });
    if (completed.status !== 200) throw new PreparationError(`조직 E 의 온보딩 완료 → HTTP ${completed.status}`);
  }
  // member1 은 시드에서 초대 대기다. 남은 초대를 재발급한 코드로 가입시켜 합류시킨다(이미 합류했으면 그대로).
  const waiting = [] as { invitationId: string; email: string }[];
  for (const status of ["pending", "expired"]) waiting.push(...(await request(enrollmentBase(), `${O}/invitations?limit=100&status=${status}&memberStatus=invited`)).body.items);
  const invitation = waiting.find((item) => item.email === MEMBER);
  if (invitation) {
    const reissued = await request(enrollmentBase(), `${O}/invitations/${invitation.invitationId}/reissue`, "POST", {}, { "Idempotency-Key": key() });
    if (reissued.status !== 200) throw new PreparationError(`member1 초대 재발급 → HTTP ${reissued.status}`);
    // IdP 계정은 테스트 환경에 준비한다. 첫 SSO가 초대 회원을 활성화한다.
    await apiSession(E.id, MEMBER);
  }
  return { request, listed };
}

async function memberId(page: Page) {
  const { start, end } = seedPeriod();
  const members = await authenticatedRequest(page, dashboardBase(), `${O}/members?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul&limit=100`);
  const found = (members.body.members.items as { account: string; memberId: string; status: string }[]).find((member) => member.account === MEMBER && member.status === "active");
  if (!found) throw new PreparationError("조직 E 의 member1 이 합류하지 않았습니다.");
  return found.memberId;
}
const seatsOf = async (page: Page, id: string) =>
  (await authenticatedRequest(page, dashboardBase(), `${O}/members/${id}/seats`)).body.seats as { vendorName: string; account: string; state: string; source: string; reclaimMethod: string | null }[];
const ledger = async (page: Page, vendorId: string) =>
  (await authenticatedRequest(page, dashboardBase(), `${O}/vendors/${vendorId}/seats?limit=200`)).body.seats.items as { account: string; state: string; source: string; memberLink: string | null }[];

// 드로어의 연결 편집 UI는 제거됐다. 커넥터 전제는 API로 준비하고 구성원 회수·복원 UI는 계속 검증한다.
async function connect(page: Page, vendor: Vendor, credential: string) {
  const result = await authenticatedRequest(page, enrollmentBase(), O + "/vendors/" + vendor.vendorId + "/connection", "PUT",
    { expectedVersion: vendor.seatSource?.connection?.version ?? 0, settings: {}, credential });
  expect(result.status).toBe(200);
  expect(JSON.stringify(result.body)).not.toContain(credential);
}
async function verify(page: Page, vendor: Vendor, status: string) {
  const result = await authenticatedRequest(page, enrollmentBase(), O + "/vendors/" + vendor.vendorId + "/connection/verify", "POST");
  expect(result.status).toBe(200);
  expect(result.body.seatSource.connection.check.status).toBe(status);
}
async function sync(page: Page, vendor: Vendor) {
  const result = await authenticatedRequest(page, enrollmentBase(), O + "/vendors/" + vendor.vendorId + "/connection/sync", "POST", {}, { "Idempotency-Key": key() });
  expect(result.status).toBe(202);
  await expect.poll(async () => (await authenticatedRequest(page, dashboardBase(), O + "/operations/" + result.body.operationId)).body.status,
    { timeout: 30_000 }).toBe("succeeded");
}

/** 회수(벤더 제어) → 새로고침 → 복원(관리자 조치 확인). 벤더를 바꾸는 호출은 회수의 [controlPath] 하나뿐이어야 한다. */
async function reclaimAndRestore(page: Page, vendorName: string, controlPath: (call: VendorCall) => boolean) {
  const id = await memberId(page);
  const seat = async () => (await seatsOf(page, id)).find((item) => item.vendorName === vendorName && item.account === MEMBER);
  await expect.poll(seat).toMatchObject({ state: "assigned", source: "connector", reclaimMethod: "vendor_control" });
  const open = async () => {
    await page.goto("/members");
    const list = page.getByRole("region", { name: "구성원 목록", exact: true });
    await list.getByRole("textbox", { name: "구성원 검색" }).fill(MEMBER);
    await list.getByRole("button", { name: `${MEMBER} 구성원 상세`, exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
    await drawer.getByRole("button", { name: "벤더 좌석", exact: true }).click();
    await expect(drawer.getByRole("list", { name: "벤더별 좌석 상세" })).toBeVisible();
    return drawer;
  };
  let drawer = await open();
  await drawer.locator("li[data-seat-id]").filter({ hasText: vendorName }).getByRole("button", { name: /좌석 회수$/ }).click();
  const modal = page.getByRole("dialog", { name: "좌석 회수 확인", exact: true });
  await expect(modal).toContainText("벤더 API로 해지");
  await modal.getByRole("button", { name: "회수 실행" }).click();
  // 주기 실행이 벤더를 부른 뒤에야 끝난다. 두 커넥터의 제거는 그 자리에서 끝난다 — 해제.
  await expect(modal.getByRole("region", { name: "좌석 회수 작업" }).getByRole("status")).toContainText("회수 · 완료", { timeout: 30_000 });
  await expect.poll(seat).toMatchObject({ state: "released", source: "vendor_control" });
  const controls = async () => (await vendorCalls()).filter(controlPath);
  expect(await controls()).toHaveLength(1);
  const mutating = async () => (await vendorCalls()).filter((call) => call.method !== "GET" && call.path !== "/teams/spend");
  const before = (await mutating()).length;

  // 복원 — 구현한 커넥터가 없다(백엔드 ADR 0049 §2·0054). 관리자가 벤더 콘솔에서 하고 확인해야 끝난다. 벤더는 부르지 않는다.
  await page.reload();
  drawer = await open();
  const reclaim = drawer.locator("li[data-seat-id]").filter({ hasText: vendorName }).getByRole("region", { name: "좌석 회수 작업" });
  await expect(reclaim.getByRole("status")).toContainText("회수 · 완료");
  await reclaim.getByRole("button", { name: "복원" }).click();
  const restore = drawer.locator("li[data-seat-id]").filter({ hasText: vendorName }).getByRole("region", { name: "좌석 복원 작업" });
  await expect(restore.getByRole("status")).toContainText("관리자 조치 대기");
  await restore.getByRole("button", { name: "배정 완료 확인" }).click();
  await expect(restore.getByRole("status")).toContainText("복원 · 완료");
  await expect.poll(seat).toMatchObject({ state: "assigned", source: "admin_action" });
  expect(await mutating()).toHaveLength(before);
  await drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
}

test("CONNECTOR-CLAUDE-E @p0 @write Claude Enterprise — 잘못된 자격증명은 거절로 보이고, 교체 뒤 동기화·원장·회수(제거 1회)·복원(관리자 조치)·이번 달 사용 비용이 이어진다", async ({ page }) => {
  test.setTimeout(240_000);
  const { listed } = await prepare(page);
  const vendor = async () => (await listed()).find((item) => item.kind === VENDORS.claude.kind)!;
  expect((await vendor()).seatSource?.connection).toBeNull();

  // 오류 주입 — 모의 서버가 받지 않는 자격증명(401). 연결 확인과 저장 직후의 주기 동기화가 둘 다 거절로 끝난다.
  const wrong = `not-a-vendor-key-${Date.now()}`;
  await connect(page, await vendor(), wrong);
  await verify(page, await vendor(), "invalid_credentials");
  await expect.poll(async () => (await vendor()).seatSource?.connection?.sync, { timeout: 30_000 }).toMatchObject({ status: "failing", lastError: "invalid_credentials" });
  expect((await vendorCalls()).filter((call) => call.xApiKey === wrong).length).toBeGreaterThan(0);
  expect(await page.content()).not.toContain(wrong);

  const credential = `fake-vendor-credential-e2e-claude-${Date.now()}`;
  await connect(page, await vendor(), credential);
  await verify(page, await vendor(), "verified");
  await sync(page, await vendor());
  // 문서의 인증: x-api-key 와 anthropic-version. 구성원·초대 목록은 ID 페이지, 비용 보고서는 두 쪽을 끝까지 읽는다.
  const calls = (await vendorCalls()).filter((call) => call.xApiKey === credential);
  expect(calls.every((call) => call.anthropicVersion === "2023-06-01")).toBe(true);
  expect(calls.filter((call) => call.path === "/v1/organizations/users" && call.method === "GET").length).toBeGreaterThan(0);
  expect(calls.filter((call) => call.path === "/v1/organizations/invites").length).toBeGreaterThan(0);
  const costs = calls.filter((call) => call.path === "/v1/organizations/analytics/cost_report");
  expect(costs.map((call) => call.query.page ?? null)).toEqual(expect.arrayContaining([null, "cost_page_2"]));

  // 원장 — 구성원 셋(이메일로 잇는다, 구성원이 아닌 외부 계정은 잇지 않음)과 좌석을 잡는 대기 초대 하나. 수락한 초대는 좌석이 아니다.
  const seats = await ledger(page, (await vendor()).vendorId);
  expect(seats.map((seat) => [seat.account, seat.state]).sort()).toEqual([
    ["contractor@partner.example.test", "assigned"], [MEMBER, "assigned"], ["newhire@partner.example.test", "pending_assignment"], ["owner@seed-e.example.test", "assigned"],
  ]);
  expect(seats.every((seat) => seat.source === "connector")).toBe(true);

  // 청구 — 비용 보고서의 금액(fractional cents) 합 43000 = $430.00, 이번 달(서울) 사용 비용. 환산 비용은 null.
  const metered = (await vendor()).meteredMonthToDate;
  expect(metered.data).toMatchObject({ billingKind: "usage_cost", source: "connector", finalized: false, equivalentCostUsd: null, startDate: `${currentDateIso().slice(0, 7)}-01` });
  expect(Number(metered.data!.actualBilledUsd)).toBe(430);
  await reclaimAndRestore(page, VENDORS.claude.displayName, (call) => call.method === "DELETE");
  expect((await vendorCalls()).filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/v1/organizations/users/user_seed_e_member1"]);
});

test("CONNECTOR-CURSOR-E @p0 @write Cursor Enterprise — 한도 초과(429)는 동기화 실패로 보이고, 다시 동기화한 뒤 원장·회수(제거 1회)·복원(관리자 조치)·이번 청구 주기 지출이 이어진다", async ({ page }) => {
  test.setTimeout(240_000);
  const { listed } = await prepare(page);
  const vendor = async () => (await listed()).find((item) => item.kind === VENDORS.cursor.kind)!;
  // 오류 주입 — 저장 직후의 주기 동기화가 구성원 목록에서 429 를 받는다(이 스택은 시도 1회라 다시 시도하지 않는다).
  expect((await vendorPost("/__fault", { path: "/teams/members", status: 429, times: 1, retryAfter: 60 })).status).toBe(200);
  const credential = `fake-vendor-credential-e2e-cursor-${Date.now()}`;
  await connect(page, await vendor(), credential);
  await expect.poll(async () => (await vendor()).seatSource?.connection?.sync, { timeout: 30_000 }).toMatchObject({ status: "failing", lastError: "rate_limited" });
  // 실패는 원장을 바꾸지 않는다 — 아직 좌석이 없다.
  expect(await ledger(page, (await vendor()).vendorId)).toHaveLength(0);
  await sync(page, await vendor());
  // 문서의 인증: Basic, API 키가 사용자 이름이고 비밀번호는 비운다. 지출은 페이지로 읽는다.
  const basic = `Basic ${Buffer.from(`${credential}:`).toString("base64")}`;
  const calls = (await vendorCalls()).filter((call) => call.path.startsWith("/teams/"));
  expect(calls.every((call) => call.authorization === basic)).toBe(true);
  expect(calls.filter((call) => call.path === "/teams/spend").map((call) => call.body)).toContainEqual({ page: 1, pageSize: 100 });

  const seats = await ledger(page, (await vendor()).vendorId);
  expect(seats.map((seat) => [seat.account, seat.state]).sort()).toEqual([
    ["contractor@partner.example.test", "assigned"], [MEMBER, "assigned"], ["owner@seed-e.example.test", "assigned"],
  ]);

  // 청구 — spendCents 합 3500 = $35.00(구독에 든 사용분은 더하지 않음), 이번 청구 주기(이번 달 1일 0시 UTC 시작)의 사용 지출.
  const metered = (await vendor()).meteredMonthToDate;
  expect(metered.data).toMatchObject({ billingKind: "usage_spend", source: "connector", finalized: false, equivalentCostUsd: null, startDate: `${new Date().toISOString().slice(0, 7)}-01` });
  expect(Number(metered.data!.actualBilledUsd)).toBe(35);
  await reclaimAndRestore(page, VENDORS.cursor.displayName, (call) => call.method === "POST" && call.path === "/teams/remove-member");
  expect((await vendorCalls()).filter((call) => call.path === "/teams/remove-member").map((call) => call.body)).toEqual([{ userId: "user_seed_e_member1" }]);
});
