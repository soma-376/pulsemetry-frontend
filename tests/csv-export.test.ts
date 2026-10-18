import assert from "node:assert/strict";
import { test } from "node:test";
import overviewExample from "../docs/api/overview-response.example.json";
import teamsExample from "../docs/api/teams-response.example.json";
import usersExample from "../docs/api/team-users-response.example.json";
import settingsExample from "../docs/api/settings-response.example.json";
import {
  alertsCsv,
  buildCsv,
  csvCell,
  overviewCsv,
  settingsCsv,
  teamsCsv,
} from "../src/lib/csv-export";
import type { Alert, AlertsPage } from "../src/lib/api/alerts";
import { overviewSchema } from "../src/lib/api/overview";
import type { Settings } from "../src/lib/api/settings";
import type { TeamsView, TeamUser } from "../src/lib/api/teams";

/** 절의 행을 열 이름으로 읽는다(테스트용 — 따옴표 없는 칸만). */
function section(csv: string, name: string) {
  const blocks = csv.split("\r\n\r\n");
  const block = blocks.find((part) =>
    part.split("\r\n").some((line) => line.startsWith(`${name},`)),
  );
  if (!block) return [];
  const [header, ...rows] = block.trim().split("\r\n");
  const columns = header.split(",");
  return rows
    .filter((row) => row.startsWith(`${name},`))
    .map((row) =>
      Object.fromEntries(
        row.split(",").map((value, index) => [columns[index], value]),
      ),
    );
}

test("칸: null 은 빈 칸, 수식처럼 보이는 문자열은 막고, 쉼표·따옴표는 감싼다 — 숫자는 그대로다", () => {
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell(-1.5), "-1.5");
  assert.equal(csvCell(0.123456789), "0.123456789");
  assert.equal(csvCell("0.000001"), "0.000001");
});

test("머리 블록 뒤에 절마다 section 열로 시작하는 머리 행이 오고 CRLF 로 끝난다", () => {
  const csv = buildCsv(
    [
      ["조직", "A"],
      ["기간", "2026-09-01 ~ 2026-09-28"],
    ],
    [
      {
        name: "s",
        columns: ["x", "reason"],
        rows: [
          [1, ""],
          [null, "unknown"],
        ],
      },
    ],
  );
  assert.equal(
    csv,
    "조직,A\r\n기간,2026-09-01 ~ 2026-09-28\r\n\r\nsection,x,reason\r\ns,1,\r\ns,,unknown\r\n",
  );
});

test("개요 CSV는 화면의 7개 지표·추이·모델 묶음·상위 팀만 내보낸다", () => {
  const data = overviewSchema.parse(overviewExample);
  const csv = overviewCsv(data, "예시 조직", "2026-10-02T00:00:00Z");
  assert.match(csv, /organization,예시 조직/);
  assert.equal(section(csv, "summary").length, 7);
  assert.equal(
    section(csv, "summary").find((r) => r.metric === "equivalentCostUsd")!
      .value,
    "5000.000000",
  );
  assert.equal(section(csv, "trend").length, data.meta.dayCount);
  assert.equal(section(csv, "trend")[0].equivalentCostUsd, "700.000000");
  assert.equal(section(csv, "modelMix").length, 5);
  assert.match(section(csv, "modelMix")[4].displayName, /기타/);
  assert.equal(
    section(csv, "teamUsage").length,
    data.teamUsage!.topTeams.length + 1,
  );
  for (const removed of [
    "productUsage",
    "other_teams",
    "allocatedSeatCostUsd",
    "seats",
    "waste",
  ])
    assert.ok(!csv.includes(removed));
});
test("개요 CSV는 null·0·부분 관측·조회 실패를 구분한다", () => {
  const data = overviewSchema.parse(overviewExample);
  data.trend!.points[0].equivalentCostUsd = {
    value: null,
    status: "unavailable",
    reasons: ["no_data"],
  };
  data.trend!.points[1].equivalentCostUsd = {
    value: "0",
    status: "complete",
    reasons: [],
  };
  data.modelMix = null;
  data.errors = [
    { section: "modelMix", code: "source_unavailable", retryable: true },
  ];
  const csv = overviewCsv(data, "예시 조직", "now");
  const rows = section(csv, "trend");
  assert.equal(rows[0].equivalentCostUsd, "");
  assert.equal(rows[0].equivalentCostUsdReasons, "no_data");
  assert.equal(rows[1].equivalentCostUsd, "0");
  assert.equal(rows[1].equivalentCostUsdStatus, "complete");
  assert.deepEqual(section(csv, "modelMix"), []);
  assert.equal(section(csv, "errors")[0].failedSection, "modelMix");
  data.meta.dataState = "no_data";
  data.summary = null;
  data.trend = null;
  data.teamUsage = null;
  data.errors = [];
  const empty = overviewCsv(data, "조직", "now");
  assert.deepEqual(section(empty, "summary"), []);
  assert.deepEqual(section(empty, "teamUsage"), []);
});

