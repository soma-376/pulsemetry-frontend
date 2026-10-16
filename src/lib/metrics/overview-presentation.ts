import {
  trendFeedback,
  trendBadge,
  type TrendFeedback,
} from "./trend-feedback";
import { currentDateIso } from "../date";
import type { ContractStatus } from "../contract-status";
import type {
  Overview,
  OverviewValue,
  OverviewMetric,
} from "@/lib/api/overview";
import {
  groupModels,
  moneyText,
  numberText,
  numeric,
} from "@/lib/api/overview-format";
import { signedUsd } from "@/lib/format";
import type { OverviewModel } from "./overview";
export type OverviewChart = Omit<
  OverviewModel["chart"],
  "cost" | "series" | "ticks"
> & {
  ticks: (OverviewModel["chart"]["ticks"][number] & { status?: string })[];
  feedback?: TrendFeedback;
  cost: (number | null)[];
  series: {
    id: string;
    name: string;
    color: string;
    values: (number | null)[];
  }[];
};
/** 개요의 계약·좌석 표 — 서버 설정(계약·좌석 원장)과 회수 후보 목록, 개요의 제품별 관측에서 만든다. 메모리 좌석 데이터를 쓰지 않는다. */
export type OverviewVendorDisplay = {
  snapshotDate: string;
  rows: {
    id: string;
    name: string;
    color: string;
    /** 선택 기간의 사용 관측 인원(좌석 수가 아니다). 모르면 null */
    observedUsers: number | null;
    /** 회수 후보 수 — 서버 회수 후보 목록을 제품별로 센 값. 목록을 읽지 못했으면 null */
    candidates: number | null;
    purchased: number | null;
    monthly: number | null;
    contractStatus: ContractStatus;
    status: string;
    startDate?: string;
    contracts: {
      id: string;
      name: string;
      plan: string;
      tiers: { label: string; seats: number; fee: number }[];
      confirmed: boolean;
      term?: string;
    }[];
    /** 좌석 원장의 배정 좌석(서버). 원장을 쓸 수 없으면 null 과 사유. */
    assigned?: number | null;
    seatsReason?: string | null;
  }[];
  /** 회수 후보가 판정하지 못한 좌석을 뺀 목록인가(서버 partial). */
  candidatesPartial?: boolean;
};
type TeamChange = {
  changeText: string;
  contrib: number | null;
  contribText: string;
  comparisonReason?: string;
  userStatus?: { label: string; reason: string };
  costStatus?: { label: string; reason: string };
};
export type OverviewTeamSummary = {
  show: boolean;
  hasUnmapped: boolean;
  moreLabel: string;
  /** 두 기간이 모두 완전해 서버가 이전 값을 준 경우에만 증감·증가 기여 열을 그린다(비교 불가를 0%로 그리지 않는다). */
  comparable: boolean;
  compareLabel: string;
  rows: ({
    teamId?: string;
    team: string;
    users: string;
    userCount: number | null;
    vendors: string[] | null;
    cost: number | null;
    costText: string;
  } & TeamChange)[];
  unmappedUsers: string;
  unmappedVendors: string[] | null;
  unattributedCostText: string;
  unmapped: TeamChange;
};
export function comparisonReason(data: {
  meta: { currentCoverage: Overview["meta"]["currentCoverage"] };
  comparison: {
    mode: string;
    status?: string;
    startDate?: string | null;
    endDate?: string | null;
    coverage?: Overview["meta"]["currentCoverage"] | null;
  };
}) {
  if (data.comparison.mode === "none") return "";
  if (data.meta.currentCoverage.status !== "complete")
    return "선택 기간에 수집 근거가 완전하지 않은 날이 있습니다";
  if (data.comparison.status === "available") return "";
  const { startDate, endDate, coverage } = data.comparison;
  if (coverage && coverage.status !== "complete")
    return `비교 기간${startDate && endDate ? `(${startDate} ~ ${endDate})` : ""}에 수집 근거가 완전하지 않은 날이 있습니다`;
  return "비교할 수 있는 수집 근거가 없습니다";
}

