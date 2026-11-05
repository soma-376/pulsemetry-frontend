import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { autoOverview, autoTeamsResponse, contract } from "./auto-trend";
import { teamsResponseSchema } from "../../src/lib/api/teams";
import { int } from "../../src/lib/format";
import {
  issueFixtureCookie,
  mockAuthenticatedRoutes,
} from "../browser/session-fixture";
import {
  mockIngestStatus,
  mockOverviewSettings,
  overviewFixture,
  testOrganizationId,
} from "../browser/overview-fixture";
import { fixtureTeamUsers, teamsFixture } from "../browser/teams-fixture";

const missingSession = {
  value: null,
  status: "unavailable" as const,
  reasons: ["session_identity_missing"],
};
const complete = <T>(value: T) => ({
  value,
  status: "complete" as const,
  reasons: [],
});
export async function downloadedCsv(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  return readFile((await (await pending).path())!, "utf8");
}
export async function readySessionPreservation(page: Page, origin: string) {
  await mockAuthenticatedRoutes(page);
  await issueFixtureCookie(page, { origin });
  await mockOverviewSettings(page);
  await mockIngestStatus(page);
  await page.clock.setFixedTime(new Date(contract.asOf));
}

/** 같은 보존 계약을 기본 일별·기능 플래그 자동 빌드에서 각각 실행한다. */
export function sessionPreservationTests(bucket: "day" | "auto") {
  const origin =
    bucket === "auto" ? "http://localhost:3187" : "http://localhost:3107";
  const range =
    bucket === "auto"
      ? {
          startDate: contract.request.startDate,
          endDate: contract.request.endDate,
        }
      : { startDate: "2026-09-07", endDate: "2026-09-13" };
  const compare = bucket === "auto" ? "none" : "prev_week";
  const period = new URLSearchParams({
    ...range,
    compare,
  }).toString();
  for (const width of [1440, 390]) {
    test(`${bucket} ${width}px: 이전 세션 링크는 비용 탭으로 열고 기간·비교·팀 상세·세션 계약을 보존한다`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await readySessionPreservation(page, origin);
      const source =
        bucket === "auto"
          ? autoTeamsResponse()
          : teamsResponseSchema.parse(
              teamsFixture(
                new URL(
                  `http://fixture/api/v1/organizations/${testOrganizationId}/analytics/teams?${period}`,
                ),
              ),
            );
      const team = source.teams.items[0];
      // 세션 식별자가 없는 사용도 비용·토큰과 미배정 행에 남는다.
      Object.assign(source.unassigned.metrics, {
        pricedUsageRows: 1,
        unpricedUsageRows: 0,
      });
      Object.assign(source.unassigned.metrics.sessionCount, missingSession);
      for (const point of source.unassigned.trend) {
        if ("bucketStart" in point) {
          if (point.temporalState !== "upcoming")
            point.cumulativeSessionCount = { ...missingSession };
        } else
          Object.assign(point, {
            cumulativeSessionCount: null,
            status: "partial",
            reasons: ["session_identity_missing"],
          });
      }
      const users = fixtureTeamUsers("preserve", 3).sort((a, b) =>
        a.account.localeCompare(b.account),
      );
      users[0].usage.sessionCount = complete(2);
      users[1].usage.sessionCount = complete(7);
      users[2].usage.sessionCount = { ...missingSession };
      const sorts: string[] = [];
      await page.route("**/analytics/teams**", (route) => {
        const url = new URL(route.request().url());
        expect(url.searchParams.get("startDate")).toBe(range.startDate);
        expect(url.searchParams.get("endDate")).toBe(range.endDate);
        if (!url.pathname.endsWith("/users")) {
          expect(url.searchParams.get("compare")).toBe(compare);
          expect(url.searchParams.get("bucket")).toBe(bucket);
          return route.fulfill({
            json: url.pathname.endsWith("/teams")
              ? source
              : { meta: source.meta, comparison: source.comparison, team },
          });
        }
        const selected = url.pathname.includes("/unassigned/users")
          ? source.unassigned
          : team;
        const sort = url.searchParams.get("sort") ?? "cost";
        sorts.push(sort);
        const rows =
          sort === "session" ? [users[1], users[0], users[2]] : users;
        return route.fulfill({
          json: {
            meta: source.meta,
            team: { teamId: selected.teamId, teamName: selected.teamName },
            summary: {
              usage: {
                activeUsers: selected.metrics.activeUsers,
                equivalentCostUsd: selected.metrics.equivalentCostUsd,
                sessionCount: selected.metrics.sessionCount,
                totalTokens: selected.metrics.totalTokens,
              },
              averageEquivalentCostUsd: "2.000000",
              cacheHitRatio: complete(0.5),
              unidentifiedEquivalentCostUsd: "0.000000",
            },
            users: { items: rows, totalCount: rows.length, nextOffset: null },
          },
        });
      });
      const legacy = width === 1440 ? "axis=session" : "tab=session";
      await page.goto(`/teams?${period}&team=${team.teamId}&${legacy}`);
      const drawer = page.getByRole("dialog", {
        name: `${team.teamName} 팀`,
        exact: true,
      });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByText("세션", { exact: true })).toBeVisible();
      await expect(
        drawer.getByText(`${int(team.metrics.sessionCount.value!)}개`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page).toHaveURL(
        (url) =>
          url.searchParams.get("team") === team.teamId &&
          url.searchParams.get("compare") === compare &&
          url.searchParams.get("startDate") === range.startDate &&
          url.searchParams.get("endDate") === range.endDate,
      );
      await drawer
        .getByRole("button", { name: "상세 패널 닫기", exact: true })
        .click();
      const panel = page.getByRole("region", { name: "팀별 사용량 비교" });
      await expect(panel.getByRole("tab")).toHaveText(["비용", "토큰"]);
      await expect(
        panel.getByRole("tab", { name: "비용", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        panel.getByRole("button", { name: "세션당 정렬", exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByRole("checkbox", { name: /미배정/ }),
      ).toBeChecked();
      const usage = page.getByRole("region", { name: "사용자별 사용량" });
      await expect(
        usage.getByText("preserve01@codeworks.io", { exact: true }),
      ).toBeVisible();
      await expect(
        usage.getByText("세션", { exact: true }).first(),
      ).toBeVisible();
      if (width === 1440) {
        await usage
          .getByRole("button", { name: "세션 정렬", exact: true })
          .click();
        await expect.poll(() => sorts.includes("session")).toBe(true);
        await expect(usage.getByText(/^preserve\d+@codeworks.io$/)).toHaveText([
          "preserve02@codeworks.io",
          "preserve01@codeworks.io",
          "preserve03@codeworks.io",
        ]);
      }
      const costCsv = await downloadedCsv(page);
      expect(costCsv).toContain("sessionCount_status,sessionCount_reasons");
      expect(costCsv).toContain("cumulativeSessionCount");
      expect(costCsv).toContain("session_identity_missing");
      expect(costCsv).toMatch(/^chart_trend,.*cost,strict,/m);
      await panel.getByRole("tab", { name: "토큰", exact: true }).click();
      const tokenCsv = await downloadedCsv(page);
      expect(tokenCsv).toMatch(/^chart_trend,.*token,strict,/m);
      expect(tokenCsv).not.toMatch(/^chart_trend,.*session,/m);
      expect(tokenCsv).toContain("session_identity_missing");
      await expect(
        page.getByRole("region", { name: "팀별 벤더 비중" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/proj318-${bucket}-teams-${width}.png`,
        fullPage: true,
      });

      let overviewSessions: number | null = null;
      await page.route("**/analytics/overview?*", (route) => {
        const data =
          bucket === "auto"
            ? autoOverview()
            : overviewFixture(route.request().url());
        overviewSessions = data.summary!.sessionCount.value;
        return route.fulfill({ json: data });
      });
      await page.goto(`/overview?${period}`);
      const labels = [
        "사용자 수",
        "사용 환산액",
        "세션 수",
        "사용자당 환산액",
        "총 토큰 수",
      ];
      const kpis = page
        .locator('div[role="region"]')
        .filter({ has: page.locator("span[title]") });
      await expect
        .poll(() =>
          kpis.evaluateAll((cards) =>
            cards.map((card) => card.getAttribute("aria-label")),
          ),
        )
        .toEqual(labels);
      const sessions = page.getByRole("region", {
        name: "세션 수",
        exact: true,
      });
      await expect(sessions).toContainText(`${int(overviewSessions!)}개`);
      const overviewCsv = await downloadedCsv(page);
      expect(overviewCsv).toMatch(/^summary,sessionCount,/m);
      expect(overviewCsv).toMatch(/^summary,sessionsPerUser,/m);
      expect(overviewCsv).toMatch(/^summary,equivalentCostPerSessionUsd,/m);
      await page.screenshot({
        path: `test-results/proj318-${bucket}-overview-${width}.png`,
        fullPage: true,
      });
    });
  }
}
