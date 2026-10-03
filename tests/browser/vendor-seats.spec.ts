import { expect, test, type Page, type Route } from "@playwright/test";
import example from "../../docs/api/settings-response.example.json";
import { openDashboard } from "./helpers";

/**
 * 설정 드로어의 좌석 원천·벤더 연결·좌석 기록·종량 지출(UI 테스트). 서버 규칙(enrollment §12, 서버 ADR 0048·0050)을 흉내 낸 응답을 쓴다.
 * 실제 서버 검증은 tests/e2e/seats.spec.ts 가 한다. 자격증명은 보내기만 하고 다시 보이지 않는다. CSV 는 오류가 있으면 적용할 수 없다.
 */
/** 설정 드로어의 좌석 API 흉내 — enrollment 명세 §12 "좌석 수동 기록"의 규칙(보정은 판이 다르면 409, 상태·원천을 바꾸지 않는다). */
async function serveSeats(page: Page) {
  const cors = { "access-control-allow-origin": new URL(test.info().project.use.baseURL!).origin, "access-control-allow-headers": "content-type,authorization,idempotency-key,if-match",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
  const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status, headers: cors, json: value });
  const posted: { path: string; body: unknown }[] = [];
  type Seat = Record<string, unknown> & { seatAssignmentId: string; account: string };
  const seats: Seat[] = [{ seatAssignmentId: "seat-1", version: 1, account: "dana@example.test", accountKind: "email", state: "assigned", source: "manual", memberId: "member-1",
    memberAccount: "dana@example.test", memberLink: "email_match", tierId: "tier-standard", tierLabel: "표준", vendorTier: null, assignedAt: "2026-09-01T00:00:00Z",
    releaseEffectiveOn: null, releasedAt: null, note: null, canReclaim: true, reclaimReason: null, reclaimMethod: "admin_action", lastControl: null }];
  const state = { connection: null as null | Record<string, unknown> };
  const vendor = () => ({ ...structuredClone(example.vendors.items[0]), source: "manual",
    seatSource: { authority: state.connection ? "connector" : "manual", provisional: !state.connection,
      connector: { connectorId: "cursor_enterprise", accountKind: "email", capabilities: ["seat_list", "seat_release", "billing"], settingKeys: [], supported: ["seat_list", "seat_release", "billing"] },
      connection: state.connection },
    seats: { availability: "available", reason: null, data: { assigned: seats.length, contracted: 20, unallocated: 20 - seats.length } },
    meteredMonthToDate: { availability: "partial", reason: "billing_sync_outdated", data: { startDate: "2026-09-17", endDate: "2026-09-29", equivalentCostUsd: null, actualBilledUsd: "137.42",
      billingKind: "usage_spend", finalized: false, source: "seed", fetchedAt: "2026-09-28T15:00:00Z" } } });
  await page.route((url) => /\/api\/v1\/organizations\/[^/]+\/(settings|vendors)(\/|$)/.test(url.pathname), (route) => {
    const request = route.request(), method = request.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    const org = url.pathname.split("/organizations/")[1].split("/")[0];
    const path = url.pathname.split("/organizations/")[1].split("/").slice(1).join("/");
    if (method === "GET" && path === "settings") {
      const data = structuredClone(example);
      data.meta.organizationId = org;
      return json(route, { ...data, summary: { ...data.summary, assignedSeats: seats.length, meteredMonthToDate: { availability: "partial", reason: "billing_sync_outdated",
        data: { equivalentCostUsd: null, actualBilledUsd: "137.42" } } }, vendors: { items: [vendor()], totalCount: 1, nextCursor: null } });
    }
    if (method === "GET" && path === "vendors/vendor-a") return json(route, { meta: { organizationId: org, snapshotId: "s" }, vendor: vendor() });
    if (method === "GET" && path === "vendors/vendor-a/seats") return json(route, { meta: { organizationId: org, asOf: "2026-10-01T00:00:00Z", snapshotId: "s" }, vendorId: "vendor-a",
      ledgerAvailability: "available", ledgerReason: null, seats: { items: seats, totalCount: seats.length, nextCursor: null } });
    posted.push({ path: `${method} ${path}`, body: request.postDataJSON() });
    if (method === "POST" && path === "vendors/vendor-a/seats") {
      const body = request.postDataJSON();
      seats.push({ ...seats[0], seatAssignmentId: "seat-2", account: body.account, memberId: null, memberAccount: null, memberLink: null, tierId: body.tierId, tierLabel: body.tierId ? "표준" : null });
      return json(route, { seat: { seatAssignmentId: "seat-2", version: 1, account: body.account, state: "assigned" }, warnings: [], provisional: true }, 201);
    }
    if (method === "POST" && path === "vendors/vendor-a/seats/import") {
      const body = request.postDataJSON();
      const bad = body.csv.includes("name");
      const result = { mode: body.mode, applied: body.mode === "apply" && !bad, digest: "d", summary: bad ? { errors: 1 } : { create: 1 },
        rows: [{ line: 2, account: "eli@example.test", action: bad ? null : "create", seatAssignmentId: null, errors: bad ? [{ field: "status", code: "invalid_status" }] : [] }], warnings: [] };
      return json(route, { import: result, provisional: true });
    }
    if (method === "PATCH" && path.startsWith("vendors/vendor-a/seats/")) {
      const body = request.postDataJSON();
      const seat = seats.find((item) => item.seatAssignmentId === path.split("/")[3])!;
      if (body.expectedVersion !== seat.version) return json(route, { error: { code: "version_conflict", message: "conflict" } }, 409);
      if ("note" in body) seat.note = body.note;
      if ("tierId" in body) { seat.tierId = body.tierId; seat.tierLabel = body.tierId ? "표준" : null; }
      if (body.memberLink === "automatic") { seat.memberLink = "email_match"; }
      if ("memberId" in body && body.memberId === null) { seat.memberId = null; seat.memberAccount = null; seat.memberLink = "admin"; }
      seat.version = (seat.version as number) + 1;
      return json(route, { seat: { seatAssignmentId: seat.seatAssignmentId, version: seat.version, account: seat.account, state: seat.state }, warnings: [], provisional: !state.connection });
    }
    if (method === "PUT" && path === "vendors/vendor-a/connection") {
      state.connection = { connectionId: "c-1", version: 1, connectorId: "cursor_enterprise", settings: {}, credential: { configured: true, updatedAt: "2026-10-01T00:00:00Z" },
        check: { status: "unverified", checkedAt: null }, sync: { status: "pending", lastSucceededAt: null, lastFailedAt: null, lastError: null }, createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z", billing: { status: "pending", lastSucceededAt: null, lastFailedAt: null, lastError: null } };
      return json(route, { seatSource: vendor().seatSource });
    }
    return json(route, { error: { code: "not_found", message: "fixture" } }, 404);
  });
  return { seats, posted, state };
}

