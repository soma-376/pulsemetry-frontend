import {
  alertSummary,
  type Alert,
  type AlertCategory,
  type AlertsPage,
  type AlertStatus,
} from "./api/alerts";
import { groupModels } from "./api/overview-format";
import { presentOverview } from "./metrics/overview-presentation";
import type { Overview, OverviewValue, OverviewMetric } from "./api/overview";
import type { Settings } from "./api/settings";
import type { TeamAnalytics, TeamsView, TeamUser } from "./api/teams";

/**
 * 공통 헤더의 CSV 내보내기(화면별 — 개요·팀·설정). 서버 CSV API 없이 **화면이 쓰는 응답**(같은 기간·비교·snapshot)에서만 만든다.
 * - 첫 머리 블록에 조직·기간·비교·snapshot·응답 시각·내보낸 시각을 둔다. 그 뒤 절마다 `section` 열로 시작하는 머리 행과 행들이 온다.
 * - null 은 빈 칸이고, 같은 행의 `reason` 열이 이유를 말한다 — 서버의 사유가 있으면 그것, 절은 가용한데 값만 없으면 `unknown`(모름 — 0 이 아니다).
 * - 금액은 서버의 USD 문자열 그대로, 비율·수치는 반올림하지 않는다.
 */
export type CsvValue = string | number | bigint | boolean | null | undefined;
export type CsvSection = {
  name: string;
  columns: string[];
  rows: CsvValue[][];
};
export type CsvMeta = [label: string, value: CsvValue][];

