import { int, pct, usd } from "@/lib/format";
import type {
  Pair,
  PerformanceScope,
  PerformanceView,
} from "@/lib/api/performance";

/**
 * 성과 요약 — 지표 정의와 카드 값.
 * 지표 하나가 요약 카드와 추이 그래프에 함께 쓰이므로 이름·단위·좋고 나쁨의 방향을 한곳에 둔다.
 */

export type PerformanceMetricKey =
  | "done"
  | "release"
  | "cycle"
  | "cycleCost"
  | "waste"
  | "ratio"
  | "linked"
  | "ci"
  | "releaseFailures"
  | "rejected"
  | "stale"
  | "failures";

export type MetricGroup = "productivity" | "spend" | "adoption" | "failure";

export type MetricDef = {
  /** 그래프 제목에 쓰는 이름 */
  label: string;
  /** 요약 카드 이름. 없으면 label */
  cardLabel?: string;
  /** 카드 값 뒤 단위 */
  unit: string;
  /** 그래프 값 뒤 단위. 없으면 unit */
  chartUnit?: string;
  group: MetricGroup;
  color: string;
  /** 기간 합계인 건수·금액 지표. 추이는 주별 합계, 전체 평균은 팀당 평균이다. */
  count: boolean;
  lowerIsBetter: boolean;
  /** 백분율 지표. 증감을 %p 로 표시하고 축을 100 이하로 둔다. */
  percentPoint: boolean;
  format: (value: number) => string;
};

const whole = (value: number) => int(Math.round(value));
const oneDecimal = (value: number) => value.toFixed(1);
const dollars = (value: number) => "$" + whole(value);

const COLORS: Record<MetricGroup, string> = {
  productivity: "var(--blue)",
  spend: "var(--orange-ink)",
  adoption: "var(--purple)",
  failure: "var(--red)",
};

const metric = (
  group: MetricGroup,
  def: Omit<MetricDef, "group" | "color">,
): MetricDef => ({ ...def, group, color: COLORS[group] });

const failure = (label: string, cardLabel: string, unit: string) =>
  metric("failure", {
    label,
    cardLabel,
    unit,
    count: true,
    lowerIsBetter: true,
    percentPoint: false,
    format: whole,
  });

export const METRICS: Record<PerformanceMetricKey, MetricDef> = {
  done: metric("productivity", {
    label: "완료한 작업",
    unit: "건",
    count: true,
    lowerIsBetter: false,
    percentPoint: false,
    format: whole,
  }),
  release: metric("productivity", {
    label: "릴리스 주기",
    unit: "일마다",
    chartUnit: "일",
    count: false,
    lowerIsBetter: true,
    percentPoint: false,
    format: oneDecimal,
  }),
  cycle: metric("productivity", {
    label: "사이클 타임",
    unit: "일",
    count: false,
    lowerIsBetter: true,
    percentPoint: false,
    format: oneDecimal,
  }),
  cycleCost: metric("spend", {
    label: "평균 사이클 비용",
    unit: "",
    count: false,
    lowerIsBetter: true,
    percentPoint: false,
    format: usd,
  }),
  waste: metric("spend", {
    label: "낭비된 비용",
    unit: "",
    count: true,
    lowerIsBetter: true,
    percentPoint: false,
    format: dollars,
  }),
  ratio: metric("adoption", {
    label: "활성 비율",
    unit: "%",
    count: false,
    lowerIsBetter: false,
    percentPoint: true,
    format: oneDecimal,
  }),
  linked: metric("adoption", {
    label: "산출로 이어진 토큰",
    unit: "%",
    count: false,
    lowerIsBetter: false,
    percentPoint: true,
    format: (value) => String(Math.round(value)),
  }),
  ci: failure("CI 실패", "CI 실패", "회"),
  releaseFailures: failure("릴리스 실패", "릴리스 실패 (롤백 포함)", "회"),
  rejected: failure("PR 반려", "PR 반려 (머지 없이 닫힘)", "건"),
  stale: failure("PR 방치", "PR 방치 (7일 이상)", "건"),
  failures: failure("실패한 작업 합계", "합계", "건"),
};

