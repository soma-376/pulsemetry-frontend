import { yAt } from "@/components/charts/scale";
import { DAY_MS, fromIso, shortDate, toIso } from "@/lib/date";
import {
  PERFORMANCE_SCOPES,
  TEAM_SCOPES,
  type PerformanceScope,
  type PerformanceView,
} from "@/lib/api/performance";
import {
  METRICS,
  formatWithUnit,
  isBetter,
  metricDelta,
  rawPair,
  tone,
  type MetricDef,
  type PerformanceMetricKey,
  type ValuePair,
} from "./performance";

/**
 * 성과 추이 — 선택한 지표의 8주(비교 기간 4주 + 선택 기간 4주) 주별 값과,
 * 팀 범위일 때 함께 그리는 전체 평균.
 */

export const WEEKS = 8;
/** 예시 데이터는 30일 기간 값이다. 건수 지표의 주별 합계로 바꿀 때 쓴다. */
const PERIOD_DAYS = 30;

export const scopeName = (scope: PerformanceScope) =>
  scope === "all" ? "전체 조직" : `${PERFORMANCE_SCOPES[scope]} 팀`;

/** 이전 기간 값에서 현재 기간 값으로 이어지는 주별 값(예시 데이터용 보간). */
export function weeklyPath(previous: number, current: number): number[] {
  return Array.from(
    { length: WEEKS },
    (_, i) =>
      Math.round(
        (previous + ((current - previous) * i) / (WEEKS - 1)) *
          (1 + 0.035 * Math.sin(i * 1.9)) *
          10,
      ) / 10,
  );
}

export function weeklySeries(def: MetricDef, pair: ValuePair): number[] {
  const weeks = weeklyPath(pair[1], pair[0]);
  return def.count ? weeks.map((n) => (n / PERIOD_DAYS) * 7) : weeks;
}

/** 건수·금액 지표는 팀당 평균(조직 합계 ÷ 팀 수), 비율·시간 지표는 조직 값이다. */
export function orgAverage(
  view: PerformanceView,
  key: PerformanceMetricKey,
): ValuePair | null {
  const org = rawPair(view, "all", key);
  if (!org) return null;
  return METRICS[key].count
    ? [org[0] / TEAM_SCOPES.length, org[1] / TEAM_SCOPES.length]
    : org;
}

/** 변화가 보이도록 0이 아닌 최솟값~최댓값 주변에 여백을 둔다. 백분율은 100을 넘기지 않는다. */
export function axisDomain(
  values: number[],
  percentPoint: boolean,
): { min: number; max: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.35 || Math.abs(hi) * 0.1 || 1;
  const min = Math.max(0, lo - pad);
  const max = percentPoint ? Math.min(100, hi + pad) : hi + pad;
  return max > min ? { min, max } : { min, max: min + 1 };
}

/** 기간 마지막 날이 속한 주까지 8주의 시작일(월요일). */
export function weekLabels(endIso: string): string[] {
  const end = fromIso(endIso);
  const monday = end.getTime() - ((end.getUTCDay() + 6) % 7) * DAY_MS;
  return Array.from({ length: WEEKS }, (_, i) => {
    const iso = toIso(new Date(monday - (WEEKS - 1 - i) * 7 * DAY_MS));
    return shortDate(iso);
  });
}

/** 각 주의 가운데 x 좌표(0~100) */
export const centerX = (i: number) => ((i + 0.5) / WEEKS) * 100;

export type TrendStat = {
  label: string;
  value: string;
  valueColor: string;
  emphasis: string;
  emphasisColor: string;
  detail: string;
};

export type TrendView = {
  key: PerformanceMetricKey;
  title: string;
  color: string;
  scopeName: string;
  hasAverage: boolean;
  meta: string;
  /** viewBox 0 0 100 100 기준 polyline 좌표 */
  line: string;
  averageLine: string | null;
  points: { x: number; y: number; label: string }[];
  weeks: { label: string; value: string; average: string | null }[];
  yLabels: [top: string, middle: string, bottom: string];
  stats: TrendStat[];
  aria: string;
  note: string;
};

