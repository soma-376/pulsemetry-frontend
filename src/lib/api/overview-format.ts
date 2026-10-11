import type { Overview } from "./overview";

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
  status: Overview["comparison"]["status"],
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

/** 미관측 날짜는 선을 끊는다. 좌석 배분액은 사용 관측과 별도로 제공될 수 있다. */
export function trendSegments(
  points: Overview["trend"]["points"],
  field: "equivalentCostUsd" | "allocatedSeatCostUsd",
) {
  const segments: { index: number; value: number }[][] = [];
  let segment: { index: number; value: number }[] = [];
  points.forEach((point, index) => {
    const value =
      field === "equivalentCostUsd" && point.observation === "unobserved"
        ? null
        : numeric(point[field]);
    if (value === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push({ index, value });
  });
  if (segment.length) segments.push(segment);
  return segments;
}

/** 명세에 따라 상위 4개와 기타로 묶되 미수집 값은 합계로 확정하지 않는다. */
export function groupModels(models: Overview["modelMix"]["models"]) {
  const sorted = [...models].sort(
    (a, b) =>
      (numeric(b.equivalentCostUsd) ?? -1) -
        (numeric(a.equivalentCostUsd) ?? -1) ||
      a.modelId.localeCompare(b.modelId),
  );
  if (sorted.length <= 4) return sorted;
  const rest = sorted.slice(4);
  const cost = rest.every((model) => model.equivalentCostUsd !== null)
    ? rest.reduce((sum, model) => sum + Number(model.equivalentCostUsd), 0)
    : null;
  const tokens = rest.every((model) => model.totalTokens !== null)
    ? rest.reduce((sum, model) => sum + model.totalTokens!, 0)
    : null;
  return [
    ...sorted.slice(0, 4),
    {
      modelId: "__overview_other_models__",
      displayName: `기타 ${rest.length}개 모델`,
      equivalentCostUsd: cost === null ? null : String(cost),
      totalTokens: tokens,
      effectiveCostPerMillionTokensUsd:
        cost !== null && tokens !== null && tokens > 0
          ? String((cost / tokens) * 1_000_000)
          : null,
    },
  ];
}