export const GROUPS: {
  title: string;
  group: MetricGroup;
  keys: PerformanceMetricKey[];
}[] = [
  {
    title: "생산성",
    group: "productivity",
    keys: ["done", "release", "cycle"],
  },
  { title: "지출", group: "spend", keys: ["cycleCost", "waste"] },
  { title: "도입 효용성", group: "adoption", keys: ["ratio", "linked"] },
];

export const FAILURE_KEYS: PerformanceMetricKey[] = [
  "ci",
  "releaseFailures",
  "rejected",
  "stale",
];

/** 단위를 붙인 값. 그래프는 chartUnit 을 쓴다. */
export const formatWithUnit = (def: MetricDef, value: number, chart = false) =>
  def.format(value) + (chart ? (def.chartUnit ?? def.unit) : def.unit);

/** 현재·이전 값. 계산에 필요한 값이 하나라도 없으면 null 이다. */
export type ValuePair = [current: number, previous: number];

const known = (...pairs: Pair[]) =>
  pairs.every((p) => p.current !== null && p.previous !== null);
const cur = (p: Pair) => p.current as number;
const prev = (p: Pair) => p.previous as number;
const sumPairs = (pairs: Pair[]): Pair =>
  known(...pairs)
    ? {
        current: pairs.reduce((total, p) => total + cur(p), 0),
        previous: pairs.reduce((total, p) => total + prev(p), 0),
      }
    : { current: null, previous: null };

export function rawPair(
  view: PerformanceView,
  scope: PerformanceScope,
  key: PerformanceMetricKey,
): ValuePair | null {
  const { usage, output, attribution, delivery } = view.scopes[scope];
  const usdPerM = view.meta.usdPerMillionTokens;
  const failures = sumPairs([
    delivery.ciFailures,
    delivery.releaseFailures,
    delivery.rejectedPrs,
    delivery.stalePrs,
  ]);
  const derive = (inputs: Pair[], at: (pick: (p: Pair) => number) => number) =>
    known(...inputs) ? ([at(cur), at(prev)] as ValuePair) : null;
  switch (key) {
    case "done":
      return derive(
        [output.completedTickets, failures],
        (v) => v(output.completedTickets) + v(failures),
      );
    case "release":
      return derive([delivery.releaseDays], (v) => v(delivery.releaseDays));
    case "cycle":
      return derive([output.cycleDays], (v) => v(output.cycleDays));
    case "cycleCost":
      return derive(
        [usage.tokensM, attribution.ticketLinkedPct, output.completedTickets],
        (v) =>
          v(output.completedTickets) === 0
            ? 0
            : ((v(usage.tokensM) * v(attribution.ticketLinkedPct)) /
                100 /
                v(output.completedTickets)) *
              usdPerM,
      );
    case "waste":
      return derive([delivery.wasteUsd], (v) => v(delivery.wasteUsd));
    case "ratio":
      return derive([usage.activeMembers, usage.members], (v) =>
        v(usage.members) === 0
          ? 0
          : (v(usage.activeMembers) / v(usage.members)) * 100,
      );
    case "linked":
      return derive([attribution.mergedSharePct], (v) =>
        v(attribution.mergedSharePct),
      );
    case "ci":
      return derive([delivery.ciFailures], (v) => v(delivery.ciFailures));
    case "releaseFailures":
      return derive([delivery.releaseFailures], (v) =>
        v(delivery.releaseFailures),
      );
    case "rejected":
      return derive([delivery.rejectedPrs], (v) => v(delivery.rejectedPrs));
    case "stale":
      return derive([delivery.stalePrs], (v) => v(delivery.stalePrs));
    case "failures":
      return derive([failures], (v) => v(failures));
  }
}

const MINUS = "−";
/** 이전 대비 변화율. 이전 값이 0이면 비교하지 않는다. */
export const relativeDelta = (current: number, previous: number) =>
  previous === 0 ? null : pct((current - previous) / previous);