export function presentTrend(
  view: PerformanceView,
  scope: PerformanceScope,
  key: PerformanceMetricKey,
  { endIso, showDelta }: { endIso: string; showDelta: boolean },
): TrendView | null {
  const def = METRICS[key];
  const mine = rawPair(view, scope, key);
  const hasAverage = scope !== "all";
  const average = hasAverage ? orgAverage(view, key) : null;
  if (!mine || (hasAverage && !average)) return null;

  const fmt = (value: number) => formatWithUnit(def, value, true);
  const series = weeklySeries(def, mine);
  const averageSeries = average ? weeklySeries(def, average) : null;
  const domain = axisDomain(
    averageSeries ? [...series, ...averageSeries] : series,
    def.percentPoint,
  );
  const lineOf = (values: number[]) =>
    values
      .map((v, i) => `${centerX(i).toFixed(2)},${yAt(v, domain).toFixed(2)}`)
      .join(" ");
  const labels = weekLabels(endIso);
  const name = scopeName(scope);

  const periodStat = (label: string, pair: ValuePair): TrendStat => {
    const delta = showDelta ? metricDelta(def, pair[0], pair[1]) : null;
    return {
      label,
      value: fmt(pair[0]),
      valueColor: "var(--text)",
      emphasis: delta ?? "",
      emphasisColor: tone(def, pair[0], pair[1]),
      detail: delta ? `이전 ${fmt(pair[1])}` : "",
    };
  };
  const stats: TrendStat[] = average
    ? [
        periodStat(`${name} · 선택 기간`, mine),
        periodStat("전체 평균 · 선택 기간", average),
        {
          label: "전체 평균 대비",
          value: metricDelta(def, mine[0], average[0]) ?? "-",
          valueColor: tone(def, mine[0], average[0]),
          emphasis: isBetter(def, mine[0], average[0])
            ? "평균보다 좋음"
            : "평균보다 나쁨",
          emphasisColor: tone(def, mine[0], average[0]),
          detail: showDelta
            ? `이전 기간 ${metricDelta(def, mine[1], average[1]) ?? "-"}`
            : "",
        },
      ]
    : [
        periodStat(`${name} · 선택 기간`, mine),
        {
          label: `주별 범위 · ${WEEKS}주`,
          value: `${fmt(Math.min(...series))} ~ ${fmt(Math.max(...series))}`,
          valueColor: "var(--text)",
          emphasis: "",
          emphasisColor: "var(--text3)",
          detail: "팀을 고르면 전체 평균과 함께 봅니다",
        },
      ];

  return {
    key,
    title: `${def.label} 추이`,
    color: def.color,
    scopeName: name,
    hasAverage,
    meta:
      `${name}${hasAverage ? " vs 전체 평균" : ""} · 주 단위 · 비교 기간 포함 ${WEEKS}주` +
      (def.count ? " · 주별 합계" : ""),
    line: lineOf(series),
    averageLine: averageSeries ? lineOf(averageSeries) : null,
    points: series.map((v, i) => ({
      x: centerX(i),
      y: 100 - yAt(v, domain),
      label: fmt(v),
    })),
    weeks: labels.map((label, i) => ({
      label,
      value: fmt(series[i]),
      average: averageSeries ? fmt(averageSeries[i]) : null,
    })),
    yLabels: [
      fmt(domain.max),
      fmt((domain.max + domain.min) / 2),
      fmt(domain.min),
    ],
    stats,
    aria:
      `${name} ${def.label} 주별 추이` +
      (hasAverage ? ", 전체 평균과 비교" : "") +
      `, ${labels[0]}주 ${fmt(series[0])}에서 ${labels[WEEKS - 1]}주 ${fmt(series[WEEKS - 1])}`,
    note:
      "예시 데이터 · " +
      (def.count
        ? `건수·금액 지표의 전체 평균은 ${TEAM_SCOPES.length}개 팀(${TEAM_SCOPES.map((s) => PERFORMANCE_SCOPES[s]).join(" · ")})의 팀당 평균`
        : "비율·시간 지표의 전체 평균은 조직 전체 값") +
      " · 점 위 숫자는 범위의 주별 값",
  };
}
