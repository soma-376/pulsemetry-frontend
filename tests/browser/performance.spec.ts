import { expect, test } from "@playwright/test";
import { mockOverview } from "./overview-fixture";
import { mockSession } from "./helpers";

/** 성과 — 요약 카드로 지표를 고르고 8주 추이를 보는 화면(예시 데이터, API 요청 없음). */
test("성과 요약 카드를 누르면 추이 그래프가 그 지표로 바뀐다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  const performanceRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/performance/.test(new URL(request.url()).pathname))
      performanceRequests.push(request.url());
  });
  await page.goto(
    "/ops?startDate=2026-09-21&endDate=2026-10-20&compare=prev_period",
  );
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { level: 1, name: "성과" }),
  ).toBeVisible();
  const summary = main.getByRole("region", { name: "성과 요약" });
  await expect(summary).toContainText("예시 데이터");

  const done = summary.getByRole("button", { name: /^완료한 작업/ });
  await expect(done).toHaveAttribute("aria-pressed", "true");
  await expect(
    main.getByRole("heading", { level: 2, name: "완료한 작업 추이" }),
  ).toBeVisible();
  await expect(
    main.getByRole("img", { name: /^전체 조직 완료한 작업 주별 추이/ }),
  ).toBeVisible();

  const cycle = summary.getByRole("button", { name: /^사이클 타임/ });
  await cycle.click();
  await expect(cycle).toHaveAttribute("aria-pressed", "true");
  await expect(done).toHaveAttribute("aria-pressed", "false");
  await expect(
    main.getByRole("heading", { level: 2, name: "사이클 타임 추이" }),
  ).toBeVisible();

  await summary.getByRole("button", { name: /^합계/ }).click();
  await expect(
    main.getByRole("heading", { level: 2, name: "실패한 작업 합계 추이" }),
  ).toBeVisible();
  expect(performanceRequests).toEqual([]);
});

test("팀 범위는 URL에 남고 전체 평균과 함께 비교한다", async ({ page }) => {
  await mockSession(page);
  await mockOverview(page);
  await page.goto(
    "/ops?startDate=2026-09-21&endDate=2026-10-20&compare=prev_period",
  );
  const main = page.getByRole("main");
  const trend = main.getByRole("region", { name: "완료한 작업 추이" });
  await expect(trend.getByText("전체 평균", { exact: true })).toHaveCount(0);

  await page.getByRole("combobox", { name: "범위" }).selectOption("payments");
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/ops" &&
      url.searchParams.get("scope") === "payments" &&
      url.searchParams.get("startDate") === "2026-09-21" &&
      url.searchParams.get("compare") === "prev_period",
  );
  await expect(trend.getByText("전체 평균", { exact: true })).toBeVisible();
  await expect(trend.getByText("전체 평균 대비")).toBeVisible();
  await expect(
    main.getByRole("img", {
      name: /^결제 팀 완료한 작업 주별 추이, 전체 평균과 비교/,
    }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("combobox", { name: "범위" })).toHaveValue(
    "payments",
  );
  await expect(
    main
      .getByRole("region", { name: "성과 요약" })
      .getByRole("button", { name: /^완료한 작업/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("성과는 기간 조건을 유지하고 보안은 별도 화면으로 이동한다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  await page.goto(
    "/ops?startDate=2026-09-21&endDate=2026-10-20&compare=prev_period",
  );
  const nav = page.getByRole("navigation", { name: "주 내비게이션" });
  await expect(
    nav.getByRole("link", { name: "성과", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    nav.getByRole("link", { name: "보안", exact: true }),
  ).toHaveAttribute("href", "/security");
});
