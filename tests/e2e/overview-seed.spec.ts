import type { Page } from "@playwright/test";
import { expect, test, seedOrganizations } from "./fixtures";
import { seedPeriod, signIn, selectPeriod } from "./helpers";
import type { Overview } from "../../src/lib/api/overview";
import { PreparationError } from "./harness";

/** A의 조회 구간 환산 비용. 시드 생성기의 plan 출력이 원천이며 조회 API의 응답으로 채우지 않는다. */
function seedCostA() {
  const value = process.env.E2E_SEED_A_PERIOD_COST_USD ?? "";
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new PreparationError(
      ".env.local의 E2E_SEED_A_PERIOD_COST_USD를 백엔드 `dev-seed plan <E2E_SEED_DATE>` 출력에서 A의 period_known_estimated_usd 값으로 설정하세요.",
    );
  }
  return Number(value);
}

async function openSeedOverview(page: Page, index: 0 | 2) {
  const org = seedOrganizations[index];
  const { start, end } = seedPeriod();
  await signIn(page, `owner@seed-${org.seed}.example.test`);
  await page.goto("/overview");
  await expect(
    page.getByRole("region", { name: "사용 관측 인원", exact: true }),
  ).toBeVisible();
  await selectPeriod(page, start, end);
  await expect(
    page.getByRole("button", {
      name: `${start.replaceAll("-", ".")} ~ ${end.replaceAll("-", ".")}`,
      exact: true,
    }),
  ).toBeVisible();
  // 재실행 때 같은 기간이 캐시에 남아 있어도 실제 서버 응답을 검증한다.
  const response = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/v1/organizations/${org.id}/analytics/overview` &&
      url.searchParams.get("startDate") === start &&
      url.searchParams.get("endDate") === end &&
      url.searchParams.get("timeZone") === "Asia/Seoul"
    );
  });
  await expect(
    page.getByRole("button", { name: "새로고침", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  const body: Overview = await result.json();
  expect(body.meta).toMatchObject({
    organizationId: org.id,
    startDate: start,
    endDate: end,
    timeZone: "Asia/Seoul",
    dayCount: 28,
  });
  return body;
}

test("OVERVIEW-A @p0 @read 달력으로 시드 기간 조회 후 관측 인원·비용과 비교 변경을 검증한다", async ({
  page,
}) => {
  const cost = seedCostA();
  const costText = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cost);
  const body = await openSeedOverview(page, 0);
  // 백엔드 시드 시나리오의 독립 기대값. UI와 같은 응답만 비교해서 통과시키지 않는다.
  expect(body.usage.current?.activeUsers).toBe(8);
  expect(Number(body.usage.current?.equivalentCostUsd)).toBe(cost);
  await expect(
    page
      .getByRole("region", { name: "사용 관측 인원", exact: true })
      .getByText("8", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "토큰 비용", exact: true })
      .getByText(costText, { exact: true }),
  ).toBeVisible();
  const changed = page.waitForResponse(
    (response) =>
      response.url().includes("/analytics/overview?") &&
      new URL(response.url()).searchParams.get("compare") === "none",
  );
  await page
    .getByRole("combobox", { name: "비교", exact: true })
    .selectOption("none");
  const response = await changed;
  expect(response.status()).toBe(200);
  expect((await response.json()).comparison.status).toBe("disabled");
  await expect(
    page.getByRole("region", { name: "토큰 비용", exact: true }),
  ).toContainText(costText);
});

test("OVERVIEW-C @p0 @read 미등록 모델과 비용 미확정 값을 0으로 바꾸지 않는다", async ({
  page,
}) => {
  const body = await openSeedOverview(page, 2);
  const unknown = body.modelMix.models.find(
    (model) => model.displayName === "unrecognized-seed-model",
  );
  expect(unknown).toBeDefined();
  expect(unknown?.equivalentCostUsd).toBeNull();
  expect(unknown?.effectiveCostPerMillionTokensUsd).toBeNull();
  expect(body.usage.current?.equivalentCostUsd).toBeNull();
  await expect(
    page
      .getByRole("region", { name: "토큰 비용", exact: true })
      .getByText("-", { exact: true }),
  ).toBeVisible();
  const row = page
    .getByRole("region", { name: "모델 구성", exact: true })
    .getByRole("button", { name: /unrecognized-seed-model/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("-", { exact: true }).first()).toBeVisible();
  await expect(row).not.toContainText("$0.00");
});
