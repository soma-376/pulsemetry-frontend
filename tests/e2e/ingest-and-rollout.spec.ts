import type { Page } from "@playwright/test";
import { expect, test, dashboardBase, seedOrganizations } from "./fixtures";
import { authenticatedRequest, seedPeriod, selectPeriod, signIn, signOut } from "./helpers";
import type { Overview } from "../../src/lib/api/overview";

// 헤더의 수집 상태, 개요의 기간 비교, 설정의 정책 적용 현황과 업데이트 확인 알림을 실제 서버·시드로 본다.
// 기대값은 백엔드 명세와 시드 명세(tools/dev-seed/README.md)에서 쓴다 — 조회 API의 출력을 기대값으로 붙이지 않는다.
const A = seedOrganizations[0];

function seedDate() {
  const value = process.env.E2E_SEED_DATE ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(".env.local의 E2E_SEED_DATE를 현재 DB 시드의 생성 기준일로 설정하세요.");
  return new Date(`${value}T00:00:00Z`);
}
const day = (offset: number) => new Date(seedDate().getTime() + offset * 86_400_000).toISOString().slice(0, 10);

function mailApi() {
  const value = process.env.E2E_MAIL_API_URL;
  if (!value) throw new Error("E2E 선행 조건 실패: E2E_MAIL_API_URL에 메일 수신 컨테이너의 조회 API 주소를 설정하세요.");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname)) throw new Error("메일 수신 컨테이너는 로컬 주소여야 합니다.");
  return value.replace(/\/$/, "");
}
type Mail = { ID: string; Subject: string; To: { Address: string }[] };
async function mailsTo(email: string): Promise<Mail[]> {
  const response = await fetch(`${mailApi()}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  if (!response.ok) throw new Error(`메일 수신 컨테이너 조회 실패: HTTP ${response.status}`);
  return ((await response.json()).messages as Mail[]).filter(mail => mail.To.some(to => to.Address === email));
}

async function overviewFor(page: Page, org: typeof A, start: string, end: string, compare: "prev_period" | "prev_week") {
  const response = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === `/api/v1/organizations/${org.id}/analytics/overview` && url.searchParams.get("startDate") === start
      && url.searchParams.get("endDate") === end && url.searchParams.get("compare") === compare;
  });
  await selectPeriod(page, start, end);
  if (await page.getByRole("combobox", { name: "비교", exact: true }).inputValue() !== compare) {
    await page.getByRole("combobox", { name: "비교", exact: true }).selectOption(compare);
  } else {
    await page.getByRole("button", { name: "새로고침", exact: true }).click();
  }
  const result = await response;
  expect(result.status()).toBe(200);
  return await result.json() as Overview;
}

test("INGEST-HEADER @p0 @read 헤더가 서버의 수집 판정과 사유·보고 중인 설치 수를 그대로 보여 준다", async ({ page }) => {
  // A: 설치 10대가 기준 시각에 마지막으로 보고한 뒤 조용하다 → 보고가 끊김(중단 또는 확인 불가), 창 안의 보고 0대.
  await signIn(page, "owner@seed-a.example.test");
  const bar = page.getByLabel("조직 수집 현황", { exact: true });
  await expect(bar).toContainText("수집 기기의 보고가 끊겼습니다");
  await expect(bar).toContainText(/보고 중인 설치 0대\(최근 \d+분\)/);
  const status = await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/ingest-status`);
  expect(status.body).toMatchObject({ reason: "installations_silent", activeInstallations: 0 });
  await expect(bar).toContainText(status.body.status === "down" ? "수집 중단" : "수집 상태 확인 불가");
  await expect(bar).not.toContainText("수집 정상");
  await signOut(page);

  // C: 설치 보고가 한 번도 없는 조직 — 판정 근거 없음. 서버가 null로 준 설치 수는 보여 주지 않는다.
  await signIn(page, "owner@seed-c.example.test");
  await page.goto("/overview");
  await expect(bar).toContainText("수집 상태 확인 불가");
  await expect(bar).toContainText("수집 기기의 보고가 없어 판정할 수 없습니다");
  await expect(bar).not.toContainText("보고 중인 설치");
  await signOut(page);
});

