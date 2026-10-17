import { delay, http, HttpResponse } from "msw";
import { overviewSchema } from "@/lib/api/overview";
import { teamsResponseSchema, teamUsersSchema } from "@/lib/api/teams";
import { membersDashboardSchema } from "@/lib/api/members";
import { COMPANY_A } from "@/mocks/company-a";
import overviewExample from "../../docs/api/overview-response.example.json";
import teamsExample from "../../docs/api/teams-response.example.json";
import usersExample from "../../docs/api/team-users-response.example.json";
import membersExample from "../../docs/api/members-response.example.json";
import { settingsHandlers } from "./settings";
import { notificationHandlers } from "./alerts";

export type DashboardPage =
  "overview" | "teams" | "members" | "ops" | "settings";
export type PageState =
  | "normal"
  | "loading"
  | "error"
  | "partial_retry"
  | "no_data"
  | "pending"
  | "collection_gap";
export const DASHBOARD_TODAY = "2026-09-13";
export const STORY_ORG = COMPANY_A.organization.organizationId;
const api = `*/api/v1/organizations/${STORY_ORG}`;
const DAY = 86_400_000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

function period(url: URL) {
  const startDate = url.searchParams.get("startDate") ?? "2026-09-07";
  const endDate = url.searchParams.get("endDate") ?? DASHBOARD_TODAY;
  const dayCount = (Date.parse(endDate) - Date.parse(startDate)) / DAY + 1;
  return {
    organizationId: STORY_ORG,
    startDate,
    endDate,
    dayCount,
    currentCoverage: { status: "complete" as const, observedDays: dayCount },
  };
}
function comparison(url: URL) {
  const { startDate, endDate, dayCount } = period(url);
  const mode = url.searchParams.get("compare") ?? "prev_week";
  const offset = (mode === "prev_week" ? 7 : dayCount) * DAY;
  return mode === "none"
    ? {
        mode,
        status: "disabled",
        reason: null,
        startDate: null,
        endDate: null,
        coverage: null,
      }
    : {
        mode,
        status: "available",
        reason: null,
        startDate: iso(Date.parse(startDate) - offset),
        endDate: iso(Date.parse(endDate) - offset),
        coverage: { status: "complete", observedDays: dayCount },
      };
}
function daily<T extends { date: string }>(points: T[], url: URL): T[] {
  const { dayCount, startDate } = period(url);
  return Array.from({ length: dayCount }, (_, i) => ({
    ...points[i % points.length],
    date: iso(Date.parse(startDate) + i * DAY),
  }));
}
function teams(url: URL) {
  const data = teamsResponseSchema.parse(teamsExample);
  Object.assign(data.meta, period(url));
  Object.assign(data.comparison, comparison(url));
  data.teams.totalCount = data.teams.items.length;
  data.teams.nextOffset = null;
  for (const team of [...data.teams.items, data.unassigned]) {
    team.trend = daily(team.trend, url).map((point, i, points) => ({
      ...point,
      cumulativeSessionCount: Math.round(
        ((team.metrics.sessionCount.value ?? 0) * (i + 1)) / points.length,
      ),
    }));
    if (data.comparison.mode === "none")
      for (const metric of Object.values(team.metrics)) {
        if ("comparison" in metric)
          metric.comparison = {
            status: "disabled",
            reasons: [],
            previousValue: null,
            absoluteChange: null,
            percentChange: null,
            change: null,
          };
      }
  }
  if (data.comparison.mode === "none")
    for (const metric of Object.values(data.totals)) {
      if ("comparison" in metric)
        metric.comparison = {
          status: "disabled",
          reasons: [],
          previousValue: null,
          absoluteChange: null,
          percentChange: null,
          change: null,
        };
    }
  return data;
}