const REASONS: Record<string, string> = {
  cache_data_unavailable: "캐시 적중률을 계산할 근거가 부족합니다",
  cumulative_period_incomplete:
    "앞선 날짜의 수집 근거가 불완전해 누적값을 확정할 수 없습니다",
  team_count_unavailable: "모델을 사용하는 팀 수를 확인할 수 없습니다",
  current_period_incomplete: "선택 기간의 수집 근거가 완전하지 않습니다",
  previous_period_incomplete: "비교 기간의 수집 근거가 완전하지 않습니다",
  member_identity_missing: "구성원을 확인할 수 없는 사용이 있습니다",
  session_identity_missing: "세션을 확인할 수 없는 사용이 있습니다",
  pricing_missing: "단가를 확인할 수 없는 사용이 있습니다",
  pricing_version_mixed: "서로 다른 가격 기준이 섞여 있습니다",
  token_data_incomplete: "일부 토큰 값이 없습니다",
  token_semantics_incompatible: "토큰 집계 기준을 합칠 수 없습니다",
  zero_denominator: "분모가 0이므로 계산할 수 없습니다",
  no_data: "계산에 필요한 데이터가 없습니다",
};
const COLLECTION_REASONS: Record<string, string> = {
  period_pending: "아직 하루가 끝나지 않았거나 전송·적재 확정 대기 중입니다",
  retention_deleted: "보관 기간에 따라 삭제된 구간이 포함되어 있습니다",
  usage_collection_disabled:
    "사용량 수집 정책이 꺼져 있거나 정책 근거가 없는 기간입니다",
  no_eligible_installations:
    "수집 대상 기기가 없어 사용 여부를 확인할 수 없습니다",
  installation_revoked:
    "기간 중 등록 해제된 기기의 마지막 전송을 확인할 수 없습니다",
  collection_gap:
    "일부 기기에 보고 공백 또는 손실 기록이 있어 사용량 전체를 확인할 수 없습니다. 기기가 꺼진 시간에도 보고 공백이 생길 수 있습니다",
};
export function reasonsText(reasons: string[]) {
  const unique = [...new Set(reasons)];
  return unique
    .filter((reason) => {
      if (reason === "current_period_incomplete")
        return !unique.some((r) => r in COLLECTION_REASONS);
      if (reason === "previous_period_incomplete")
        return !unique.some(
          (r) => r.startsWith("previous_") && r.slice(9) in COLLECTION_REASONS,
        );
      return true;
    })
    .map(
      (reason) =>
        REASONS[reason] ??
        COLLECTION_REASONS[reason] ??
        (reason.startsWith("previous_") && COLLECTION_REASONS[reason.slice(9)]
          ? `비교 기간: ${COLLECTION_REASONS[reason.slice(9)]}`
          : "계산에 필요한 근거를 확인할 수 없습니다"),
    )
    .join(" · ");
}
export function partialValueLabel(reasons: string[]) {
  const collection = reasons.filter((reason) => reason in COLLECTION_REASONS);
  if (
    collection.some((reason) => reason !== "period_pending") ||
    (reasons.includes("current_period_incomplete") && !collection.length)
  )
    return "관측 근거 부족";
  if (
    reasons.some((reason) =>
      ["member_identity_missing", "session_identity_missing"].includes(reason),
    )
  )
    return "일부 집계";
  return collection.includes("period_pending") ? "집계 중" : "일부 집계";
}
export function valueStatus(value: OverviewValue<unknown>) {
  return value.status === "complete"
    ? undefined
    : {
        label:
          value.status === "partial"
            ? partialValueLabel(value.reasons)
            : "값 확인 불가",
        reason: reasonsText(value.reasons),
      };
}
const colors = [
  "var(--purple)",
  "var(--blue)",
  "var(--orange-ink)",
  "var(--green)",
  "var(--gray)",
];
const tokenText = (value: number | null) =>
  value === null
    ? "-"
    : new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
