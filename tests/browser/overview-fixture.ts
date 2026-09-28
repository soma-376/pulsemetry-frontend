import type { Page } from "@playwright/test";
import example from "../../docs/api/overview-response.example.json";

export const overviewUrl = "**/api/v1/organizations/*/analytics/overview?*";
export const testOrganizationId = "11111111-1111-4111-8111-111111111111";
export const corsHeaders = (page: Page) => ({ "access-control-allow-origin": new URL(page.url()).origin, "access-control-allow-credentials": "true" });

/** 일자와 조직은 실제 브라우저 요청을 따른다. 운영 코드에는 fixture를 주입하지 않는다. */
export function overviewFixture(url: string) {
  const request = new URL(url);
  const data = structuredClone(example);
  data.meta.organizationId = request.pathname.split("/")[4];
  data.meta.startDate = request.searchParams.get("startDate")!;
  data.meta.endDate = request.searchParams.get("endDate")!;
  data.comparison.mode = request.searchParams.get("compare")!;
  data.meta.dayCount = (Date.parse(data.meta.endDate) - Date.parse(data.meta.startDate)) / 86_400_000 + 1;
  data.trend.points = Array.from({ length: data.meta.dayCount }, (_, index) => ({ ...example.trend.points[index % 7], date: new Date(Date.parse(data.meta.startDate) + index * 86_400_000).toISOString().slice(0, 10) }));
  if (data.comparison.mode === "none") {
    data.comparison.status = "disabled";
    // JSON fixture의 구체 타입 대신 실제 계약이 허용하는 null을 사용한다.
    Object.assign(data.usage, { previous: null });
    Object.assign(data.seats, { previous: null });
  }
  return data;
}

export async function mockOverview(page: Page, modify?: (data: ReturnType<typeof overviewFixture>) => void) {
  await mockOverviewSettings(page);
  await page.clock.setFixedTime(new Date("2026-09-13T12:00:00Z"));
  await page.route(overviewUrl, async (route) => {
    const data = overviewFixture(route.request().url());
    modify?.(data);
    await route.fulfill({ json: data, headers: corsHeaders(page) });
  });
}

export const settingsUrl = "**/api/v1/organizations/*/settings";
export function settingsFixture(organizationId = testOrganizationId) {
  return {
    meta: { organizationId, asOf: "2026-09-14T00:00:00Z", snapshotId: "fixture-contracts" },
    summary: { monthlySeatFeeUsd: "4800.000000" },
    catalog: { plans: [{ planId: "team", kind: "claude_team", displayName: "Team" }, { planId: "business", kind: "openai_biz", displayName: "Business" }] },
    vendors: { totalCount: 2, nextCursor: null, items: [
      { vendorId: "claude-contract", displayName: "Claude", kind: "claude_team", state: "configured", contract: { planId: "team", effectiveTo: null, monthlySeatFeeUsd: "2800.000000", tiers: [{ tierId: "standard", label: "표준", seats: 100, monthlyFeePerSeatUsd: "28.000000" }] } },
      { vendorId: "codex-contract", displayName: "Codex", kind: "openai_biz", state: "configured", contract: { planId: "business", effectiveTo: null, monthlySeatFeeUsd: "2000.000000", tiers: [{ tierId: "standard", label: "표준", seats: 50, monthlyFeePerSeatUsd: "40.000000" }] } },
    ] },
  };
}
export async function mockOverviewSettings(page: Page) {
  await page.route(settingsUrl, (route) => route.fulfill({ json: settingsFixture(new URL(route.request().url()).pathname.split("/")[4]), headers: corsHeaders(page) }));
}
