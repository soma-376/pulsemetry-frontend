import { expect, authenticatedTest as test } from "./fixtures";
import { mockOverview, settingsUrl } from "./overview-fixture";
import { mockSession } from "./helpers";

test("기간 지표 5개와 차트를 유지하고 현재 계약은 개요에서 조회하지 않는다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverview(page);
  let contractRequests = 0;
  await page.route(settingsUrl, (route) => {
    contractRequests++;
    return route.fulfill({ status: 403, json: {} });
  });
  await page.goto("/overview");
  for (const name of [
    "사용자 수",
    "사용 환산액",
    "세션 수",
    "사용자당 환산액",
    "총 토큰 수",
    "사용 환산액 추이",
    "모델별 사용 환산액 비중",
    "팀별 요약",
  ])
    await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "사용자당 환산액", exact: true }),
  ).toContainText("$50.00");
  await expect(
    page.getByRole("region", { name: "사용자당 환산액", exact: true }),
  ).toContainText("12.5%");
  await expect(
    page.getByRole("region", { name: "계약·좌석 현황", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "월 좌석 계약액", exact: true }),
  ).toHaveCount(0);
  expect(contractRequests).toBe(0);
  const first = await page
    .getByRole("region", { name: "사용자 수", exact: true })
    .boundingBox();
  const last = await page
    .getByRole("region", { name: "총 토큰 수", exact: true })
    .boundingBox();
  expect(last!.y).toBe(first!.y);
  const trend = await page
    .getByRole("region", { name: "사용 환산액 추이" })
    .boundingBox();
  const mix = await page
    .getByRole("region", { name: "모델별 사용 환산액 비중" })
    .boundingBox();
  expect(trend!.y).toBe(mix!.y);
  expect(trend!.width).toBeGreaterThan(mix!.width);
});
