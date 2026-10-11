import {
  expect,
  test,
  dashboardBase,
  enrollmentBase,
  seedOrganizations,
} from "./fixtures";
import { authenticatedRequest, seedPeriod, signIn } from "./helpers";
import type { Page } from "@playwright/test";

// 백엔드 tools/dev-seed/README.md 의 A 좌석 원장: Claude(Team — 벤더 API 없음) member4 등 관리자 기록. C 는 Cursor Enterprise 연결(자리표시자 자격증명 — 동기화 실패).
// 커넥터(모의 벤더 서버)의 연결·동기화·회수는 fresh 조직 E 에서 한다 — vendor-connectors.spec.ts. 시드 C 의 연결과 청구 누계는 바꾸지 않는다.
const A = seedOrganizations[0];

async function memberId(page: Page, email: string, org: string = A.id) {
  const { start, end } = seedPeriod();
  const members = await authenticatedRequest(
    page,
    dashboardBase(),
    `/api/v1/organizations/${org}/members?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul&limit=100`,
  );
  expect(members.status).toBe(200);
  return members.body.members.items.find(
    (member: { account: string }) => member.account === email,
  ).memberId as string;
}
const seatsOf = async (page: Page, id: string, org: string = A.id) =>
  (
    await authenticatedRequest(
      page,
      dashboardBase(),
      `/api/v1/organizations/${org}/members/${id}/seats`,
    )
  ).body.seats as {
    account: string;
    state: string;
    source: string;
    reclaimMethod: string | null;
  }[];