test("개요 CSV는 공식 null과 정확한 부분합·환산 행수·추이 기준을 보존한다", () => {
  const data = overviewSchema.parse(overviewExample);
  data.summary!.knownEquivalentCostUsd = {
    value: "0.000800",
    status: "partial",
    reasons: ["pricing_missing"],
  };
  data.summary!.pricedUsageRows = 3;
  data.summary!.unpricedUsageRows = 1;
  Object.assign(data.summary!.equivalentCostUsd, {
    value: null,
    status: "unavailable",
    reasons: ["pricing_missing"],
  });
  Object.assign(data.trend!.points[0], {
    equivalentCostUsd: {
      value: null,
      status: "unavailable",
      reasons: ["pricing_missing"],
    },
    knownEquivalentCostUsd: data.summary!.knownEquivalentCostUsd,
    pricedUsageRows: 3,
    unpricedUsageRows: 1,
  });
  const csv = overviewCsv(data, "조직", "now");
  assert.match(csv, /trendValueBasis,known_observed_subtotal/);
  assert.equal(
    section(csv, "summary").find((r) => r.metric === "equivalentCostUsd")!
      .value,
    "",
  );
  assert.equal(
    section(csv, "summary").find((r) => r.metric === "knownEquivalentCostUsd")!
      .value,
    "0.000800",
  );
  assert.equal(
    section(csv, "summary").find((r) => r.metric === "pricedUsageRows")!.value,
    "3",
  );
  assert.equal(section(csv, "trend")[0].knownEquivalentCostUsd, "0.000800");
  assert.equal(section(csv, "trend")[0].unpricedUsageRows, "1");
});

test("팀 CSV는 선택한 누적 모드와 부분합을 내보내고 세션에 부분합을 적용하지 않는다", () => {
  const source = structuredClone(teamsExample) as unknown as Omit<
    TeamsView,
    "teams"
  > & { teams: { items: TeamsView["teams"] } };
  const view: TeamsView = { ...source, teams: source.teams.items };
  const team = view.teams[0];
  Object.assign(team.trend[0], {
    observation: "unobserved",
    equivalentCostUsd: null,
    knownEquivalentCostUsd: null,
  });
  Object.assign(team.trend[1], {
    observation: "partial",
    equivalentCostUsd: null,
    knownEquivalentCostUsd: "4.000001",
    pricedUsageRows: 3,
    unpricedUsageRows: 1,
  });
  team.metrics.knownEquivalentCostUsd = {
    value: "4.000001",
    status: "partial",
    reasons: ["pricing_missing"],
  };
  team.metrics.pricedUsageRows = 3;
  team.metrics.unpricedUsageRows = 1;
  const csv = teamsCsv(view, "조직", "now", null, {
    axis: "cost",
    mode: "known",
  });
  assert.match(csv, /누적 집계 기준,확인된 값 누적/);
  assert.equal(section(csv, "teams")[0].knownEquivalentCostUsd, "4.000001");
  assert.equal(section(csv, "teams")[0].pricedUsageRows, "3");
  assert.equal(section(csv, "trend")[1].knownEquivalentCostUsd, "4.000001");
  assert.equal(section(csv, "chart_trend")[0].value, "");
  assert.equal(section(csv, "chart_trend")[1].value, "4.000001");
  assert.equal(
    section(teamsCsv(view, "조직", "now", null), "chart_trend")[1].value,
    "",
  );
  const sessions = teamsCsv(view, "조직", "now", null, {
    axis: "session",
    mode: "known",
  });
  assert.match(sessions, /누적 집계 기준,전체 누적/);
  assert.equal(section(sessions, "chart_trend")[1].mode, "strict");
});