test("settings drawer records seats, imports CSV only without row errors, and never shows a saved credential again", async ({ page }) => {
  const { posted } = await serveSeats(page);
  await openDashboard(page, "/settings");
  // 종량 지출은 벤더 청구 누계이고, 합계의 사유(낡음)를 보여 준다.
  await expect(page.getByRole("group", { name: "종량 지출", exact: true })).toContainText("$137.42");
  await page.getByRole("button", { name: "Vendor A 계약 설정 열기" }).click();
  const drawer = page.getByRole("dialog", { name: "Vendor A 계약 설정" });
  const metered = drawer.getByRole("region", { name: "종량 지출" });
  await expect(metered).toContainText("이번 청구 주기의 사용 지출");
  await expect(metered).toContainText("개발 시드(실제 청구 아님)");

  const seatList = drawer.getByRole("region", { name: "좌석", exact: true });
  await expect(seatList).toContainText("dana@example.test");
  await seatList.getByLabel("벤더 계정(이메일)").fill("new@example.test");
  await seatList.getByRole("button", { name: "배정 기록" }).click();
  await expect(seatList).toContainText("new@example.test");
  expect(posted.find((item) => item.path === "POST vendors/vendor-a/seats")?.body).toEqual({ account: "new@example.test", tierId: null, note: null });

  // CSV — 오류가 있는 미리보기는 적용할 수 없다.
  await seatList.getByLabel("좌석 CSV").fill("account,status,name\neli@example.test,used,Eli");
  await seatList.getByRole("button", { name: "미리보기" }).click();
  await expect(seatList.getByRole("region", { name: "가져오기 결과" })).toContainText("상태는 assigned·released");
  await expect(seatList.getByRole("button", { name: "적용" })).toBeDisabled();
  await seatList.getByLabel("좌석 CSV").fill("account,status\neli@example.test,assigned");
  await seatList.getByRole("button", { name: "미리보기" }).click();
  await expect(seatList.getByRole("region", { name: "가져오기 결과" })).toContainText("새 배정");
  await seatList.getByRole("button", { name: "적용" }).click();
  await expect(seatList.getByRole("region", { name: "가져오기 결과" })).toContainText("적용했습니다");

  // 연결 — 자격증명은 저장 뒤 다시 보이지 않는다.
  const source = drawer.getByRole("region", { name: "좌석 원천" });
  await source.getByRole("button", { name: "연결 추가" }).click();
  const secret = "fake-vendor-credential-" + "x".repeat(16);
  await source.getByLabel("관리자 자격증명(저장 후 다시 보이지 않습니다)").fill(secret);
  await source.getByRole("button", { name: "연결 저장" }).click();
  await expect(source).toContainText("설정됨");
  await expect(source).toContainText("벤더 동기화");
  expect(posted.find((item) => item.path === "PUT vendors/vendor-a/connection")?.body).toEqual({ expectedVersion: 0, settings: {}, credential: secret });
  await expect(page.locator(`input[value="${secret}"]`)).toHaveCount(0);
  expect(await page.content()).not.toContain(secret);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toContain("fake-vendor-credential");
});