async function openMember(page: Page, email: string) {
  await page.goto("/members");
  const list = page.getByRole("region", { name: "구성원 목록", exact: true });
  await list.getByRole("textbox", { name: "구성원 검색" }).fill(email);
  await list
    .getByRole("button", { name: `${email} 구성원 상세`, exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
  await drawer.getByRole("button", { name: "벤더 좌석", exact: true }).click();
  await expect(
    drawer.getByRole("list", { name: "벤더별 좌석 상세" }),
  ).toBeVisible();
  return drawer;
}

test("SEATS-ADMIN @p0 @write 벤더 API 가 없는 좌석의 회수는 관리자 조치 확인으로만 끝나고 새로고침 뒤에도 이어지며 복원도 확인으로 끝난다", async ({
  page,
}) => {
  const account = "member4@seed-a.example.test";
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  const id = await memberId(page, account);
  const before = (await seatsOf(page, id)).find(
    (seat) => seat.account === account,
  )!;
  expect(before).toMatchObject({
    state: "assigned",
    reclaimMethod: "admin_action",
  });

  let drawer = await openMember(page, account);
  // 좌석 항목만 — 작업 패널의 대상 목록도 listitem 이다.
  const seat = drawer.locator("li[data-seat-id]").filter({ hasText: "Claude" });
  await expect(seat).toContainText("벤더 콘솔에서 직접 해지 후 확인");
  await seat.getByRole("button", { name: /좌석 회수$/ }).click();
  const modal = page.getByRole("dialog", {
    name: "좌석 회수 확인",
    exact: true,
  });
  await expect(modal).toContainText("벤더 콘솔에서 직접 해지 후 확인");
  await modal.getByRole("button", { name: "회수 실행" }).click();
  await expect(
    modal.getByRole("region", { name: "좌석 회수 작업" }).getByRole("status"),
  ).toContainText("관리자 조치 대기");
  // 조치 대기는 완료가 아니다 — 원장은 그대로다.
  expect(
    (await seatsOf(page, id)).find((item) => item.account === account)!.state,
  ).toBe("assigned");

  // 새로고침 뒤에도 좌석의 최근 작업을 다시 찾아 확인한다.
  await page.reload();
  drawer = await openMember(page, account);
  const reclaim = drawer.getByRole("region", { name: "좌석 회수 작업" });
  await expect(reclaim.getByRole("status")).toContainText("관리자 조치 대기");
  await reclaim.getByRole("button", { name: "해지 완료 확인" }).click();
  await expect(reclaim.getByRole("status")).toContainText("회수 · 완료");
  await expect
    .poll(async () =>
      (await seatsOf(page, id)).find((item) => item.account === account),
    )
    .toMatchObject({ state: "released", source: "admin_action" });

  await reclaim.getByRole("button", { name: "복원" }).click();
  const restore = drawer.getByRole("region", { name: "좌석 복원 작업" });
  await expect(restore.getByRole("status")).toContainText("관리자 조치 대기");
  await restore.getByRole("button", { name: "배정 완료 확인" }).click();
  await expect(restore.getByRole("status")).toContainText("복원 · 완료");
  await expect
    .poll(async () =>
      (await seatsOf(page, id)).find((item) => item.account === account),
    )
    .toMatchObject({ state: "assigned", source: "admin_action" });
});

test("SEATS-CSV @p0 @write 관리자 기록 제품의 CSV API는 잘못된 열을 거절하고 미리보기 뒤 적용한 행만 남긴다", async ({
  page,
}) => {
  const account = "e2e-csv@seed-a.example.test";
  await signIn(page, "owner@seed-" + A.seed + ".example.test");
  const vendors = (
    await authenticatedRequest(
      page,
      dashboardBase(),
      "/api/v1/organizations/" + A.id + "/settings",
    )
  ).body.vendors.items as { kind: string; vendorId: string }[];
  const vendor = vendors.find((item) => item.kind === "openai_biz")!;
  const path =
    "/api/v1/organizations/" + A.id + "/vendors/" + vendor.vendorId + "/seats";
  const importCsv = (mode: string, csv: string) =>
    authenticatedRequest(
      page,
      enrollmentBase(),
      path + "/import",
      "POST",
      { mode, csv },
      { "Idempotency-Key": crypto.randomUUID() },
    );
  const bad = await importCsv("preview", "account,name\n" + account + ",E2E");
  expect(bad.status).toBe(400);
  expect(bad.body.error.code).toBe("invalid_csv");
  let applied = false;
  try {
    const csv = "account,status\n" + account + ",assigned";
    const preview = await importCsv("preview", csv);
    expect(preview.status).toBe(200);
    expect(preview.body.import.applied).toBe(false);
    expect(preview.body.import.rows[0].action).toMatch(/create|reassign/);
    const result = await importCsv("apply", csv);
    expect(result.status).toBe(200);
    applied = result.body.import.applied;
    expect(applied).toBe(true);
    const seats = (
      await authenticatedRequest(page, dashboardBase(), path + "?limit=100")
    ).body.seats.items as { account: string; state: string }[];
    expect(seats.find((seat) => seat.account === account)?.state).toBe(
      "assigned",
    );
  } finally {
    if (applied) {
      const released = await importCsv(
        "apply",
        "account,status\n" + account + ",released",
      );
      expect(released.status).toBe(200);
      expect(released.body.import.applied).toBe(true);
    }
  }
});

test("SEATS-OVERVIEW @p0 @read 개요의 제품별 배정 좌석은 구성원 요약과 같은 좌석 원장이고, 좌석을 기록하지 않은 제품은 사유를 말한다", async ({
  page,
}) => {
  // 시드 A 좌석 원장의 독립 기대값(백엔드 tools/dev-seed/README.md) — 보유 7석(Claude 5·OpenAI 2), Copilot·Cursor 는 좌석 기록 없음.
  // Copilot 은 커넥터가 없는 플랜이다(백엔드 ADR 0054). 쓰기 테스트는 끝에 원래 수로 되돌린다.
  const expected: Record<string, string> = {
    "Claude (Anthropic)": "배정 5석",
    "ChatGPT / Codex (OpenAI)": "배정 2석",
    "GitHub Copilot": "배정 이 제품은 좌석을 기록하지 않았습니다",
    Cursor: "배정 이 제품은 좌석을 기록하지 않았습니다",
  };
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  const { start, end } = seedPeriod();
  const summary = (
    await authenticatedRequest(
      page,
      dashboardBase(),
      `/api/v1/organizations/${A.id}/members/dashboard?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul`,
    )
  ).body.summary.seats;
  expect(summary.data.assigned).toBe(7);
  await page.goto("/overview");
  const table = page.getByRole("table", { name: "계약·좌석 현황" });
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    for (const [name, text] of Object.entries(expected)) {
      const row = table.getByRole("row").filter({
        has: page.getByRole("button", {
          name: `${name} 벤더 상세`,
          exact: true,
        }),
      });
      await expect(row.getByRole("cell").nth(1)).toContainText(text);
    }
  }
  // 판정하지 못한 좌석이 있으면 후보 수가 판정한 좌석만이라고 말한다(빈 후보를 "0석 확정"으로 보이지 않는다).
  const candidates = (
    await authenticatedRequest(
      page,
      dashboardBase(),
      `/api/v1/organizations/${A.id}/seat-reclaim-candidates?limit=50`,
    )
  ).body.candidates;
  const card = page.getByRole("region", {
    name: "계약·좌석 현황",
    exact: true,
  });
  if (candidates.availability === "partial")
    await expect(card).toContainText("회수 후보는 판정한 좌석만");
  else await expect(card).not.toContainText("회수 후보는 판정한 좌석만");
});

test("SEATS-BILLING @p0 @read 설정 요약의 종량 지출은 벤더 청구 누계이며, 청구 원천이 없는 제품은 금액을 만들지 않는다", async ({
  page,
}) => {
  // 시드 C: Cursor Enterprise 연결의 청구 누계 $137.42(원천 seed — 실제 청구가 아님, 계약액 $120 과 다름). 시드 A 는 청구 API 가 있는 플랜이 없다.
  const C = seedOrganizations[2];
  await signIn(page, `owner@seed-${C.seed}.example.test`);
  await page.goto("/settings");
  const settings = (
    await authenticatedRequest(
      page,
      dashboardBase(),
      `/api/v1/organizations/${C.id}/settings`,
    )
  ).body;
  const cursor = settings.vendors.items.find(
    (vendor: { kind: string }) => vendor.kind === "cursor",
  );
  expect(cursor.meteredMonthToDate.data).toMatchObject({
    billingKind: "usage_spend",
    source: "seed",
    equivalentCostUsd: null,
  });
  expect(Number(cursor.meteredMonthToDate.data.actualBilledUsd)).toBe(137.42);
  const total = page.getByRole("group", { name: "종량 지출", exact: true });
  await expect(total).toContainText(
    settings.summary.meteredMonthToDate.data?.actualBilledUsd != null
      ? "$137.42"
      : "-",
  );
  await signIn(page, `owner@seed-${A.seed}.example.test`);
  await page.goto("/settings");
  await expect(
    page.getByRole("group", { name: "종량 지출", exact: true }),
  ).toContainText("이 플랜에는 청구 조회 API가 없습니다");
});