/** 실제 API 클라이언트를 통과하는 응답. 상태는 주 조회에만 적용하고 공통 헤더는 정상으로 둔다. */
export function dashboardHandlers(
  page: DashboardPage,
  response: { state: PageState },
) {
  const paths: Record<DashboardPage, string> = {
    overview: "/analytics/overview",
    teams: "/analytics/teams",
    members: "/members/dashboard",
    ops: "/alerts",
    settings: "/settings",
  };
  let recovering = false;
  return [
    http.get(`${api}${paths[page]}`, async ({ request }) => {
      if (
        page === "ops" &&
        new URL(request.url).searchParams.get("category") !== "security"
      )
        return;
      if (response.state === "loading") await delay("infinite");
      if (response.state === "error")
        return HttpResponse.json(
          {
            error: {
              code: "unavailable",
              message: "storybook service unavailable",
            },
          },
          { status: 503 },
        );
      // undefined이면 뒤의 정상 응답 핸들러가 처리한다.
    }),
    http.get(`${api}/analytics/overview`, async ({ request }) => {
      const url = new URL(request.url),
        data = overviewSchema.parse(overviewExample);
      Object.assign(data.meta, period(url));
      Object.assign(data.comparison, comparison(url));
      if (data.trend) data.trend.points = daily(data.trend.points, url);
      if (data.comparison.mode === "none") {
        const disabled = {
          status: "disabled" as const,
          reasons: [],
          previousValue: null,
          absoluteChange: null,
          percentChange: null,
          change: null,
        };
        if (data.summary)
          for (const v of Object.values(data.summary))
            if ("comparison" in v) v.comparison = disabled;
        data.teamUsage?.topTeams.forEach((t) => {
          t.equivalentCostUsd.comparison = disabled;
        });
        if (data.teamUsage?.unassigned)
          data.teamUsage.unassigned.equivalentCostUsd.comparison = disabled;
      }
      if (response.state === "partial_retry") {
        data.trend = null;
        data.errors = [
          { section: "trend", code: "source_unavailable", retryable: true },
        ];
        response.state = "normal";
        recovering = true;
      } else if (recovering) {
        await delay(1500);
        recovering = false;
      }
      if (response.state === "pending" || response.state === "collection_gap") {
        const reasons = [
          "current_period_incomplete",
          response.state === "pending" ? "period_pending" : "collection_gap",
        ];
        const change = {
          status: "unavailable" as const,
          reasons,
          previousValue: null,
          absoluteChange: null,
          percentChange: null,
          change: null,
        };
        data.meta.dataState = "partial";
        data.meta.currentCoverage.status = "partial";
        if (data.summary)
          for (const metric of Object.values(data.summary)) {
            metric.status = "partial";
            metric.reasons = reasons;
            if ("comparison" in metric) metric.comparison = change;
          }
        data.trend?.points.forEach((p) => {
          p.observation = "partial";
          p.equivalentCostUsd.status = "partial";
          p.equivalentCostUsd.reasons = reasons;
          p.totalTokens.status = "partial";
          p.totalTokens.reasons = reasons;
        });
        data.modelMix?.models.forEach((m) =>
          [
            m.equivalentCostUsd,
            m.totalTokens,
            m.costShare,
            m.effectiveCostPerMillionTokensUsd,
          ].forEach((v) => {
            v.status = "partial";
            v.reasons = reasons;
          }),
        );
        data.teamUsage?.topTeams.forEach((t) => {
          t.activeUsers.status = "partial";
          t.activeUsers.reasons = reasons;
          t.equivalentCostUsd.status = "partial";
          t.equivalentCostUsd.reasons = reasons;
          t.equivalentCostUsd.comparison = change;
        });
      }
      if (response.state === "no_data") {
        data.meta.dataState = "no_data";
        data.meta.currentCoverage = { status: "none", observedDays: 0 };
        data.summary = null;
        data.trend = null;
        data.modelMix = null;
        data.teamUsage = null;
        data.errors = [];
      }
      return HttpResponse.json(data);
    }),
    http.get(`${api}/analytics/teams`, ({ request }) =>
      HttpResponse.json(teams(new URL(request.url))),
    ),
    http.get(`${api}/analytics/teams/:teamId/users`, ({ request, params }) => {
      const url = new URL(request.url),
        source = teams(url),
        data = teamUsersSchema.parse(usersExample);
      const team =
        params.teamId === "unassigned"
          ? source.unassigned
          : source.teams.items.find((row) => row.teamId === params.teamId);
      if (!team)
        return HttpResponse.json(
          { error: { code: "not_found" } },
          { status: 404 },
        );
      data.meta = source.meta;
      data.team = { teamId: team.teamId, teamName: team.teamName };
      data.summary.usage = team.metrics;
      data.users.totalCount = data.users.items.length;
      data.users.nextOffset = null;
      return HttpResponse.json(data);
    }),
    http.get(`${api}/members/dashboard`, ({ request }) => {
      const data = membersDashboardSchema.parse(membersExample);
      Object.assign(data.meta, period(new URL(request.url)));
      return HttpResponse.json(data);
    }),
    http.get(`${api}/members`, ({ request }) => {
      const url = new URL(request.url),
        data = membersDashboardSchema.parse(membersExample);
      Object.assign(data.meta, period(url));
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const status = url.searchParams.get("status") ?? "all";
      const id = url.searchParams.get("memberId");
      const sort = url.searchParams.get("sort") ?? "account",
        direction = url.searchParams.get("order") === "desc" ? -1 : 1;
      const items = data.members.items.filter(
        (m) =>
          (!id || m.memberId === id) &&
          (status === "all" || m.activity === status) &&
          [m.account, m.displayName, m.team.teamName].some((text) =>
            text.toLowerCase().includes(q),
          ),
      );
      const key = (m: (typeof items)[number]) =>
        sort === "cost"
          ? m.periodUsage?.equivalentCostUsd.value == null
            ? null
            : Number(m.periodUsage.equivalentCostUsd.value)
          : sort === "activity"
            ? m.lastUsedAt
            : sort === "team"
              ? m.team.teamName
              : m.account;
      items.sort((a, b) => {
        const x = key(a),
          y = key(b);
        return (
          (x === null && y !== null
            ? 1
            : y === null && x !== null
              ? -1
              : x === null || y === null
                ? 0
                : (typeof x === "number" && typeof y === "number"
                    ? x - y
                    : String(x).localeCompare(String(y))) * direction) ||
          a.memberId.localeCompare(b.memberId)
        );
      });
      const offset = Number(url.searchParams.get("offset") ?? 0),
        limit = Number(url.searchParams.get("limit") ?? 20);
      return HttpResponse.json({
        meta: data.meta,
        members: {
          items: items.slice(offset, offset + limit),
          totalCount: items.length,
          nextOffset: offset + limit < items.length ? offset + limit : null,
        },
      });
    }),
    http.get(`${api}/invitations`, () =>
      HttpResponse.json({ items: [], nextCursor: null }),
    ),
    ...notificationHandlers("populated"),
    ...settingsHandlers("default"),
  ];
}
