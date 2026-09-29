import { expect, test } from "@playwright/test";
import { mockOverview, settingsUrl, corsHeaders } from "./overview-fixture";

test("기존 지표·그래프·벤더 표 배치와 상세 드로어를 유지한다", async ({ page }) => {
  await mockOverview(page);
  await page.goto("/overview");
  for (const name of ["사용 관측 인원", "토큰 비용", "월 좌석 계약액", "세션", "보안 경보 및 알림", "사용 환산액 추이", "모델 구성", "계약·좌석 현황", "팀별 요약"]) await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  const people = page.getByRole("region", { name: "사용 관측 인원", exact: true });
  await expect(people).toContainText("100");
  const row = page.getByRole("table", { name: "계약·좌석 현황" }).getByRole("row").filter({ hasText: "Claude" });
  await expect(row).toContainText("100석");
  // 조직 사용자 수나 계약 좌석으로 벤더 관측 인원·회수 후보를 추측하지 않는다.
  await expect(row.getByRole("cell").nth(2)).toHaveText("-");
  await expect(row.getByRole("cell").nth(3)).toHaveText("-");
  await expect(page.getByRole("region", { name: "월 좌석 계약액" })).toContainText("$4,800.00");
  await page.getByRole("button", { name: "Claude 벤더 상세" }).click();
  const drawer = page.getByRole("dialog", { name: "Claude 현황", exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("표준 · 100석");
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  const kpi = await people.boundingBox();
  const lastKpi = await page.getByRole("region", { name: "보안 경보 및 알림" }).boundingBox();
  expect(lastKpi!.y).toBe(kpi!.y);
  const trend = await page.getByRole("region", { name: "사용 환산액 추이" }).boundingBox();
  const mix = await page.getByRole("region", { name: "모델 구성" }).boundingBox();
  expect(trend!.y).toBe(mix!.y);
  expect(trend!.width).toBeGreaterThan(mix!.width);
});

test("계약 조회만 실패하면 기존 표에서 재시도하고 다른 카드는 유지한다", async ({ page }) => {
  await mockOverview(page);
  await page.route(settingsUrl, (route) => route.fulfill({ status: 403, json: {}, headers: corsHeaders(page) }));
  await page.goto("/overview");
  await expect(page.getByRole("region", { name: "계약·좌석 현황" })).toContainText("계약 정보를 불러오지 못했습니다");
  await expect(page.getByRole("region", { name: "월 좌석 계약액" })).toContainText("-");
  await expect(page.getByRole("region", { name: "토큰 비용" })).toContainText("$5,000.00");
  await expect(page.getByRole("button", { name: "계약 다시 조회" })).toBeVisible();
});
