import { expect, authenticatedTest as test } from "./fixtures";
import {
  corsHeaders,
  mockOverviewSettings,
  overviewFixture,
  overviewUrl,
} from "./overview-fixture";

test("initial overview response preserves an open calendar and its unapplied draft", async ({
  page,
}, testInfo) => {
  await mockOverviewSettings(page);
  let releaseInitial!: () => void;
  const initialResponse = new Promise<void>((resolve) => {
    releaseInitial = resolve;
  });
  const requests: URL[] = [];
  await page.route(overviewUrl, async (route) => {
    requests.push(new URL(route.request().url()));
    if (requests.length === 1) await initialResponse;
    await route.fulfill({
      json: overviewFixture(route.request().url()),
      headers: corsHeaders(page),
    });
  });

  await page.goto(
    "/overview?startDate=2026-09-01&endDate=2026-09-13&compare=none",
  );
  await expect.poll(() => requests.length).toBe(1);
  await expect(
    page.getByText("개요 데이터를 불러오는 중입니다…", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "2026.09.01 ~ 2026.09.13", exact: true })
    .click();
  const calendar = page.getByRole("dialog", {
    name: "기간 선택",
    exact: true,
  });
  await calendar.getByTitle("2026-09-04", { exact: true }).click();
  await calendar.getByTitle("2026-09-08", { exact: true }).click();
  await expect(calendar.getByText("5일 선택됨", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("startDate")).toBe("2026-09-01");
  expect(requests).toHaveLength(1);
  await testInfo.attach("loading-calendar-draft", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  const received = page.waitForResponse(overviewUrl);
  releaseInitial();
  expect((await received).status()).toBe(200);
  await expect(
    page.getByRole("region", { name: "사용자 수", exact: true }),
  ).toBeVisible();
  await testInfo.attach("after-initial-response", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await expect(calendar).toBeVisible();
  await expect(calendar.getByText("5일 선택됨", { exact: true })).toBeVisible();
  await calendar.getByRole("button", { name: "적용", exact: true }).click();
  await expect(calendar).toHaveCount(0);
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("startDate") === "2026-09-04" &&
      url.searchParams.get("endDate") === "2026-09-08" &&
      url.searchParams.get("compare") === "none",
  );
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].searchParams.get("startDate")).toBe("2026-09-04");
  expect(requests[1].searchParams.get("endDate")).toBe("2026-09-08");
});