/** 백분율 지표의 %p 변화 */
export const pointDelta = (current: number, previous: number) =>
  (current - previous >= 0 ? "+" : MINUS) +
  Math.abs(current - previous).toFixed(1) +
  "%p";
export const metricDelta = (def: MetricDef, current: number, ref: number) =>
  def.percentPoint ? pointDelta(current, ref) : relativeDelta(current, ref);
/** 같으면 나빠지지 않은 것으로 본다. */
export const isBetter = (def: MetricDef, current: number, ref: number) =>
  def.lowerIsBetter ? current <= ref : current >= ref;
export const tone = (def: MetricDef, current: number, ref: number) =>
  isBetter(def, current, ref) ? "var(--green)" : "var(--red)";

export type KpiView = {
  key: PerformanceMetricKey;
  label: string;
  color: string;
  value: string;
  unit: string;
  delta: string | null;
  deltaColor: string;
  previous: string | null;
  caption?: string;
};

function kpi(
  view: PerformanceView,
  scope: PerformanceScope,
  key: PerformanceMetricKey,
  showDelta: boolean,
  caption?: string,
): KpiView {
  const def = METRICS[key];
  const pair = rawPair(view, scope, key);
  const delta = pair && showDelta ? metricDelta(def, pair[0], pair[1]) : null;
  return {
    key,
    label: def.cardLabel ?? def.label,
    color: def.color,
    value: pair ? def.format(pair[0]) : "-",
    unit: pair ? def.unit : "",
    delta,
    deltaColor: pair ? tone(def, pair[0], pair[1]) : "var(--text3)",
    previous: pair && delta ? formatWithUnit(def, pair[1]) : null,
    caption,
  };
}

function captions(
  view: PerformanceView,
  scope: PerformanceScope,
): Partial<Record<PerformanceMetricKey, string>> {
  const { usage, output, delivery } = view.scopes[scope];
  const tickets = output.completedTickets.current;
  const failures = rawPair(view, scope, "failures");
  const waste = delivery.wasteUsd.current;
  const tokens = usage.tokensM.current;
  const aiUsd = tokens === null ? null : tokens * view.meta.usdPerMillionTokens;
  return {
    done:
      tickets !== null && failures && tickets + failures[0] > 0
        ? `성공 ${int(tickets)}건 (완료 티켓) · 실패 ${int(failures[0])}건 · 성공률 ${Math.round((tickets / (tickets + failures[0])) * 100)}%`
        : undefined,
    release: "운영 배포 사이 평균 간격",
    cycle: "티켓 In Progress → Done 중앙값",
    cycleCost: "완료 티켓 1건의 AI 환산 금액",
    waste:
      delivery.reverts !== null && delivery.hotfixes !== null
        ? `revert ${int(delivery.reverts)}건 · hotfix ${int(delivery.hotfixes)}건` +
          (waste !== null && aiUsd
            ? ` · AI 비용의 ${((waste / aiUsd) * 100).toFixed(1)}%`
            : "")
        : undefined,
    ratio:
      usage.members.current !== null && usage.activeMembers.current !== null
        ? `구성원 ${int(usage.members.current)}명 중 ${int(usage.activeMembers.current)}명이 AI 사용`
        : undefined,
    linked: "머지된 PR에 귀속된 토큰 비율",
  };
}

export type SummaryView = {
  groups: { title: string; color: string; cards: KpiView[] }[];
  failures: KpiView[];
  failureTotal: KpiView;
};

export function presentSummary(
  view: PerformanceView,
  scope: PerformanceScope,
  { showDelta }: { showDelta: boolean },
): SummaryView {
  const text = captions(view, scope);
  const card = (key: PerformanceMetricKey) =>
    kpi(view, scope, key, showDelta, text[key]);
  return {
    groups: GROUPS.map((g) => ({
      title: g.title,
      color: COLORS[g.group],
      cards: g.keys.map(card),
    })),
    failures: FAILURE_KEYS.map(card),
    failureTotal: card("failures"),
  };
}