test("관리자 기록 좌석의 메모·유형을 고치면 상태·원천은 그대로이고, 오래된 판은 409 로 알리고 최신 값으로 다시 편집한다", async ({ page }) => {
  const { seats, posted } = await serveSeats(page);
  await openDashboard(page, "/settings");
  await page.getByRole("button", { name: "Vendor A 계약 설정 열기" }).click();
  const seatList = page.getByRole("dialog", { name: "Vendor A 계약 설정" }).getByRole("region", { name: "좌석", exact: true });
  // 배정 기록에 메모를 함께 남긴다.
  await seatList.getByLabel("벤더 계정(이메일)").fill("memo@example.test");
  await seatList.getByLabel("배정 메모").fill("디자인팀 임시");
  await seatList.getByRole("button", { name: "배정 기록" }).click();
  expect(posted.find((item) => item.path === "POST vendors/vendor-a/seats")?.body).toEqual({ account: "memo@example.test", tierId: null, note: "디자인팀 임시" });

  await seatList.getByRole("button", { name: "dana@example.test 좌석 정보 수정" }).click();
  const editor = seatList.getByRole("form", { name: "dana@example.test 좌석 정보 수정" });
  await expect(editor.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
  await editor.getByLabel("좌석 메모").fill("계약 갱신 때 확인");
  await editor.getByLabel("좌석 유형").selectOption("");
  await editor.getByRole("button", { name: "저장", exact: true }).click();
  await expect(seatList.getByRole("status")).toContainText("좌석 상태와 원천은 그대로입니다");
  expect(posted.filter((item) => item.path.startsWith("PATCH")).at(-1)?.body).toEqual({ expectedVersion: 1, note: "계약 갱신 때 확인", tierId: null });
  await expect(seatList).toContainText("메모: 계약 갱신 때 확인");
  expect(seats[0]).toMatchObject({ state: "assigned", source: "manual", version: 2 });

  // 다른 곳에서 먼저 바꿨다 — 열어 둔 편집기의 판이 낡았다.
  await seatList.getByRole("button", { name: "dana@example.test 좌석 정보 수정" }).click();
  seats[0].version = 3;
  seats[0].note = "다른 관리자의 메모";
  await editor.getByLabel("좌석 메모").fill("내 메모");
  await editor.getByRole("button", { name: "저장", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("다른 곳에서 이 좌석을 먼저 바꿨습니다");
  await expect(editor.getByLabel("좌석 메모")).toHaveValue("내 메모");
  await editor.getByRole("button", { name: "최신 값으로 다시 편집" }).click();
  await expect(editor.getByLabel("좌석 메모")).toHaveValue("다른 관리자의 메모");
  await editor.getByLabel("좌석 메모").fill("내 메모");
  await editor.getByRole("button", { name: "저장", exact: true }).click();
  expect(posted.filter((item) => item.path.startsWith("PATCH")).at(-1)?.body).toEqual({ expectedVersion: 3, note: "내 메모" });
});

test("벤더 연결이 있는 제품은 배정·해제·가져오기를 하지 않지만 메모·유형 보정은 된다", async ({ page }) => {
  const { state, posted } = await serveSeats(page);
  state.connection = { connectionId: "c-1", version: 1, connectorId: "cursor_enterprise", settings: {}, credential: { configured: true, updatedAt: "2026-10-01T00:00:00Z" },
    check: { status: "verified", checkedAt: "2026-10-01T00:00:00Z" }, sync: { status: "succeeded", lastSucceededAt: "2026-10-01T00:00:00Z", lastFailedAt: null, lastError: null },
    createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", billing: null };
  await openDashboard(page, "/settings");
  await page.getByRole("button", { name: "Vendor A 계약 설정 열기" }).click();
  const seatList = page.getByRole("dialog", { name: "Vendor A 계약 설정" }).getByRole("region", { name: "좌석", exact: true });
  await expect(seatList).toContainText("벤더 연결이 있는 제품은 동기화가 좌석을 정합니다");
  await expect(seatList.getByRole("form", { name: "좌석 배정 기록" })).toHaveCount(0);
  await expect(seatList.getByRole("button", { name: "dana@example.test 해제 기록" })).toHaveCount(0);
  await expect(seatList.getByLabel("좌석 CSV")).toHaveCount(0);
  await seatList.getByRole("button", { name: "dana@example.test 좌석 정보 수정" }).click();
  const editor = seatList.getByRole("form", { name: "dana@example.test 좌석 정보 수정" });
  await editor.getByLabel("좌석 메모").fill("커넥터 좌석 메모");
  await editor.getByRole("button", { name: "저장", exact: true }).click();
  await expect(seatList.getByRole("status")).toContainText("좌석 정보를 고쳤습니다");
  expect(posted.map((item) => item.path)).toEqual(["PATCH vendors/vendor-a/seats/seat-1"]);
});