test("팀: 목록 전 팀과 미배정, 고른 팀이 있으면 그 팀의 사용자 전부", () => {
  const view = {
    ...(teamsExample as unknown as TeamsView),
    teams: (teamsExample as unknown as { teams: { items: TeamsView["teams"] } })
      .teams.items,
  };
  const users = (usersExample as unknown as { users: { items: TeamUser[] } })
    .users.items;
  const csv = teamsCsv(view, "예시 조직", "2026-10-02T00:00:00.000Z", {
    teamId: view.teams[0].teamId!,
    teamName: view.teams[0].teamName,
    users,
  });
  const teams = section(csv, "teams");
  assert.equal(teams.length, view.teams.length + 1);
  assert.equal(teams[0].teamName, "플랫폼");
  assert.equal(teams[0].equivalentCostUsd, "2000.000000");
  assert.equal(teams.at(-1)!.teamId, "unassigned");
  assert.equal(
    teams[0].equivalentCostUsd_status,
    view.teams[0].metrics.equivalentCostUsd.status,
  );
  assert.equal("activeUsers_comparisonStatus" in teams[0], false);
  assert.equal("tokensPerSession_comparisonStatus" in teams[0], false);
  assert.equal(
    teams[0].equivalentCostUsd_comparisonStatus,
    view.teams[0].metrics.equivalentCostUsd.comparison.status,
  );
  assert.equal(section(csv, "trend")[0].status, view.teams[0].trend[0].status);
  assert.equal(
    section(csv, "models")[0].status,
    view.modelScatter.data!.models[0].status,
  );
  assert.equal(
    section(csv, "team_models").length,
    view.teams[0].modelMix.data!.models.length,
  );

  const rows = section(csv, "team_users");
  assert.equal(rows.length, users.length);
  assert.equal(rows[0].account, "platform1@example.org");
  assert.equal(rows[0].equivalentCostUsd, "50.000000");
  assert.equal(
    rows[0].equivalentCostUsd_status,
    users[0].usage.equivalentCostUsd.status,
  );
  assert.equal(
    rows[0].cacheHitRatio_reasons,
    users[0].cacheHitRatio.reasons.join("|"),
  );
  assert.equal(
    section(teamsCsv(view, "예시 조직", "t", null), "team_users").length,
    0,
  );
});

test("팀 CSV는 추이·모델·사용자별 사유를 보존하고 0과 확인 불가를 구분한다", () => {
  const source = structuredClone(teamsExample) as unknown as Omit<
    TeamsView,
    "teams"
  > & { teams: { items: TeamsView["teams"] } };
  const view: TeamsView = { ...source, teams: source.teams.items };
  const users = structuredClone(
    usersExample.users.items,
  ) as unknown as TeamUser[];
  Object.assign(view.teams[0].trend[0], {
    equivalentCostUsd: null,
    totalTokens: null,
    cumulativeSessionCount: null,
    status: "unavailable",
    reasons: ["collection_gap", "cumulative_period_incomplete"],
  });
  Object.assign(view.teams[0].trend[1], {
    equivalentCostUsd: "0.000000",
    totalTokens: 0,
    cumulativeSessionCount: 0,
    status: "complete",
    reasons: [],
  });
  Object.assign(view.modelScatter.data!.models[0], {
    totalTokens: null,
    status: "unavailable",
    reasons: ["token_data_incomplete"],
  });
  Object.assign(view.teams[0].modelMix.data!.models[0], {
    status: "partial",
    reasons: ["current_period_incomplete", "collection_gap"],
  });
  users[0].usage.totalTokens = {
    value: null,
    status: "unavailable",
    reasons: ["token_semantics_incompatible"],
  };
  users[0].cacheHitRatio = { value: 0, status: "complete", reasons: [] };
  const csv = teamsCsv(view, "조직", "now", {
    teamId: view.teams[0].teamId!,
    teamName: view.teams[0].teamName,
    users,
  });
  const trend = section(csv, "trend");
  assert.equal(trend[0].equivalentCostUsd, "");
  assert.equal(trend[0].status, "unavailable");
  assert.equal(trend[0].reasons, "collection_gap|cumulative_period_incomplete");
  assert.equal(trend[1].equivalentCostUsd, "0.000000");
  assert.equal(trend[1].cumulativeSessionCount, "0");
  assert.equal(trend[1].status, "complete");
  assert.equal(section(csv, "models")[0].reasons, "token_data_incomplete");
  assert.equal(section(csv, "models")[0].totalTokens, "");
  assert.equal(
    section(csv, "team_models")[0].reasons,
    "current_period_incomplete|collection_gap",
  );
  const user = section(csv, "team_users")[0];
  assert.equal(user.totalTokens, "");
  assert.equal(user.totalTokens_status, "unavailable");
  assert.equal(user.totalTokens_reasons, "token_semantics_incompatible");
  assert.equal(user.cacheHitRatio, "0");
  assert.equal(user.cacheHitRatio_status, "complete");
  const noSelection = teamsCsv(view, "조직", "now", null);
  assert.deepEqual(section(noSelection, "team_models"), []);
  assert.deepEqual(section(noSelection, "team_users"), []);
});

