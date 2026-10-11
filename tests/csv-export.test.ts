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
import type { Overview } from "../src/lib/api/overview";
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

test("개요: 금액은 서버 문자열 그대로, 일별 추이는 응답의 날 수만큼, 모델·팀·제품 절이 있다", () => {
  const data = overviewExample as unknown as Overview;
  const csv = overviewCsv(data, "예시 조직", "2026-10-02T00:00:00.000Z");
  assert.match(
    csv,
    /^화면,개요\r\n조직,예시 조직\r\n기간,2026-09-07 ~ 2026-09-13 \(Asia\/Seoul\)/,
  );
  const summary = section(csv, "summary");
  assert.equal(
    summary.find((row) => row.metric === "equivalentCostUsd")!.current,
    "5000.000000",
  );
  const trend = section(csv, "trend");
  assert.equal(trend.length, data.trend.points.length);
  assert.deepEqual(trend[0], {
    section: "trend",
    date: "2026-09-07",
    observation: "complete",
    equivalentCostUsd: "700.000000",
    allocatedSeatCostUsd: "160.000000",
    totalTokens: "14000000",
    reason: "",
  });
  assert.equal(
    section(csv, "model_mix")[0].effectiveCostPerMillionTokensUsd,
    "50.000000",
  );
  const teams = section(csv, "team_usage");
  assert.equal(teams.length, data.teamUsage.topTeams.length + 1 + 1);
  assert.equal(
    teams.find((row) => row.teamId === "other_teams")!.equivalentCostUsd,
    "500.000000",
  );
  assert.equal(
    section(csv, "product_usage")[0].equivalentCostUsd,
    "3700.000000",
  );
});

test("개요: 값이 없으면 0 이 아니라 빈 칸이고 이유가 붙는다 — 절이 가용하지 않으면 서버 사유", () => {
  const data = structuredClone(overviewExample) as unknown as Overview;
  data.trend.points[0] = {
    ...data.trend.points[0],
    observation: "unobserved",
    equivalentCostUsd: null,
    totalTokens: null,
  };
  data.modelMix = {
    availability: "unavailable",
    reason: "cost_not_available",
    models: [],
  };
  data.usage.current = null;
  const csv = overviewCsv(data, "예시 조직", "2026-10-02T00:00:00.000Z");
  assert.deepEqual(section(csv, "trend")[0], {
    section: "trend",
    date: "2026-09-07",
    observation: "unobserved",
    equivalentCostUsd: "",
    allocatedSeatCostUsd: "160.000000",
    totalTokens: "",
    reason: "unobserved",
  });
  assert.deepEqual(section(csv, "model_mix"), [
    {
      section: "model_mix",
      modelId: "",
      displayName: "",
      equivalentCostUsd: "",
      totalTokens: "",
      effectiveCostPerMillionTokensUsd: "",
      availability: "unavailable",
      reason: "cost_not_available",
    },
  ]);
  assert.deepEqual(section(csv, "summary")[0], {
    section: "summary",
    metric: "activeUsers",
    current: "",
    previous: section(csv, "summary")[0].previous,
    reason: data.meta.dataState,
  });
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
    teamId: "team-platform",
    teamName: "플랫폼",
    users,
  });
  const teams = section(csv, "teams");
  assert.equal(teams.length, view.teams.length + 1);
  assert.equal(teams[0].teamName, "플랫폼");
  assert.equal(teams[0].equivalentCostUsd, "2000.000000");
  assert.equal(teams.at(-1)!.teamId, "unassigned");
  const rows = section(csv, "team_users");
  assert.equal(rows.length, users.length);
  assert.equal(rows[0].account, "platform1@example.org");
  assert.equal(rows[0].equivalentCostUsd, "50.000000");
  assert.equal(
    section(teamsCsv(view, "예시 조직", "t", null), "team_users").length,
    0,
  );
});

test("설정: 등록 제품마다 계약·좌석·종량 지출 원천과 사유, 등급은 따로 — 청구가 없으면 금액을 만들지 않는다", () => {
  const data = settingsExample as unknown as Settings;
  const csv = settingsCsv(data, "예시 조직", "2026-10-02T00:00:00.000Z");
  const vendors = section(csv, "vendors");
  assert.equal(vendors.length, data.vendors.items.length);
  assert.equal(vendors[0].meteredActualBilledUsd, "");
  assert.equal(vendors[0].meteredReason, "not_applicable");
  assert.equal(
    section(csv, "contract_tiers").length,
    data.vendors.items.flatMap((vendor) => vendor.contract?.tiers ?? []).length,
  );
});

test("운영 · 보안: 그 범주의 규칙만, 알림은 받은 전부 — 값이 없으면 빈 칸과 이유, 확인 시각은 확인 기록이 있을 때만", () => {
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
    summary: {},
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
        acknowledgedBy: "u-1",
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
      availability: "available",
      reason: null,
      asOf: "2026-10-01T06:00:00Z",
      rules: [
        {
          ruleId: "model_not_allowed",
          enabled: true,
          evaluatedAt: "2026-10-01T06:00:00Z",
          status: "evaluated",
          reason: null,
          windowStart: null,
          windowEnd: null,
        },
        {
          ruleId: "tool_unapproved",
          enabled: true,
          evaluatedAt: null,
          status: null,
          reason: null,
          windowStart: null,
          windowEnd: null,
        },
        {
          ruleId: "spend_spike",
          enabled: true,
          evaluatedAt: "2026-10-01T06:00:00Z",
          status: "evaluated",
          reason: null,
          windowStart: null,
          windowEnd: null,
        },
      ],
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
  assert.deepEqual(
    section(csv, "rules").map((row) => [row.ruleId, row.reason]),
    [
      ["model_not_allowed", ""],
      ["tool_unapproved", "not_evaluated_yet"],
    ],
  );
  const rows = section(csv, "alerts");
  assert.equal(rows.length, 2);
  assert.deepEqual(
    [rows[0].members, rows[0].acknowledgedAt, rows[0].reason],
    ["a@example.test m-2", "", ""],
  );
  assert.deepEqual(
    [rows[1].subject, rows[1].acknowledgedAt, rows[1].reason],
    ["", "2026-10-01T05:00:00Z", "unknown"],
  );
});
