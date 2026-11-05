import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  issueFixtureCookie,
  fixtureUser,
  completedOnboarding,
} from "../browser/session-fixture";
import { overviewSchema } from "../../src/lib/api/overview";
import { teamsResponseSchema } from "../../src/lib/api/teams";

type Harness = {
  baseURL: string;
  organizationId: string;
  teamId: string;
  memberId: string;
  authorization: string;
  startDate: string;
  endDate: string;
};

test("실제 자동 집계 API → 10개 시간축 → 팀 상세·사용자 → 같은 snapshot CSV", async ({
  page,
  context,
}) => {
  const harness: Harness = JSON.parse(
    await readFile(
      process.env.AUTO_TREND_API_CONFIG ?? "/tmp/proj317-browser-api.json",
      "utf8",
    ),
  );
  const target = new URL(harness.baseURL);
  if (!["localhost", "127.0.0.1"].includes(target.hostname))
    throw Error("격리 로컬 API만 검증합니다");
  const seen: URL[] = [];
  await issueFixtureCookie(page, { origin: "http://localhost:3187" });
  await page.route("**/api/bff/auth/session", (route) =>
    route.fulfill({
      json: {
        user: {
          ...fixtureUser,
          organizationId: harness.organizationId,
          memberId: harness.memberId,
        },
      },
    }),
  );
  await page.route(
    `**/api/v1/organizations/${harness.organizationId}/onboarding`,
    (route) =>
      route.fulfill({
        json: {
          ...completedOnboarding,
          organizationId: harness.organizationId,
        },
      }),
  );
  await page.route("**/api/bff/dashboard/**", async (route) => {
    const url = new URL(route.request().url());
    const path =
      url.pathname.replace(/^\/api\/bff\/dashboard/, "") + url.search;
    const response = await context.request.get(
      new URL(path, harness.baseURL).toString(),
      { headers: { Authorization: harness.authorization } },
    );
    if (url.pathname.includes("/analytics/")) {
      seen.push(url);
      expect(response.status(), path).toBe(200);
    }
    await route.fulfill({
      status: response.status(),
      contentType: "application/json",
      body: await response.body(),
    });
  });
  const filter = `startDate=${harness.startDate}&endDate=${harness.endDate}&compare=none`;
  const overviewResponse = page.waitForResponse((r) =>
    r.url().includes("/analytics/overview?"),
  );
  await page.goto(`/overview?${filter}`);
  const overview = overviewSchema.parse(await (await overviewResponse).json());
  expect(overview.meta.trendAggregation?.intervalSeconds).toBe(259200);
  expect(overview.trend?.points).toHaveLength(10);
  expect(overview.summary?.equivalentCostUsd.value).toBe("6.123459");
  expect(overview.summary?.sessionCount.value).toBe(2);
  const slider = page.getByRole("slider", { name: /3일별 사용 환산액/ });
  await expect(slider).toHaveAttribute("aria-valuemax", "10");
  await slider.focus();
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    /2026-09-01 00:00 ~ 2026-09-04 00:00 KST/,
  );
  const overviewDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const overviewCsv = await readFile(
    (await (await overviewDownload).path())!,
    "utf8",
  );
  expect(overviewCsv).toContain(`snapshot,${overview.meta.snapshotId}`);
  // 첫 3일 버킷은 1.123456 + 2.000001을 정확히 합산한다.
  expect(overviewCsv).toContain("3.123457");
  expect(overviewCsv).toContain("6.123459");
  const teamsResponse = page.waitForResponse((r) =>
    /\/analytics\/teams\?/.test(r.url()),
  );
  await page.goto(`/teams?${filter}`);
  const teams = teamsResponseSchema.parse(await (await teamsResponse).json());
  const team = teams.teams.items.find((t) => t.teamId === harness.teamId)!;
  expect(team.trend).toHaveLength(10);
  const last = team.trend.at(-1)!;
  if (!("bucketStart" in last)) throw Error("auto expected");
  expect(last.cumulativeEquivalentCostUsd.value).toBe("6.123459");
  expect(last.cumulativeSessionCount.value).toBe(2);
  const panel = page.getByRole("region", { name: "팀별 사용량 비교" });
  await expect(panel.getByRole("tab")).toHaveCount(2);
  await expect(
    panel.getByRole("tab", { name: "세션", exact: true }),
  ).toHaveCount(0);
  await expect(panel.getByRole("slider")).toHaveAttribute(
    "aria-valuemax",
    "10",
  );
  await panel.getByRole("button", { name: team.teamName, exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("6.12");
  await page.keyboard.press("Escape");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const csv = await readFile((await (await download).path())!, "utf8");
  expect(csv).toContain(`snapshot,${teams.meta.snapshotId}`);
  expect(csv).toContain(",cost,strict,6.123459,complete,");
  expect(csv).toContain("team_users,");
  expect(csv).toContain("sessionCount_status");
  expect(
    seen.filter((u) => u.pathname.endsWith("/users")).length,
  ).toBeGreaterThan(0);
  for (const url of seen) {
    if (url.pathname.endsWith("/users")) {
      expect(url.searchParams.has("bucket")).toBe(false);
      expect(url.searchParams.get("snapshotId")).toBe(teams.meta.snapshotId);
    } else expect(url.searchParams.has("bucket")).toBe(false);
  }
  // 직접 상세 API도 같은 snapshot·집계 기준을 계승한다(드로어는 목록의 같은 행을 사용한다).
  const detail = await context.request.get(
    `${harness.baseURL}/api/v1/organizations/${harness.organizationId}/analytics/teams/${harness.teamId}?${filter}&timeZone=Asia%2FSeoul&bucket=auto&snapshotId=${encodeURIComponent(teams.meta.snapshotId)}`,
    { headers: { Authorization: harness.authorization } },
  );
  expect(detail.status()).toBe(200);
  const body = await detail.json();
  expect(body.meta.trendAggregation).toEqual(teams.meta.trendAggregation);
  expect(body.team.trend.at(-1).cumulativeSessionCount.value).toBe(2);
});