test("설정: 화면 카드·벤더 행 값과 상태만 내보내며 상세 계약 등급은 싣지 않는다", () => {
  const data = settingsExample as unknown as Settings;
  const csv = settingsCsv(data, "예시 조직", "2026-10-02T00:00:00.000Z");
  const vendors = section(csv, "vendors");
  assert.equal(vendors.length, data.vendors.items.length);
  assert.equal(
    vendors[0].monthlySeatFeeUsd,
    data.vendors.items[0].monthlySeatFeeUsd.value,
  );
  assert.equal(vendors[0].assignedSeats, "");
  assert.equal(vendors[0].assignedSeatsReasons, "seat_source_not_recorded");
  const summary = section(csv, "summary");
  assert.equal(summary.length, 6);
  assert.equal(
    summary.find((row) => row.metric === "activeSeats7d")!.status,
    "unavailable",
  );
  assert.equal(section(csv, "contract_tiers").length, 0);
  assert.equal("meteredActualBilledUsd" in vendors[0], false);
});

test("운영 · 보안: 같은 범주의 알림과 화면 요약만 내보내고 숨겨진 규칙 기록은 제외한다", () => {
  const alert = (id: string, patch: Partial<Alert>): Alert => ({
    alertId: id,
    version: 1,
    ruleId: "model_not_allowed",
    category: "security",
    status: "open",
    occurredAt: "2026-10-01T01:00:00Z",
    lastSeenAt: "2026-10-01T02:00:00Z",
    windowStart: "2026-10-01T00:00:00Z",
    windowEnd: "2026-10-01T03:00:00Z",
    subject: "claude-opus-4",
    eventCount: 3,
    memberCount: 2,
    members: [
      { memberId: "m-1", account: "a@example.test" },
      { memberId: "m-2", account: null },
    ],
    evidence: { kind: "usage", targetName: "claude-opus-4" },
    acknowledgement: null,
    ...patch,
  });
  const items = [
    alert("al-1", {}),
    alert("al-2", {
      ruleId: "tool_unapproved",
      subject: null,
      acknowledgement: {
        acknowledgedAt: "2026-10-01T05:00:00Z",
      },
    }),
  ];
  const first: AlertsPage = {
    meta: {
      organizationId: "org",
      snapshotId: "snap-1",
      asOf: "2026-10-01T06:00:00Z",
    },
    evaluation: {
      status: "partial",
      reasons: ["evaluation_pending"],
      asOf: "2026-10-01T06:00:00Z",
    },
    alerts: { items: items.slice(0, 1), totalCount: 2, nextCursor: "c-2" },
  };
  const csv = alertsCsv(
    first,
    items,
    "예시 조직",
    "all",
    "security",
    "2026-10-02T00:00:00.000Z",
  );
  assert.match(
    csv,
    /^화면,운영 · 보안\r\n조직,예시 조직\r\n범주,security\r\n상태,all\r\n/,
  );
  assert.match(csv, /\r\nsnapshot,snap-1\r\n알림 수,2\r\n/);
  assert.equal(csv.includes("section,ruleId,enabled"), false);
  assert.match(csv, /평가 상태,partial/);
  assert.match(csv, /평가 사유,evaluation_pending/);
  const rows = section(csv, "alerts");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].summary, "모델 claude-opus-4 · 3건 · 구성원 2명");
  assert.deepEqual(
    [rows[0].members, rows[0].acknowledgedAt, rows[0].reason],
    ["a@example.test m-2", "", ""],
  );
  assert.deepEqual(
    [rows[1].subject, rows[1].acknowledgedAt, rows[1].reason],
    ["", "2026-10-01T05:00:00Z", "unknown"],
  );
});

test("개요 CSV는 집계 대기와 수집 공백의 상세 사유를 그대로 보존한다", () => {
  const data = overviewSchema.parse(overviewExample);
  data.summary!.sessionCount.status = "partial";
  data.summary!.sessionCount.reasons = [
    "current_period_incomplete",
    "period_pending",
    "collection_gap",
  ];
  const csv = overviewCsv(data, "회사", "2026-10-12T00:00:00Z");
  assert.match(
    csv,
    /current_period_incomplete\|period_pending\|collection_gap/,
  );
});