test("COMPARE-A @p0 @read 두 기간이 모두 완전하면 증감·이전 값·팀 증가 기여를, 아니면 비교 불가 사유를 보여 준다", async ({ page }) => {
  await signIn(page, "owner@seed-a.example.test");
  await page.goto("/overview");
  await expect(page.getByRole("region", { name: "사용 관측 인원", exact: true })).toBeVisible();

  // 시드 A는 등록(기준일 58일 전)부터 기준일 4일 전까지 모든 설치가 손실 없이 보고했다 — 그 안의 두 기간은 비교할 수 있다.
  const body = await overviewFor(page, A, day(-21), day(-8), "prev_period");
  expect(body.comparison).toMatchObject({ status: "available", startDate: day(-35), endDate: day(-22) });
  expect(body.meta.dataState).toBe("ready");
  // 확정 경계는 선택 기간 마지막 날의 다음 자정(서울)이다.
  expect(body.meta.dataThrough).toBe(new Date(`${day(-7)}T00:00:00+09:00`).toISOString().replace(".000Z", "Z"));
  const cost = page.getByRole("region", { name: "토큰 비용", exact: true });
  const [now, before] = [Number(body.usage.current!.equivalentCostUsd), Number(body.usage.previous!.equivalentCostUsd)];
  const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  await expect(cost).toContainText(`${Math.abs((now - before) / before * 100).toFixed(1)}%`);
  await expect(cost).toContainText("이전 기간 대비");
  await expect(cost).toContainText(`이전 ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(before)}`);
  await expect(cost).not.toContainText("비교 불가");
  const table = page.getByRole("table", { name: "팀별 요약", exact: true });
  await expect(table.getByRole("columnheader", { name: "증가 기여" })).toBeVisible();
  const top = body.teamUsage.topTeams[0];
  const contrib = Number(top.current.equivalentCostUsd) - Number(top.previous!.equivalentCostUsd);
  await expect(table.getByRole("row", { name: new RegExp(top.teamName) })).toContainText(`${contrib >= 0 ? "+" : "−"}${money(Math.abs(contrib))}`);

  // 기준일 직전 28일은 두 번째 설치(보고 없음)가 등록된 뒤의 날을 포함한다 — 선택 기간이 완전하지 않아 비교하지 않는다.
  const { start, end } = seedPeriod();
  const partial = await overviewFor(page, A, start, end, "prev_period");
  expect(partial.comparison.status).toBe("unavailable");
  await expect(cost).toContainText("비교 불가");
  await expect(cost).toContainText("선택 기간에 수집 근거가 완전하지 않은 날이 있습니다");
  await expect(cost).not.toContainText("0.0%");
  await expect(page.getByText(/일 관측 · \d+월 \d+일까지 확정/)).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "증가 기여" })).toHaveCount(0);
  await signOut(page);
});

test("ROLLOUT-A @p0 @write 정책 적용 현황을 설치 보고 기준으로 보여 주고 확인 알림 메일이 실제로 도착한다", async ({ page }) => {
  await signIn(page, "owner@seed-a.example.test");
  await page.goto("/settings");
  // 시드 A: 판 2 — 적용 7 · 미적용 3 · 확인 불가 1(두 번째 설치).
  await expect(page.getByText("적용 7대 · 미적용 3대 · 확인 불가 1대 · 설치 보고 기준", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "정책 적용 현황 보기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "수집 정책 적용 현황", exact: true });
  const rows = dialog.getByRole("table", { name: "설치 목록" }).locator("tbody tr");
  // 기본은 미적용 — 이전 판(v1)을 보고한 설치 셋, 마지막 보고 시각이 있다.
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) {
    await expect(row).toContainText("v1");
    await expect(row.getByRole("checkbox")).toBeVisible();
  }
  await dialog.getByRole("button", { name: /^적용 7$/ }).click();
  await expect(rows).toHaveCount(7);
  await expect(rows.getByRole("checkbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: /^확인 불가 1$/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("확인 불가");
  await expect(rows.first()).toContainText("member2@seed-a.example.test");

  const email = "member2@seed-a.example.test";
  const before = (await mailsTo(email)).length;
  const send = dialog.getByRole("button", { name: "업데이트 확인 알림 보내기", exact: true });
  await expect(send).toBeDisabled();
  await rows.first().getByRole("checkbox").check();
  const accepted = page.waitForResponse(response => response.url().endsWith(`/api/v1/organizations/${A.id}/installation-update-notifications`));
  await send.click();
  expect((await accepted).status()).toBe(202);
  // 접수만으로 "보냈다"고 하지 않는다. 작업 상태 조회가 끝나야 발송 결과를 말한다.
  const result = dialog.getByRole("region", { name: "알림 발송 결과" });
  await expect(result.getByRole("status")).toContainText("모두 발송됨 · 발송됨 1대 · 실패 0대", { timeout: 30_000 });
  await expect(result).toContainText("설치의 정책 적용 여부는 목록에서 다시 확인하세요");
  await expect.poll(async () => (await mailsTo(email)).length, { timeout: 30_000, message: "안내 메일 도착" }).toBe(before + 1);
  expect((await mailsTo(email))[0].Subject).toBe("Pulsemetry 수집 정책 업데이트 확인 요청");
  // 알림은 적용이 아니다 — 현황은 그대로다.
  await dialog.getByRole("button", { name: "닫기", exact: true }).last().click();
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page.getByText("적용 7대 · 미적용 3대 · 확인 불가 1대 · 설치 보고 기준", { exact: true })).toBeVisible();
  await signOut(page);
});
