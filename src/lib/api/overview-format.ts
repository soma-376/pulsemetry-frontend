import type { Overview, OverviewValue } from "./overview";

export const numeric = (
  value: string | number | null | undefined,
): number | null => (value == null ? null : Number(value));
export const numberText = (value: number | null | undefined) =>
  value == null
    ? "-"
    : value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
export const moneyText = (value: string | null | undefined) =>
  value == null
    ? "-"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(Number(value));
export function changeText(
  current: number | null,
  previous: number | null,
  status: "available" | "unavailable" | "disabled",
) {
  if (status === "disabled") return "비교 없음";
  if (status !== "available" || current === null || previous === null)
    return "비교 불가";
  if (previous === 0) return current === 0 ? "변화 없음" : "신규";
  const delta = ((current - previous) / previous) * 100;
  return delta === 0
    ? "변화 없음"
    : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

/** 미관측 날짜는 선을 끊는다. */
export function trendSegments(
  points: NonNullable<Overview["trend"]>["points"],
  field: "equivalentCostUsd",
) {
  const segments: { index: number; value: number }[][] = [];
  let segment: { index: number; value: number }[] = [];
  points.forEach((p, index) => {
    const v = p.observation === "unobserved" ? null : numeric(p[field].value);
    if (v === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push({ index, value: v });
  });
  if (segment.length) segments.push(segment);
  return segments;
}
export function aggregateValues<T>(
  values: OverviewValue<T>[],
  sum: (items: T[]) => T,
): OverviewValue<T> {
  const available = values.every((v) => v.value !== null);
  return {
    value: available ? sum(values.map((v) => v.value!)) : null,
    status: !available
      ? "unavailable"
      : values.every((v) => v.status === "complete")
        ? "complete"
        : "partial",
    reasons: [...new Set(values.flatMap((v) => v.reasons))],
  };
}
/** UI와 CSV가 같은 상위 4개+기타를 사용한다. 미확인 금액은 합계에 끼워 넣지 않는다. */
export function groupModels(
  models: NonNullable<Overview["modelMix"]>["models"],
) {
  const sorted = [...models].sort(
    (a, b) =>
      (numeric(b.equivalentCostUsd.value) ?? -1) -
        (numeric(a.equivalentCostUsd.value) ?? -1) ||
      a.modelId.localeCompare(b.modelId),
  );
  if (sorted.length <= 4) return sorted;
  const rest = sorted.slice(4);
  const cost = aggregateValues(
    rest.map((m) => m.equivalentCostUsd),
    (vs) => String(vs.reduce((s, v) => s + Number(v), 0)),
  );
  const tokens = aggregateValues(
    rest.map((m) => m.totalTokens),
    (vs) => vs.reduce((s, v) => s + v, 0),
  );
  const share = aggregateValues(
    rest.map((m) => m.costShare),
    (vs) => vs.reduce((s, v) => s + v, 0),
  );
  const perM: OverviewValue<string> = {
    value:
      cost.value !== null && tokens.value !== null && tokens.value > 0
        ? String((Number(cost.value) / tokens.value) * 1e6)
        : null,
    status:
      cost.value === null || tokens.value === null || tokens.value === 0
        ? "unavailable"
        : cost.status === "complete" && tokens.status === "complete"
          ? "complete"
          : "partial",
    reasons: [
      ...new Set([
        ...cost.reasons,
        ...tokens.reasons,
        ...(tokens.value === 0 ? ["zero_denominator"] : []),
      ]),
    ],
  };
  return [
    ...sorted.slice(0, 4),
    {
      modelId: "__overview_other_models__",
      displayName: `기타 ${rest.length}개 모델`,
      equivalentCostUsd: cost,
      totalTokens: tokens,
      effectiveCostPerMillionTokensUsd: perM,
      costShare: share,
    },
  ];
}
