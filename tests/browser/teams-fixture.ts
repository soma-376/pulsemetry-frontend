import { test, type Page, type Route } from "@playwright/test";
import example from "../../docs/api/teams-response.example.json";

/**
 * 팀 분석 화면 UI 테스트용 응답 — 요청서 예시(docs/api/teams-response.example.json)를 요청의 조직·기간·비교에 맞춘다.
 * 실제 서버 검증은 tests/e2e/teams.spec.ts가 한다.
 */
export type TeamsFixture = ReturnType<typeof teamsFixture>;
const DAY = 86_400_000;
const pad = (value: number) => String(value).padStart(2, "0");

export function teamsFixture(url: URL) {
  const data = structuredClone(example);
  const startDate = url.searchParams.get("startDate")!,
    endDate = url.searchParams.get("endDate")!,
    compare = url.searchParams.get("compare") ?? "prev_week";
  const dayCount = (Date.parse(endDate) - Date.parse(startDate)) / DAY + 1;
  Object.assign(data.meta, {
    organizationId: url.pathname.split("/organizations/")[1].split("/")[0],
    startDate,
    endDate,
    dayCount,
    snapshotId: "fixture-teams-snapshot",
  });
  for (const team of [...data.teams.items, data.unassigned]) {
    // 예시의 7일을 반복하되 누적 세션은 기간 끝에서 팀 세션 수가 되게 비례로 늘린다(0으로 채우지 않는다).
    team.trend = Array.from({ length: dayCount }, (_, index) => ({
      ...team.trend[index % team.trend.length],
      date: new Date(Date.parse(startDate) + index * DAY)
        .toISOString()
        .slice(0, 10),
      cumulativeSessionCount: Math.round(
        (team.current.sessionCount * (index + 1)) / dayCount,
      ),
    }));
  }
  data.comparison.mode = compare;
  if (compare === "none") {
    Object.assign(data.comparison, {
      status: "disabled",
      reason: null,
      startDate: null,
      endDate: null,
      coverage: null,
    });
    Object.assign(data.totals, { previous: null });
    for (const team of [...data.teams.items, data.unassigned])
      Object.assign(team, { previous: null });
  }
  return data;
}

type User = {
  memberId: string;
  account: string;
  usage: {
    activeUsers: number;
    sessionCount: number;
    tokens: {
      inputUncached: null;
      output: null;
      cacheRead: null;
      cacheWrite: null;
      total: number;
    };
    equivalentCostUsd: string;
  };
  mainModel: { modelId: string; displayName: string };
  cache: { readTokens: number; eligibleInputTokens: number; hitRatio: number };
  lastUsedAt: string;
};
/** 한 팀의 사용자. 서버처럼 비용 내림차순(동률 구성원 ID)이다. 비용·세션·토큰·캐시·마지막 사용의 순서가 서로 다르다. */
export function fixtureTeamUsers(prefix: string, count: number): User[] {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return {
      memberId: `${prefix}-${pad(n)}`,
      account: `${prefix}${pad(n)}@codeworks.io`,
      usage: {
        activeUsers: 1,
        sessionCount: ((n * 7) % 23) + 1,
        tokens: {
          inputUncached: null,
          output: null,
          cacheRead: null,
          cacheWrite: null,
          total: (((n * 13) % 29) + 1) * 10_000,
        },
        equivalentCostUsd: (((n * 11) % 31) + n / 100).toFixed(6),
      },
      mainModel: { modelId: "vendor-a/model-pro", displayName: "Model Pro" },
      cache: {
        readTokens: n,
        eligibleInputTokens: 100,
        hitRatio: ((n * 17) % 100) / 100,
      },
      lastUsedAt: `2026-09-${pad(((n * 5) % 13) + 1)}T0${n % 10}:00:00Z`,
    };
  }).sort(
    (a, b) =>
      Number(b.usage.equivalentCostUsd) - Number(a.usage.equivalentCostUsd) ||
      a.memberId.localeCompare(b.memberId),
  );
}

export async function mockTeams(
  page: Page,
  options: {
    users?: Record<string, User[]>;
    modify?: (data: TeamsFixture) => void;
  } = {},
) {
  const users = options.users ?? {
    team_platform: fixtureTeamUsers("platform", 30),
    team_payments: fixtureTeamUsers("payments", 5),
    unassigned: fixtureTeamUsers("unassigned", 2),
  };
  const cors = {
    "access-control-allow-origin": new URL(test.info().project.use.baseURL!)
      .origin,
    "access-control-allow-headers": "content-type,authorization",
    "access-control-allow-methods": "GET,OPTIONS",
  };
  const json = (route: Route, value: unknown, status = 200) =>
    route.fulfill({ status, headers: cors, json: value });
  // 팀 디렉터리(`/teams`)는 온보딩 fixture가 맡는다. 여기서는 분석 조회만 가로챈다.
  await page.route(
    (url) =>
      /\/api\/v1\/organizations\/[^/]+\/analytics\/teams(\/|$)/.test(
        url.pathname,
      ),
    (route) => {
      const request = route.request();
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers: cors });
      const url = new URL(request.url());
      const path = url.pathname.split("/organizations/")[1].split("/").slice(1);
      const data = teamsFixture(url);
      options.modify?.(data);
      const [, , teamId, tail] = path;
      if (!teamId) return json(route, data);
      const team =
        teamId === "unassigned"
          ? data.unassigned
          : data.teams.items.find((item) => item.teamId === teamId);
      if (!team)
        return json(
          route,
          { error: { code: "not_found", message: "fixture" } },
          404,
        );
      if (tail !== "users")
        return json(route, {
          meta: data.meta,
          comparison: data.comparison,
          team,
        });
      const all = users[teamId] ?? [];
      const offset = Number(url.searchParams.get("cursor") ?? 0),
        limit = Number(url.searchParams.get("limit") ?? 12);
      const total = all.reduce(
        (sum, user) => sum + Number(user.usage.equivalentCostUsd),
        0,
      );
      return json(route, {
        meta: data.meta,
        team: { teamId: team.teamId, teamName: team.teamName },
        summary: {
          usage: team.current,
          averageEquivalentCostUsd: all.length
            ? (total / all.length).toFixed(6)
            : null,
          cacheReadTokens: null,
          cacheEligibleInputTokens: null,
          cacheHitRatio: 0.3125,
          unidentifiedEquivalentCostUsd: "0.000000",
        },
        users: {
          items: all.slice(offset, offset + limit),
          totalCount: all.length,
          nextCursor:
            offset + limit < all.length ? String(offset + limit) : null,
        },
      });
    },
  );
}
