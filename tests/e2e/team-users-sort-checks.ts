import { expect, type Page } from "@playwright/test";
import {
  teamsResponseSchema,
  teamUsersSchema,
  type TeamUser,
} from "../../src/lib/api/teams";

/** 인증된 실제 BFF·API를 검증한다. 응답은 바꾸지 않고, 작은 페이지 시험에서만 요청 limit을 줄인다. */
export async function checkAverageDeviationSort(
  page: Page,
  options: {
    organizationId: string;
    start: string;
    end: string;
    pageSize?: number;
  },
) {
  const { organizationId, start, end, pageSize = 12 } = options;
  const base = `/api/bff/dashboard/api/v1/organizations/${organizationId}/analytics/teams`;
  if (pageSize !== 12) {
    await page.route(`**${base}/*/users?**`, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set("limit", String(pageSize));
      await route.continue({ url: url.toString() });
    });
  }
  const period = new URLSearchParams({
    startDate: start,
    endDate: end,
    compare: "none",
    timeZone: "Asia/Seoul",
  });
  const listing = page.waitForResponse(
    (response) => new URL(response.url()).pathname === base,
  );
  await page.goto(`/teams?${period}`);
  const listResponse = await listing;
  expect(listResponse.status()).toBe(200);
  const list = teamsResponseSchema.parse(await listResponse.json());
  const team = [...list.teams.items].sort(
    (a, b) =>
      (b.metrics.activeUsers.value ?? 0) - (a.metrics.activeUsers.value ?? 0),
  )[0];
  expect(team).toBeDefined();
  const usage = page.getByRole("region", {
    name: "사용자별 사용량",
    exact: true,
  });
  await usage.getByRole("button", { name: team.teamName, exact: true }).click();
  const path = `${base}/${team.teamId}/users`;
  const query = new URLSearchParams(period);
  query.set("snapshotId", list.meta.snapshotId);
  const request = async (params: URLSearchParams) => {
    const response = await page.request.get(`${path}?${params}`, {
      headers: { "X-Pulsemetry-Request": "1" },
    });
    expect(response.status()).toBe(200);
    const body = teamUsersSchema.parse(await response.json());
    expect(body.meta.snapshotId).toBe(list.meta.snapshotId);
    return body;
  };
  // 같은 snapshot의 기본 비용 순서로 전체 원본을 읽어 독립적으로 기대 순서를 계산한다.
  const all: TeamUser[] = [];
  const originalQuery = new URLSearchParams(query);
  originalQuery.set("limit", "100");
  let source = await request(originalQuery);
  const average = Number(source.summary.averageEquivalentCostUsd);
  expect(average).toBeGreaterThan(0);
  for (;;) {
    all.push(...source.users.items);
    if (!source.users.nextOffset) break;
    originalQuery.set("offset", String(source.users.nextOffset));
    source = await request(originalQuery);
  }
  expect(all.length).toBe(source.users.totalCount);
  expect(all.length).toBeGreaterThan(5);
  const accountCells = usage.locator("span.font-mono");
  await expect(accountCells).toHaveCount(Math.min(12, all.length));

  const responses: URL[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.pathname === path &&
      url.searchParams.get("sort") === "averageDeviation"
    ) {
      expect(response.status()).toBe(200);
      responses.push(url);
    }
  });
  const header = () =>
    usage.getByRole("button", { name: "평균 대비 정렬", exact: true });
  const expectedOrder = (order: "asc" | "desc") =>
    [...all].sort((a, b) => {
      const av = a.usage.equivalentCostUsd.value;
      const bv = b.usage.equivalentCostUsd.value;
      const difference =
        av === null && bv !== null
          ? 1
          : bv === null && av !== null
            ? -1
            : (Number(av) - Number(bv)) * (order === "asc" ? 1 : -1);
      return (
        difference ||
        (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0)
      );
    });
  let descendingOffset: number | null = null;
  for (const order of ["desc", "asc"] as const) {
    const expected = expectedOrder(order);
    await header().click();
    await expect(header()).toHaveAccessibleDescription(
      order === "desc" ? /^내림차순 정렬 중/ : /^오름차순 정렬 중/,
    );
    await expect(accountCells).toHaveText(
      expected.slice(0, 12).map((user) => user.account),
    );
    const sent = responses.filter(
      (url) => url.searchParams.get("order") === order,
    );
    expect(sent).toHaveLength(Math.ceil(Math.min(12, all.length) / pageSize));
    expect(sent[0].searchParams.get("offset")).toBe("0");
    for (const url of sent.slice(1)) {
      expect(Number(url.searchParams.get("offset"))).toBeGreaterThan(0);
      expect(url.searchParams.get("snapshotId")).toBe(list.meta.snapshotId);
    }
    // 5명씩 실제 API offset를 끝까지 이어도 전체 정렬·평균·고유성이 유지된다.
    const sortedQuery = new URLSearchParams(query);
    sortedQuery.set("sort", "averageDeviation");
    sortedQuery.set("order", order);
    sortedQuery.set("limit", "5");
    const ids: string[] = [];
    for (;;) {
      const body = await request(sortedQuery);
      expect(Number(body.summary.averageEquivalentCostUsd)).toBe(average);
      ids.push(...body.users.items.map((user) => user.memberId));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeLessThanOrEqual(all.length);
      if (!body.users.nextOffset) break;
      if (order === "desc" && !descendingOffset)
        descendingOffset = body.users.nextOffset;
      sortedQuery.set("offset", String(body.users.nextOffset));
    }
    expect(ids).toEqual(expected.map((user) => user.memberId));
    for (const user of expected.slice(0, 12)) {
      const value = user.usage.equivalentCostUsd.value;
      const ratio = value === null ? null : Number(value) / average - 1;
      const text =
        ratio === null
          ? "-"
          : Math.abs(ratio) < 0.005
            ? ""
            : `${ratio > 0 ? "+" : "−"}${Math.abs(ratio * 100).toFixed(0)}%`;
      const row = accountCells.filter({ hasText: user.account }).locator("..");
      await expect(row.locator(":scope > span").nth(4)).toHaveText(text);
    }
  }
  expect(descendingOffset).toBeTruthy();
  const invalidQuery = new URLSearchParams(query);
  invalidQuery.set("sort", "averageDeviation");
  invalidQuery.set("order", "asc");
  invalidQuery.set("cursor", "legacy");
  const invalid = await page.request.get(`${path}?${invalidQuery}`, {
    headers: { "X-Pulsemetry-Request": "1" },
  });
  expect(invalid.status()).toBe(400);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(header()).toBeVisible();
  return {
    team: team.teamName,
    users: all.length,
    pageSize,
    uiRequests: responses.length,
  };
}
