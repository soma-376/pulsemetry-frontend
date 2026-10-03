import { dashboardBase, enrollmentBase, expect, test, seedOrganizations } from "./fixtures";
import { authenticatedRequest, signIn } from "./helpers";

// 좌석 보정(메모·등급·구성원 연결)과 수동 기록의 권위(enrollment 명세 §12 "좌석 수동 기록", ADR 0048).
// 기대값은 명세에서 쓴다: 보정은 상태·원천을 바꾸지 않고 판을 하나 올리며, 판이 다르면 409 version_conflict,
// 활성 연결이 있는 제품의 배정은 409 connector_managed 다(보정은 된다).
const A = seedOrganizations[0];
const C = seedOrganizations[2];
type Seat = { seatAssignmentId: string; account: string; state: string; source: string; note: string | null; tierId: string | null; version: number };

test("SEATS-CORRECT @p0 @write 관리자 기록 좌석의 메모를 화면에서 고치면 새로고침 뒤에도 남고 상태·원천은 그대로이며, 오래된 판은 409 로 알린다", async ({ page }) => {
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  const vendors = (await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/settings`)).body.vendors.items as { vendorId: string; kind: string }[];
  const claude = vendors.find((vendor) => vendor.kind === "claude_team")!;
  const seatsPath = `/api/v1/organizations/${A.id}/vendors/${claude.vendorId}/seats`;
  const list = async () => (await authenticatedRequest(page, dashboardBase(), `${seatsPath}?limit=100`)).body.seats.items as Seat[];
  const find = async (id: string) => (await list()).find((seat) => seat.seatAssignmentId === id)!;
  // 회수 시험(SEATS-ADMIN)이 쓰는 member4 는 피한다.
  const target = (await list()).find((seat) => seat.state === "assigned" && seat.account !== "member4@seed-a.example.test")!;
  const memo = `E2E 메모 ${crypto.randomUUID().slice(0, 8)}`;
  const open = async () => {
    await page.getByRole("button", { name: "Claude (Anthropic) 계약 설정 열기" }).click();
    return page.getByRole("dialog", { name: "Claude (Anthropic) 계약 설정" }).getByRole("region", { name: "좌석", exact: true });
  };
  try {
    await page.goto("/settings");
    let seats = await open();
    await seats.getByRole("button", { name: `${target.account} 좌석 정보 수정` }).click();
    let editor = seats.getByRole("form", { name: `${target.account} 좌석 정보 수정` });
    await editor.getByLabel("좌석 메모").fill(memo);
    const patched = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(`/seats/${target.seatAssignmentId}`));
    await editor.getByRole("button", { name: "저장", exact: true }).click();
    expect((await patched).status()).toBe(200);
    await expect(seats.getByRole("status")).toContainText("좌석 상태와 원천은 그대로입니다");
    const saved = await find(target.seatAssignmentId);
    expect(saved).toMatchObject({ note: memo, state: target.state, source: target.source, tierId: target.tierId, version: target.version + 1 });

    await page.reload();
    seats = await open();
    await expect(seats).toContainText(`메모: ${memo}`);

    // 열어 둔 편집기의 판이 낡으면 서버가 409 이고 화면은 입력을 둔 채 알린다.
    await seats.getByRole("button", { name: `${target.account} 좌석 정보 수정` }).click();
    editor = seats.getByRole("form", { name: `${target.account} 좌석 정보 수정` });
    const other = await authenticatedRequest(page, enrollmentBase(), `${seatsPath}/${target.seatAssignmentId}`, "PATCH", { expectedVersion: saved.version, note: `${memo} (다른 관리자)` });
    expect(other.status).toBe(200);
    await editor.getByLabel("좌석 메모").fill("늦은 메모");
    const stale = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(`/seats/${target.seatAssignmentId}`));
    await editor.getByRole("button", { name: "저장", exact: true }).click();
    expect((await stale).status()).toBe(409);
    await expect(editor.getByRole("alert")).toContainText("다른 곳에서 이 좌석을 먼저 바꿨습니다");
    await expect(editor.getByLabel("좌석 메모")).toHaveValue("늦은 메모");
    await editor.getByRole("button", { name: "최신 값으로 다시 편집" }).click();
    await expect(editor.getByLabel("좌석 메모")).toHaveValue(`${memo} (다른 관리자)`);
    await editor.getByRole("button", { name: "취소", exact: true }).click();
    // 같은 오래된 판을 API 로 보내도 409 다.
    const conflict = await authenticatedRequest(page, enrollmentBase(), `${seatsPath}/${target.seatAssignmentId}`, "PATCH", { expectedVersion: target.version, note: "늦은 메모" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("version_conflict");
  } finally {
    // 시드의 메모로 되돌린다(판은 오른 채 남는다).
    const latest = await find(target.seatAssignmentId);
    if (latest.note !== target.note) {
      const restored = await authenticatedRequest(page, enrollmentBase(), `${seatsPath}/${target.seatAssignmentId}`, "PATCH", { expectedVersion: latest.version, note: target.note });
      expect(restored.status).toBe(200);
    }
  }
});

test("SEATS-CONNECTED-MANUAL @p1 @read 벤더 연결이 있는 제품은 수동 배정을 받지 않고, 화면도 배정·해제·가져오기를 보이지 않는다", async ({ page }) => {
  await signIn(page, `owner@seed-${C.seed}.example.test`);
  const vendors = (await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${C.id}/settings`)).body.vendors.items as { vendorId: string; kind: string; seatSource: { connection: unknown } }[];
  // 시드 C 의 Cursor 등록 제품(플랜 cursor_enterprise)과 그 활성 연결(시드 README).
  const cursor = vendors.find((vendor) => vendor.kind === "cursor")!;
  expect(cursor.seatSource.connection).not.toBeNull();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Cursor 계약 설정 열기" }).click();
  const seats = page.getByRole("dialog", { name: "Cursor 계약 설정" }).getByRole("region", { name: "좌석", exact: true });
  await expect(seats).toContainText("벤더 연결이 있는 제품은 동기화가 좌석을 정합니다");
  await expect(seats.getByRole("form", { name: "좌석 배정 기록" })).toHaveCount(0);
  await expect(seats.getByLabel("좌석 CSV")).toHaveCount(0);
  const refused = await authenticatedRequest(page, enrollmentBase(), `/api/v1/organizations/${C.id}/vendors/${cursor.vendorId}/seats`, "POST",
    { account: "e2e-blocked@seed-c.example.test" }, { "Idempotency-Key": crypto.randomUUID() });
  expect(refused.status).toBe(409);
  expect(refused.body.error.code).toBe("connector_managed");
});