function teamChange(metric: OverviewMetric<string>): TeamChange {
  const c = metric.comparison;
  const delta = numeric(c.absoluteChange);
  return {
    changeText:
      c.status !== "available"
        ? "비교 불가"
        : c.change === "new"
          ? "신규"
          : c.change === "unchanged"
            ? "변화 없음"
            : `${(c.percentChange ?? 0) > 0 ? "+" : ""}${c.percentChange?.toFixed(1)}%`,
    contrib: delta,
    contribText: delta === null ? "-" : signedUsd(delta),
    comparisonReason: reasonsText(c.reasons),
    costStatus: valueStatus(metric),
  };
}
export function presentOverview(data: Overview, today = currentDateIso()) {
  const summary = data.summary;
  const compareLabel =
    data.comparison.mode === "none"
      ? ""
      : data.comparison.mode === "prev_week"
        ? "전주 대비"
        : "이전 기간 대비";
  const definitions = summary
    ? [
        {
          label: "사용자 수",
          metric: summary.activeUsers,
          format: (v: string | number | null) => numberText(numeric(v)),
          unit: "명",
          def: "기간 내 사용이 확인된 고유 구성원 수 · 벤더 좌석 수와 별개",
          caption: "기간 내 사용이 확인된 구성원",
          good: true,
        },
        {
          label: "사용 환산액",
          metric: summary.equivalentCostUsd,
          format: (v: string | number | null) =>
            moneyText(v === null ? null : String(v)),
          unit: "",
          def: "토큰 × 공시 단가 = 사용 환산액 · 실제 청구액과 별개",
          caption: "사용량을 금액으로 환산한 값",
          good: false,
        },
        {
          label: "세션 수",
          metric: summary.sessionCount,
          format: (v: string | number | null) => numberText(numeric(v)),
          unit: "개",
          def: "세션 = 도구 프로세스 1회 실행",
          caption: `사용자당 ${numberText(summary.sessionsPerUser.value)}회 · 세션당 ${moneyText(summary.equivalentCostPerSessionUsd.value)}`,
          captionTitle: reasonsText([
            ...summary.sessionsPerUser.reasons,
            ...summary.equivalentCostPerSessionUsd.reasons,
          ]),
          good: false,
        },
        {
          label: "사용자당 환산액",
          metric: summary.equivalentCostPerUserUsd,
          format: (v: string | number | null) =>
            moneyText(v === null ? null : String(v)),
          unit: "",
          def: "선택 기간의 사용 환산액 ÷ 고유 사용자 수",
          caption: "사용 환산액 ÷ 사용자 수",
          good: false,
        },
        {
          label: "총 토큰 수",
          metric: summary.totalTokens,
          format: (v: string | number | null) => tokenText(numeric(v)),
          unit: summary.totalTokens.value === null ? "" : "토큰",
          def: `선택 기간 전체 ${numberText(summary.totalTokens.value)} 토큰`,
          caption:
            summary.totalTokens.value === null
              ? "전체 토큰 수를 확인할 수 없습니다"
              : "기간 내 사용한 전체 토큰",
          good: false,
        },
      ]
    : [];
  const kpis = definitions.map(({ metric, format, ...item }) => {
    const c = metric.comparison;
    return {
      ...item,
      value: format(metric.value),
      valueStatus: valueStatus(metric),
      bad: false,
      delta:
        c.change === "new"
          ? "신규"
          : c.change === "unchanged"
            ? "변화 없음"
            : c.percentChange === null
              ? "-"
              : `${Math.abs(c.percentChange).toFixed(1)}%`,
      up: (c.percentChange ?? 0) >= 0,
      showArrow: c.percentChange !== null && c.change !== "unchanged",
      showDelta: c.status === "available",
      noDelta: c.status === "unavailable",
      noDeltaReason: reasonsText(c.reasons),
      previousText:
        c.status === "available"
          ? `${format(c.previousValue)}${item.unit}`
          : undefined,
    };
  });
  const points = data.trend?.points ?? [];
  const cost = points.map((p) =>
    p.date > today || p.observation === "unobserved"
      ? null
      : numeric(p.equivalentCostUsd.value),
  );
  const yMax =
    Math.max(1, ...cost.filter((v): v is number => v !== null)) * 1.15;
  const ticks = points.map((p) => ({
    label: `${Number(p.date.slice(5, 7))}.${Number(p.date.slice(8))}`,
    date: p.date,
    preObserved: p.observation === "unobserved",
    tokens: numberText(p.totalTokens.value),
    cost: moneyText(p.equivalentCostUsd.value),
    status: reasonsText([
      ...new Set([...p.equivalentCostUsd.reasons, ...p.totalTokens.reasons]),
    ]),
  }));
  const chart: OverviewChart = {
    cost,
    yMax,
    topLabel: moneyText(String(yMax)),
    midLabel: moneyText(String(yMax / 2)),
    labels: ticks.map((t) => t.label),
    ticks,
    series: [
      {
        id: "organization",
        name: "전체",
        color: "var(--purple)",
        values: cost,
      },
    ],
  };
  chart.feedback = trendFeedback(
    points.map((p) => p.date),
    chart.series.map((series) => ({
      ...series,
      observations: points.map((p) => p.observation),
      reasons: ticks.map((tick) => tick.status),
      extras: ticks.map((tick) => `토큰 ${tick.tokens}`),
    })),
    { today },
  );
  const models = groupModels(data.modelMix?.models ?? []);
  const topName = models[0]?.displayName ?? "관측 없음";
  const shareText = (v: number | null) =>
    v === null ? "-" : `${(v * 100).toFixed(1)}%`;
  const sharesAvailable =
    models.length > 0 && models.every((m) => m.costShare.value !== null);
  const mix: OverviewModel["mix"] = {
    count: data.modelMix?.models.length ?? 0,
    slices: sharesAvailable
      ? models.map((m, i) => ({
          v: m.modelId,
          name: m.displayName,
          cost: Number(m.equivalentCostUsd.value),
          color: colors[i % colors.length],
          sub: moneyText(m.effectiveCostPerMillionTokensUsd.value),
          share: m.costShare.value! * 100,
        }))
      : [],
    rows: models.map((m, i) => ({
      id: m.modelId,
      name: m.displayName,
      color: colors[i % colors.length],
      shareText: shareText(m.costShare.value),
      perMText:
        m.effectiveCostPerMillionTokensUsd.value === null
          ? "-"
          : `${moneyText(m.effectiveCostPerMillionTokensUsd.value)}/M`,
      costText: moneyText(m.equivalentCostUsd.value),
      tip: `${m.displayName} · 사용 환산액 ${moneyText(m.equivalentCostUsd.value)} · 토큰 ${numberText(m.totalTokens.value)} · ${reasonsText([...new Set([...m.equivalentCostUsd.reasons, ...m.totalTokens.reasons, ...m.effectiveCostPerMillionTokensUsd.reasons, ...m.costShare.reasons])])}`,
    })),
    topName,
    topShare: shareText(models[0]?.costShare.value ?? null),
    headline: sharesAvailable
      ? `${topName} · 전체 환산액의 ${shareText(models[0]?.costShare.value ?? null)}`
      : models.length
        ? "사용 환산액 비중을 확인할 수 없습니다"
        : "사용이 확인된 모델이 없습니다",
    detail: sharesAvailable
      ? "모델을 선택하면 사용 환산액 비중을 확인할 수 있습니다"
      : "모델별 사용 정보만 확인할 수 있습니다",
  };
  const teams = data.teamUsage;
  const unmapped = teams?.unassigned;
  const productNames = (
    products: { kind: string | null; displayName: string | null }[],
  ) =>
    products.map((p) =>
      p.kind === null ? "미확인 제품" : (p.displayName ?? p.kind),
    );
  const attribution: OverviewTeamSummary = {
    show: !!teams && (teams.totalTeamCount > 1 || !!unmapped),
    hasUnmapped: !!unmapped,
    moreLabel: `전체 ${teams?.totalTeamCount ?? 0}팀`,
    comparable: data.comparison.mode !== "none",
    compareLabel,
    rows: (teams?.topTeams ?? []).map((t) => ({
      teamId: t.teamId,
      team: t.teamName,
      users: numberText(t.activeUsers.value),
      userCount: t.activeUsers.value,
      userStatus: valueStatus(t.activeUsers),
      vendors: productNames(t.products),
      cost: numeric(t.equivalentCostUsd.value),
      costText: moneyText(t.equivalentCostUsd.value),
      ...teamChange(t.equivalentCostUsd),
    })),
    unmappedUsers: numberText(unmapped?.activeUsers.value),
    unmappedVendors: unmapped ? productNames(unmapped.products) : [],
    unattributedCostText: moneyText(unmapped?.equivalentCostUsd.value),
    unmapped: unmapped
      ? {
          ...teamChange(unmapped.equivalentCostUsd),
          userStatus: valueStatus(unmapped.activeUsers),
        }
      : { changeText: "-", contrib: null, contribText: "-" },
  };
  const mixReasons = [
    ...new Set(
      models.flatMap((m) => [
        ...m.equivalentCostUsd.reasons,
        ...m.totalTokens.reasons,
        ...m.costShare.reasons,
        ...m.effectiveCostPerMillionTokensUsd.reasons,
      ]),
    ),
  ];
  const mixStatus = mixReasons.length
    ? {
        label: models.some((m) =>
          [
            m.equivalentCostUsd,
            m.totalTokens,
            m.costShare,
            m.effectiveCostPerMillionTokensUsd,
          ].some((v) => v.status === "unavailable"),
        )
          ? "일부 값 확인 불가"
          : partialValueLabel(mixReasons),
        reason: reasonsText(mixReasons),
      }
    : undefined;
  const chartStatus = trendBadge(chart.feedback);
  return {
    mixStatus,
    chartStatus,
    observedTokens: numberText(
      data.modelMix?.models.length === 1
        ? data.modelMix.models[0].totalTokens.value
        : summary?.totalTokens.value,
    ),
    kpis,
    chart,
    mix,
    attribution,
    compareLabel,
    periodLabel: `${data.meta.startDate} ~ ${data.meta.endDate}`,
    isEmpty: data.meta.dataState === "never_observed",
    hasData: ["ready", "partial"].includes(data.meta.dataState),
    observation: {
      firstObservedIndex: Math.max(
        0,
        cost.findIndex((v) => v !== null),
      ),
      hasGap: data.meta.currentCoverage.status !== "complete",
      chartNote: "데이터가 없는 날짜는 표시하지 않습니다.",
      coverageNote: "",
    },
    defs: {
      w12: "날짜별 토큰 사용량의 공시 단가 환산액 · 실제 청구액과 별개",
      w14: "모델별 사용 환산액 ÷ 전체 사용 환산액",
      w17: "이벤트 당시 팀별 사용 환산액",
    },
  };
}
