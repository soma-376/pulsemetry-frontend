import {
  RULE_CATEGORY,
  type Alert,
  type AlertCategory,
  type AlertsPage,
  type AlertStatus,
} from "./api/alerts";
import type { Overview } from "./api/overview";
import type { Settings } from "./api/settings";
import type { TeamAnalytics, TeamsView, TeamUser } from "./api/teams";

/**
 * 공통 헤더의 CSV 내보내기(화면별 — 개요·팀·설정). 서버 CSV API 없이 **화면이 쓰는 응답**(같은 기간·비교·snapshot)에서만 만든다.
 * - 첫 머리 블록에 조직·기간·비교·snapshot·응답 시각·내보낸 시각을 둔다. 그 뒤 절마다 `section` 열로 시작하는 머리 행과 행들이 온다.
 * - null 은 빈 칸이고, 같은 행의 `reason` 열이 이유를 말한다 — 서버의 사유가 있으면 그것, 절은 가용한데 값만 없으면 `unknown`(모름 — 0 이 아니다).
 * - 금액은 서버의 USD 문자열 그대로, 비율·수치는 반올림하지 않는다.
 */
export type CsvValue = string | number | boolean | null | undefined;
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
const sectionReason = (
  availability: string,
  reason: string | null | undefined,
) => (availability === "available" ? null : (reason ?? availability));

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
  const { current, previous } = data.usage;
  const metric = (
    name: string,
    pick: (usage: NonNullable<typeof current>) => CsvValue,
  ): CsvValue[] => {
    const now = current ? pick(current) : null,
      before = previous ? pick(previous) : null;
    return [name, now, before, current ? reasonOf([now]) : data.meta.dataState];
  };
  const modelReason = sectionReason(
    data.modelMix.availability,
    data.modelMix.reason,
  );
  const teamReason = sectionReason(
    data.teamUsage.availability,
    data.teamUsage.reason,
  );
  const productReason = sectionReason(
    data.productUsage.availability,
    data.productUsage.reason,
  );
  const team = (
    id: string,
    name: string,
    now: {
      activeUsers: number | null;
      equivalentCostUsd: string | null;
    } | null,
    before: {
      activeUsers: number | null;
      equivalentCostUsd: string | null;
    } | null,
  ): CsvValue[] => {
    const values = [now?.activeUsers ?? null, now?.equivalentCostUsd ?? null];
    return [
      id,
      name,
      ...values,
      before?.activeUsers ?? null,
      before?.equivalentCostUsd ?? null,
      data.teamUsage.availability,
      reasonOf(values, teamReason),
    ];
  };
  return buildCsv(
    [
      ["화면", "개요"],
      ["조직", organization],
      [
        "기간",
        `${data.meta.startDate} ~ ${data.meta.endDate} (${data.meta.timeZone})`,
      ],
      ["비교", compareText(data.comparison)],
      ["데이터 상태", data.meta.dataState],
      ["데이터 확정 시각", data.meta.dataThrough],
      ["통화", data.meta.currency],
      ["응답 시각", data.meta.generatedAt],
      ["내보낸 시각", exportedAt],
    ],
    [
      {
        name: "summary",
        columns: ["metric", "current", "previous", "reason"],
        rows: [
          metric("activeUsers", (usage) => usage.activeUsers),
          metric("sessionCount", (usage) => usage.sessionCount),
          metric("totalTokens", (usage) => usage.tokens.total),
          metric("equivalentCostUsd", (usage) => usage.equivalentCostUsd),
        ],
      },
      {
        name: "trend",
        columns: [
          "date",
          "observation",
          "equivalentCostUsd",
          "allocatedSeatCostUsd",
          "totalTokens",
          "reason",
        ],
        rows: data.trend.points.map((point) => {
          const values = [
            point.equivalentCostUsd,
            point.allocatedSeatCostUsd,
            point.totalTokens,
          ];
          return [
            point.date,
            point.observation,
            ...values,
            point.observation === "complete"
              ? reasonOf(values)
              : point.observation,
          ];
        }),
      },
      {
        name: "model_mix",
        columns: [
          "modelId",
          "displayName",
          "equivalentCostUsd",
          "totalTokens",
          "effectiveCostPerMillionTokensUsd",
          "availability",
          "reason",
        ],
        rows: data.modelMix.models.length
          ? data.modelMix.models.map((model) => {
              const values = [
                model.equivalentCostUsd,
                model.totalTokens,
                model.effectiveCostPerMillionTokensUsd,
              ];
              return [
                model.modelId,
                model.displayName,
                ...values,
                data.modelMix.availability,
                reasonOf(values, modelReason),
              ];
            })
          : [
              [
                null,
                null,
                null,
                null,
                null,
                data.modelMix.availability,
                modelReason ?? "no_models",
              ],
            ],
      },
      {
        name: "team_usage",
        columns: [
          "teamId",
          "teamName",
          "activeUsers",
          "equivalentCostUsd",
          "previousActiveUsers",
          "previousEquivalentCostUsd",
          "availability",
          "reason",
        ],
        rows: [
          ...data.teamUsage.topTeams.map((item) =>
            team(item.teamId, item.teamName, item.current, item.previous),
          ),
          ...(data.teamUsage.otherTeams.count
            ? [
                [
                  "other_teams",
                  `그 밖의 팀 ${data.teamUsage.otherTeams.count}개`,
                  null,
                  data.teamUsage.otherTeams.currentEquivalentCostUsd,
                  null,
                  data.teamUsage.otherTeams.previousEquivalentCostUsd,
                  data.teamUsage.availability,
                  reasonOf(
                    [data.teamUsage.otherTeams.currentEquivalentCostUsd],
                    teamReason,
                  ) || "aggregated",
                ] as CsvValue[],
              ]
            : []),
          team(
            "unassigned",
            "미배정",
            data.teamUsage.unassigned.current,
            data.teamUsage.unassigned.previous,
          ),
        ],
      },
      {
        name: "product_usage",
        columns: [
          "kind",
          "displayName",
          "activeUsers",
          "sessionCount",
          "totalTokens",
          "equivalentCostUsd",
          "availability",
          "reason",
        ],
        rows: data.productUsage.products.map((product) => {
          const values = [
            product.activeUsers,
            product.sessionCount,
            product.totalTokens,
            product.equivalentCostUsd,
          ];
          return [
            product.kind ?? "unmapped",
            product.displayName,
            ...values,
            data.productUsage.availability,
            reasonOf(values, productReason),
          ];
        }),
      },
    ],
  );
}