export function csvCell(value: CsvValue) {
  if (value === null || value === undefined) return "";
  // 스프레드시트가 수식으로 실행하지 않게 한다(숫자는 그대로).
  const text =
    typeof value === "string" && /^[=+\-@\t\r]/.test(value)
      ? `'${value}`
      : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const line = (values: CsvValue[]) => values.map(csvCell).join(",");

/** 머리 블록과 절들을 CRLF 로 잇는다. BOM 은 내려받을 때 붙인다([downloadCsv]). */
export function buildCsv(meta: CsvMeta, sections: CsvSection[]) {
  const lines = meta.map(([label, value]) => line([label, value]));
  for (const section of sections) {
    lines.push("", line(["section", ...section.columns]));
    for (const row of section.rows) lines.push(line([section.name, ...row]));
  }
  return lines.join("\r\n") + "\r\n";
}

/** 값이 하나라도 null 이면 이유. 절의 서버 사유가 먼저다. */
export function reasonOf(values: CsvValue[], serverReason?: string | null) {
  if (serverReason) return serverReason;
  return values.some((value) => value === null || value === undefined)
    ? "unknown"
    : "";
}
const COMPARE_LABEL: Record<string, string> = {
  none: "비교 없음",
  prev_week: "직전 주",
  prev_period: "직전 기간",
};
const compareText = (comparison: {
  mode: string;
  status: string;
  reason: string | null;
}) =>
  `${COMPARE_LABEL[comparison.mode] ?? comparison.mode} · ${comparison.status}${comparison.reason ? ` (${comparison.reason})` : ""}`;

export function overviewCsv(
  data: Overview,
  organization: string,
  exportedAt: string,
) {
  const values = (v: OverviewValue<string | number>): CsvValue[] => [
    v.value,
    v.status,
    v.reasons.join("|"),
  ];
  const change = (v: OverviewMetric<string | number>): CsvValue[] => [
    v.comparison.status,
    v.comparison.reasons.join("|"),
    v.comparison.previousValue,
    v.comparison.absoluteChange,
    v.comparison.percentChange,
    v.comparison.change,
  ];
  const valueColumns = (name: string) => [
    name,
    `${name}Status`,
    `${name}Reasons`,
  ];
  const changeColumns = [
    "comparisonStatus",
    "comparisonReasons",
    "previousValue",
    "absoluteChange",
    "percentChange",
    "change",
  ];
  const sections: CsvSection[] = [];
  if (data.summary)
    sections.push({
      name: "summary",
      columns: ["metric", ...valueColumns("value"), ...changeColumns],
      rows: Object.entries(data.summary).map(([key, v]) => [
        key,
        ...values(v),
        ...("comparison" in v ? change(v) : Array(6).fill(null)),
      ]),
    });
  if (data.trend)
    sections.push({
      name: "trend",
      columns: [
        "date",
        "observation",
        ...valueColumns("equivalentCostUsd"),
        ...valueColumns("totalTokens"),
      ],
      rows: data.trend.points.map((p) => [
        p.date,
        p.observation,
        ...values(p.equivalentCostUsd),
        ...values(p.totalTokens),
      ]),
    });
  if (data.modelMix)
    sections.push({
      name: "modelMix",
      columns: [
        "model",
        "displayName",
        ...valueColumns("equivalentCostUsd"),
        ...valueColumns("totalTokens"),
        ...valueColumns("effectiveCostPerMillionTokensUsd"),
        ...valueColumns("costShare"),
      ],
      rows: groupModels(data.modelMix.models).map((m) => [
        m.modelId,
        m.displayName,
        ...values(m.equivalentCostUsd),
        ...values(m.totalTokens),
        ...values(m.effectiveCostPerMillionTokensUsd),
        ...values(m.costShare),
      ]),
    });
  if (data.teamUsage && presentOverview(data).attribution.show) {
    const teams = data.teamUsage;
    const row = (
      id: string,
      name: string,
      t: (typeof teams.topTeams)[number] | NonNullable<typeof teams.unassigned>,
    ) => [
      id,
      name,
      t.products
        .map((p) => p.displayName ?? p.kind ?? "미확인 제품")
        .join(" · "),
      ...values(t.activeUsers),
      ...values(t.equivalentCostUsd),
      ...change(t.equivalentCostUsd),
    ];
    sections.push({
      name: "teamUsage",
      columns: [
        "teamId",
        "teamName",
        "products",
        ...valueColumns("activeUsers"),
        ...valueColumns("equivalentCostUsd"),
        ...changeColumns,
      ],
      rows: [
        ...teams.topTeams.map((t) => row(t.teamId, t.teamName, t)),
        ...(teams.unassigned
          ? [row("unassigned", "미배정", teams.unassigned)]
          : []),
      ],
    });
  }
  if (data.errors.length)
    sections.push({
      name: "errors",
      columns: ["failedSection", "code", "retryable"],
      rows: data.errors.map((e) => [e.section, e.code, e.retryable]),
    });
  return buildCsv(
    [
      ["organization", organization],
      ["organizationId", data.meta.organizationId],
      ["period", `${data.meta.startDate} ~ ${data.meta.endDate}`],
      ["timeZone", data.meta.timeZone],
      ["comparison", COMPARE_LABEL[data.comparison.mode]],
      [
        "comparisonPeriod",
        data.comparison.startDate
          ? `${data.comparison.startDate} ~ ${data.comparison.endDate}`
          : null,
      ],
      ["currency", data.meta.currency],
      ["dataState", data.meta.dataState],
      ["generatedAt", data.meta.generatedAt],
      ["exportedAt", exportedAt],
    ],
    sections,
  );
}

const teamMetricNames = [
  "activeUsers",
  "equivalentCostUsd",
  "totalTokens",
  "sessionCount",
  "equivalentCostPerUserUsd",
  "equivalentCostPerSessionUsd",
  "tokensPerUser",
  "sessionsPerUser",
  "tokensPerSession",
  "effectiveCostPerMillionTokensUsd",
] as const;
export function teamsCsv(
  view: TeamsView,
  organization: string,
  exportedAt: string,
  selected: { teamId: string; teamName: string; users: TeamUser[] } | null,
) {
  const comparedMetrics = new Set<string>([
    "equivalentCostUsd",
    "totalTokens",
    "sessionCount",
    "equivalentCostPerUserUsd",
  ]);
  const comparisonColumns = (name: string) => [
    `${name}_comparisonStatus`,
    `${name}_comparisonReasons`,
    `${name}_previous`,
    `${name}_change`,
    `${name}_percentChange`,
  ];
  const valueColumns = (name: string) => [
    name,
    `${name}_status`,
    `${name}_reasons`,
  ];
  const valueCells = (value: OverviewValue<string | number>): CsvValue[] => [
    value.value,
    value.status,
    value.reasons.join("|"),
  ];
  const columns = teamMetricNames.flatMap((name) => [
    ...valueColumns(name),
    ...(comparedMetrics.has(name) ? comparisonColumns(name) : []),
  ]);
  const values = (metrics: TeamAnalytics["metrics"]): CsvValue[] =>
    teamMetricNames.flatMap((name) => {
      const m = metrics[name];
      if (!("comparison" in m)) return valueCells(m);
      const c = m.comparison;
      return [
        ...valueCells(m),
        c.status,
        c.reasons.join("|"),
        c.previousValue,
        c.absoluteChange,
        c.percentChange,
      ];
    });
  const teams = [...view.teams, view.unassigned];
  const sections: CsvSection[] = [
    { name: "totals", columns, rows: [values(view.totals)] },
    {
      name: "teams",
      columns: ["teamId", "teamName", ...columns],
      rows: teams.map((t) => [
        t.teamId ?? "unassigned",
        t.teamName,
        ...values(t.metrics),
      ]),
    },
    {
      name: "trend",
      columns: [
        "teamId",
        "teamName",
        "date",
        "observation",
        "equivalentCostUsd",
        "totalTokens",
        "cumulativeSessionCount",
        "status",
        "reasons",
      ],
      rows: teams.flatMap((t) =>
        t.trend.map((p) => [
          t.teamId ?? "unassigned",
          t.teamName,
          p.date,
          p.observation,
          p.equivalentCostUsd,
          p.totalTokens,
          p.cumulativeSessionCount,
          p.status,
          p.reasons.join("|"),
        ]),
      ),
    },
    {
      name: "products",
      columns: [
        "teamId",
        "teamName",
        "kind",
        "displayName",
        "equivalentCostUsd",
        "totalTokens",
        "sessionCount",
      ],
      rows: teams.flatMap((t) =>
        t.products.map((p) => [
          t.teamId ?? "unassigned",
          t.teamName,
          p.kind,
          p.displayName,
          p.equivalentCostUsd,
          p.totalTokens,
          p.sessionCount,
        ]),
      ),
    },
    {
      name: "models",
      columns: [
        "modelId",
        "displayName",
        "equivalentCostUsd",
        "totalTokens",
        "usingTeamCount",
        "status",
        "reasons",
      ],
      rows: (view.modelScatter.data?.models ?? []).map((m) => [
        m.modelId,
        m.displayName,
        m.equivalentCostUsd,
        m.totalTokens,
        m.usingTeamCount,
        m.status,
        m.reasons.join("|"),
      ]),
    },
  ];
  if (selected)
    sections.push({
      name: "team_users",
      columns: [
        "teamId",
        "teamName",
        "memberId",
        "account",
        ...valueColumns("sessionCount"),
        ...valueColumns("totalTokens"),
        ...valueColumns("equivalentCostUsd"),
        "lastUsedAt",
        "mainModel",
        ...valueColumns("cacheHitRatio"),
      ],
      rows: selected.users.map((u) => [
        selected.teamId,
        selected.teamName,
        u.memberId,
        u.account,
        ...valueCells(u.usage.sessionCount),
        ...valueCells(u.usage.totalTokens),
        ...valueCells(u.usage.equivalentCostUsd),
        u.lastUsedAt,
        u.mainModel?.displayName ?? null,
        ...valueCells(u.cacheHitRatio),
      ]),
    });
  const selectedTeam = selected
    ? teams.find((team) => (team.teamId ?? "unassigned") === selected.teamId)
    : undefined;
  if (selectedTeam)
    sections.push({
      name: "team_models",
      columns: [
        "teamId",
        "teamName",
        "modelId",
        "displayName",
        "equivalentCostUsd",
        "totalTokens",
        "status",
        "reasons",
      ],
      rows: (selectedTeam.modelMix.data?.models ?? []).map((model) => [
        selectedTeam.teamId ?? "unassigned",
        selectedTeam.teamName,
        model.modelId,
        model.displayName,
        model.equivalentCostUsd,
        model.totalTokens,
        model.status,
        model.reasons.join("|"),
      ]),
    });
  return buildCsv(
    [
      ["화면", "팀 분석"],
      ["조직", organization],
      [
        "기간",
        `${view.meta.startDate} ~ ${view.meta.endDate} (${view.meta.timeZone})`,
      ],
      ["비교", compareText(view.comparison)],
      ["데이터 상태", view.meta.dataState],
      ["데이터 확정 시각", view.meta.dataThrough],
      ["snapshot", view.meta.snapshotId],
      ["팀 수", view.teams.length],
      ["고른 팀", selected?.teamName ?? null],
      ["내보낸 시각", exportedAt],
    ],
    sections,
  );
}

export function settingsCsv(
  data: Settings,
  organization: string,
  exportedAt: string,
) {
  return buildCsv(
    [
      ["화면", "설정"],
      ["조직", organization],
      ["snapshot", data.meta.snapshotId],
      ["내보낸 시각", exportedAt],
    ],
    [
      {
        name: "summary",
        columns: ["metric", "value", "status", "reasons"],
        rows: Object.entries(data.summary).map(([name, metric]) => [
          name,
          metric.value,
          metric.status,
          metric.reasons.join(";"),
        ]),
      },
      {
        name: "vendors",
        columns: [
          "vendorId",
          "displayName",
          "kind",
          "contractStatus",
          "contractInput",
          "missingFields",
          "contractSeats",
          "contractSeatsStatus",
          "contractSeatsReasons",
          "monthlySeatFeeUsd",
          "monthlySeatFeeStatus",
          "monthlySeatFeeReasons",
          "assignedSeats",
          "assignedSeatsStatus",
          "assignedSeatsReasons",
        ],
        rows: data.vendors.items.map((vendor) => [
          vendor.vendorId,
          vendor.displayName,
          vendor.kind,
          vendor.contractStatus,
          vendor.contractInput.status,
          vendor.contractInput.missingFields.join(";"),
          vendor.contractSeats.value,
          vendor.contractSeats.status,
          vendor.contractSeats.reasons.join(";"),
          vendor.monthlySeatFeeUsd.value,
          vendor.monthlySeatFeeUsd.status,
          vendor.monthlySeatFeeUsd.reasons.join(";"),
          vendor.assignedSeats.value,
          vendor.assignedSeats.status,
          vendor.assignedSeats.reasons.join(";"),
        ]),
      },
    ],
  );
}

/** UTF-8 BOM 을 붙여 내려받는다(스프레드시트가 한국어를 깨지 않게). */
export function downloadCsv(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** 운영 · 보안의 같은 필터·snapshot 알림과 화면에 표시하는 근거만 내보낸다. */
export function alertsCsv(
  first: AlertsPage,
  items: Alert[],
  organization: string,
  status: AlertStatus,
  category: AlertCategory,
  exportedAt: string,
) {
  return buildCsv(
    [
      ["화면", "운영 · 보안"],
      ["조직", organization],
      ["범주", category],
      ["상태", status],
      ["평가 상태", first.evaluation.status],
      ["평가 사유", first.evaluation.reasons.join(" ")],
      ["평가 시각", first.evaluation.asOf],
      ["snapshot", first.meta.snapshotId],
      ["알림 수", items.length],
      ["내보낸 시각", exportedAt],
    ],
    [
      {
        name: "alerts",
        columns: [
          "alertId",
          "ruleId",
          "category",
          "status",
          "subject",
          "eventCount",
          "memberCount",
          "members",
          "occurredAt",
          "lastSeenAt",
          "windowStart",
          "windowEnd",
          "acknowledgedAt",
          "summary",
          "reason",
        ],
        rows: items.map((alert) => [
          alert.alertId,
          alert.ruleId,
          alert.category,
          alert.status,
          alert.subject,
          alert.eventCount,
          alert.memberCount,
          alert.members
            .map((member) => member.account ?? member.memberId)
            .join(" "),
          alert.occurredAt,
          alert.lastSeenAt,
          alert.windowStart,
          alert.windowEnd,
          alert.acknowledgement?.acknowledgedAt ?? null,
          alertSummary(alert),
          reasonOf([alert.subject, alert.eventCount, alert.memberCount]),
        ]),
      },
    ],
  );
}
