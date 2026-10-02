import { expect, test, type Page, type Route } from "@playwright/test";
import example from "../../docs/api/settings-response.example.json";
import { openDashboard } from "./helpers";

/** 원문 보존 칸 — 서버는 null 을 준다(원본 아카이브 수명은 인프라 저장소 규칙, 백엔드 ADR 0046). 집계 보존과 섞지 않는다. */
async function serve(page: Page, rawContentRetentionDays: number | null) {
  const cors = { "access-control-allow-origin": new URL(test.info().project.use.baseURL!).origin, "access-control-allow-headers": "content-type,authorization" };
  await page.route("**/api/v1/organizations/*/settings", (route: Route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const data = structuredClone(example);
    data.meta.organizationId = new URL(route.request().url()).pathname.split("/")[4];
    return route.fulfill({ headers: cors, json: { ...data, collectionPolicy: { ...data.collectionPolicy, rawContentRetentionDays } } });
  });
}

test("원문 보존 일수가 없으면 집계 보존 값으로 채우지 않고 왜 없는지 말한다", async ({ page }) => {
  await serve(page, null);
  await openDashboard(page, "/settings");
  await expect(page.getByLabel("원문 보존 기간", { exact: true })).toHaveText("-");
  await expect(page.getByText("원본 아카이브의 보관 기간은 인프라 저장소 규칙을 따르며 이 서비스가 조회하지 않습니다 · 집계 보존과 별개입니다", { exact: true })).toBeVisible();
  // 집계 보존 칸은 그대로 자기 값과 설명이다.
  await expect(page.getByRole("combobox", { name: "집계 보존", exact: true })).toBeVisible();
});

test("서버가 원문 보존 일수를 주면 그 값을 보인다", async ({ page }) => {
  await serve(page, 30);
  await openDashboard(page, "/settings");
  await expect(page.getByLabel("원문 보존 기간", { exact: true })).toHaveText("30일");
  await expect(page.getByText(/이 서비스가 조회하지 않습니다/)).toHaveCount(0);
});