const usageColumns = [
  "activeUsers",
  "sessionCount",
  "totalTokens",
  "equivalentCostUsd",
];
const usageValues = (usage: TeamAnalytics["current"]): CsvValue[] => [
  usage?.activeUsers ?? null,
  usage?.sessionCount ?? null,
  usage?.tokens.total ?? null,
  usage?.equivalentCostUsd ?? null,
];

/** 팀 목록 전 페이지(같은 snapshot)와, 고른 팀이 있으면 그 팀의 사용자 전부. */
export function teamsCsv(
  view: TeamsView,
  organization: string,
  exportedAt: string,
  selected: { teamId: string; teamName: string; users: TeamUser[] } | null,
) {
  const team = (item: TeamAnalytics, id: string): CsvValue[] => {
    const values = usageValues(item.current);
    return [
      id,
      item.teamName,
      ...values,
      ...usageValues(item.previous),
      item.current ? reasonOf(values) : "no_usage",
    ];
  };
  const sections: CsvSection[] = [
    {
      name: "totals",
      columns: ["metric", "current", "previous", "reason"],
      rows: usageColumns.map((name, index) => {
        const now = usageValues(view.totals.current)[index],
          before = usageValues(view.totals.previous)[index];
        return [
          name,
          now,
          before,
          view.totals.current ? reasonOf([now]) : view.meta.dataState,
        ];
      }),
    },
    {
      name: "teams",
      columns: [
        "teamId",
        "teamName",
        ...usageColumns,
        ...usageColumns.map((name) => `previous_${name}`),
        "reason",
      ],
      rows: [
        ...view.teams.map((item) => team(item, item.teamId ?? "")),
        team(view.unassigned, "unassigned"),
      ],
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
        "sessionCount",
        "totalTokens",
        "equivalentCostUsd",
        "lastUsedAt",
        "mainModel",
        "cacheHitRatio",
        "reason",
      ],
      rows: selected.users.map((user) => {
        const values = [
          user.usage.sessionCount,
          user.usage.tokens.total,
          user.usage.equivalentCostUsd,
        ];
        return [
          selected.teamId,
          selected.teamName,
          user.memberId,
          user.account,
          ...values,
          user.lastUsedAt,
          user.mainModel?.displayName ?? null,
          user.cache.hitRatio,
          reasonOf(values),
        ];
      }),
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

/** 등록 제품·계약·좌석 요약·종량 지출(벤더 청구 누계 — 원천·기간 포함). 설정 응답의 전 페이지(같은 snapshot)다. */
export function settingsCsv(
  data: Settings,
  organization: string,
  exportedAt: string,
) {
  const summary = data.summary;
  const metered = summary.meteredMonthToDate;
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
        columns: ["metric", "value", "reason"],
        rows: [
          [
            "configuredVendors",
            summary.configuredVendors,
            reasonOf([summary.configuredVendors]),
          ],
          [
            "monthlySeatFeeUsd",
            summary.monthlySeatFeeUsd,
            reasonOf([summary.monthlySeatFeeUsd]),
          ],
          [
            "contractedSeats",
            summary.contractedSeats,
            reasonOf([summary.contractedSeats]),
          ],
          [
            "assignedSeats",
            summary.assignedSeats ?? null,
            reasonOf([summary.assignedSeats ?? null]),
          ],
          [
            "meteredActualBilledUsd",
            metered.data?.actualBilledUsd ?? null,
            reasonOf(
              [metered.data?.actualBilledUsd ?? null],
              sectionReason(metered.availability, metered.reason),
            ),
          ],
        ],
      },
      {
        name: "vendors",
        columns: [
          "vendorId",
          "displayName",
          "kind",
          "state",
          "contractStatus",
          "planId",
          "effectiveFrom",
          "effectiveTo",
          "monthlySeatFeeUsd",
          "seatsAssigned",
          "seatsContracted",
          "seatsAvailability",
          "seatsReason",
          "meteredActualBilledUsd",
          "meteredStartDate",
          "meteredEndDate",
          "billingKind",
          "finalized",
          "meteredSource",
          "meteredAvailability",
          "meteredReason",
        ],
        rows: data.vendors.items.map((vendor) => {
          const seats = vendor.seats,
            billing = vendor.meteredMonthToDate;
          return [
            vendor.vendorId,
            vendor.displayName,
            vendor.kind,
            vendor.state,
            vendor.contractStatus,
            vendor.contract?.planId ?? null,
            vendor.contract?.effectiveFrom ?? null,
            vendor.contract?.effectiveTo ?? null,
            vendor.contract?.monthlySeatFeeUsd ?? null,
            seats?.data?.assigned ?? null,
            seats?.data?.contracted ?? null,
            seats?.availability ?? null,
            seats
              ? sectionReason(seats.availability, seats.reason)
              : "not_provided",
            billing?.data?.actualBilledUsd ?? null,
            billing?.data?.startDate ?? null,
            billing?.data?.endDate ?? null,
            billing?.data?.billingKind ?? null,
            billing?.data?.finalized ?? null,
            billing?.data?.source ?? null,
            billing?.availability ?? null,
            billing
              ? sectionReason(billing.availability, billing.reason)
              : "not_provided",
          ];
        }),
      },
      {
        name: "contract_tiers",
        columns: [
          "vendorId",
          "tierId",
          "label",
          "seats",
          "monthlyFeePerSeatUsd",
        ],
        rows: data.vendors.items.flatMap((vendor) =>
          (vendor.contract?.tiers ?? []).map((tier) => [
            vendor.vendorId,
            tier.tierId,
            tier.label,
            tier.seats,
            tier.monthlyFeePerSeatUsd,
          ]),
        ),
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

/** 운영 · 보안의 알림 목록(화면의 상태·범주와 같은 조건, 같은 snapshot 의 전 페이지)과 규칙별 평가. 확인 기록이 없으면 빈 칸이다. */
export function alertsCsv(
  first: AlertsPage,
  items: Alert[],
  organization: string,
  status: AlertStatus,
  category: AlertCategory,
  exportedAt: string,
) {
  const rules = first.evaluation.rules.filter(
    (rule) => RULE_CATEGORY[rule.ruleId] === category,
  );
  return buildCsv(
    [
      ["화면", "운영 · 보안"],
      ["조직", organization],
      ["범주", category],
      ["상태", status],
      ["평가 가용성", first.evaluation.availability],
      ["평가 사유", first.evaluation.reason],
      ["평가 시각", first.evaluation.asOf],
      ["snapshot", first.meta.snapshotId],
      ["알림 수", items.length],
      ["내보낸 시각", exportedAt],
    ],
    [
      {
        name: "rules",
        columns: ["ruleId", "enabled", "status", "evaluatedAt", "reason"],
        rows: rules.map((rule) => [
          rule.ruleId,
          rule.enabled,
          rule.status,
          rule.evaluatedAt,
          rule.reason ??
            (rule.status === null && rule.enabled ? "not_evaluated_yet" : ""),
        ]),
      },
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
          reasonOf([alert.subject, alert.eventCount, alert.memberCount]),
        ]),
      },
    ],
  );
}
