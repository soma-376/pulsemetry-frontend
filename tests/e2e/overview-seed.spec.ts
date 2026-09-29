import type { Page } from "@playwright/test";
import { expect, test, seedOrganizations } from "./fixtures";
import { signIn, signOut, selectPeriod } from "./helpers";
import type { Overview } from "../../src/lib/api/overview";

function seedPeriod() {
  const value = process.env.E2E_SEED_DATE ?? "";
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(".env.local의 E2E_SEED_DATE를 현재 DB 시드의 생성 기준일(YYYY-MM-DD)로 설정하세요. 시드를 초기화할 필요는 없습니다.");
  }
  const offset = (days: number) => new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return { start: offset(-28), end: offset(-1) };
}

async function openSeedOverview(page: Page, index: 0 | 2) {
  const org = seedOrganizations[index];
  const { start, end } = seedPeriod();
  await signIn(page, `owner@seed-${org.seed}.example.test`);
  await page.goto("/overview");
  await expect(page.getByRole("region", { name: "사용 관측 인원", exact: true })).toBeVisible();
  await selectPeriod(page, start, end);
  await expect(page.getByRole("button", { name: `${start.replaceAll("-", ".")} ~ ${end.replaceAll("-", ".")}`, exact: true })).toBeVisible();
  // 재실행 때 같은 기간이 캐시에 남아 있어도 실제 서버 응답을 검증한다.
  const response = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === `/api/v1/organizations/${org.id}/analytics/overview`
      && url.searchParams.get("startDate") === start && url.searchParams.get("endDate") === end
      && url.searchParams.get("timeZone") === "Asia/Seoul";
  });
  await expect(page.getByRole("button", { name: "새로고침", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  const body: Overview = await result.json();
  expect(body.meta).toMatchObject({ organizationId: org.id, startDate: start, endDate: end, timeZone: "Asia/Seoul", dayCount: 28 });
  return body;
}

test("OVERVIEW-A @p0 @read 달력으로 시드 기간 조회 후 관측 인원·비용과 비교 변경을 검증한다", async ({ page }) => {
  const body = await openSeedOverview(page, 0);
  // 백엔드 시드 시나리오의 독립 기대값. UI와 같은 응답만 비교해서 통과시키지 않는다.
  expect(body.usage.current?.activeUsers).toBe(8);
  expect(Number(body.usage.current?.equivalentCostUsd)).toBe(0.525980);
  await expect(page.getByRole("region", { name: "사용 관측 인원", exact: true }).getByText("8", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "토큰 비용", exact: true }).getByText("$0.53", { exact: true })).toBeVisible();
  const changed = page.waitForResponse(response => response.url().includes("/analytics/overview?") && new URL(response.url()).searchParams.get("compare") === "none");
  await page.getByRole("combobox", { name: "비교", exact: true }).selectOption("none");
  const response = await changed;
  expect(response.status()).toBe(200);
  expect((await response.json()).comparison.status).toBe("disabled");
  await expect(page.getByRole("region", { name: "토큰 비용", exact: true })).toContainText("$0.53");
  await signOut(page);
});

test("OVERVIEW-C @p0 @read 미등록 모델과 비용 미확정 값을 0으로 바꾸지 않는다", async ({ page }) => {
  const body = await openSeedOverview(page, 2);
  const unknown = body.modelMix.models.find(model => model.displayName === "unrecognized-seed-model");
  expect(unknown).toBeDefined();
  expect(unknown?.equivalentCostUsd).toBeNull();
  expect(unknown?.effectiveCostPerMillionTokensUsd).toBeNull();
  expect(body.usage.current?.equivalentCostUsd).toBeNull();
  await expect(page.getByRole("region", { name: "토큰 비용", exact: true }).getByText("-", { exact: true })).toBeVisible();
  const row = page.getByRole("region", { name: "모델 구성", exact: true }).getByRole("button", { name: /unrecognized-seed-model/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("-", { exact: true }).first()).toBeVisible();
  await expect(row).not.toContainText("$0.00");
  await signOut(page);
});
