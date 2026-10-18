import { currentDateIso } from "../date";

export const UNKNOWN_USAGE =
  "사용 여부를 확인할 근거가 부족합니다. 미사용과 수집 공백을 구분할 수 없습니다.";

export type TrendSeriesInput = {
  id: string;
  name: string;
  color: string;
  values: (number | null)[];
  observations?: ("complete" | "partial" | "unobserved")[];
  reasons?: string[];
  /** 금액·토큰 등 추가 상세. 날짜별로 이미 포맷된 문자열. */
  extras?: string[];
};

export function trendFeedback(
  dates: string[],
  series: TrendSeriesInput[],
  { today = currentDateIso(), cumulative = false, resumeAfterGap = false } = {},
) {
  return {
    dates,
    today,
    cumulative,
    series: series.map((s) => {
      const values = s.values.map((v, i) => (dates[i] > today ? null : v));
      let earlierMissing = false;
      let earlierPartial = false;
      const notes = values.map((value, index) => {
        if (dates[index] > today) return "아직 도래하지 않은 날짜입니다.";
        const observation = s.observations?.[index];
        const reason = s.reasons?.[index];
        let note: string;
        if (value === null) {
          note =
            cumulative && earlierMissing && !resumeAfterGap
              ? "이전 날짜의 값을 확인할 수 없어 누적값을 계산할 수 없습니다."
              : observation === "unobserved"
                ? UNKNOWN_USAGE
                : "계산에 필요한 값을 확인할 수 없습니다.";
          earlierMissing = true;
        } else if (
          observation === "partial" ||
          (cumulative && earlierPartial)
        ) {
          note = "관측된 값만 집계한 수치로 실제 사용량과 다를 수 있습니다.";
        } else if (value === 0 && observation === "complete") {
          note = "수집 근거가 확인된 0입니다.";
        } else {
          note = "";
        }
        earlierPartial ||= observation === "partial";
        return [note, reason].filter(Boolean).join(" ");
      });
      return {
        ...s,
        values,
        notes,
        extras: s.extras?.map((text, i) => (dates[i] > today ? "" : text)),
      };
    }),
  };
}

export type TrendFeedback = ReturnType<typeof trendFeedback>;

/** 미래는 누락이 아니다. 일부 팀만 모르는 날짜와 모든 팀을 모르는 날짜를 구분한다. */
export function trendGaps(model: TrendFeedback) {
  const regions: { start: number; end: number; label: string }[] = [];
  model.dates.forEach((date, index) => {
    if (date > model.today || !model.series.length) return;
    const missing = model.series.filter((s) => s.values[index] == null).length;
    if (!missing) return;
    const label =
      missing === model.series.length
        ? model.cumulative
          ? "누적값 확인 불가"
          : "사용량 확인 불가"
        : "일부 값 확인 불가";
    const last = regions.at(-1);
    if (last && last.end === index - 1 && last.label === label)
      last.end = index;
    else regions.push({ start: index, end: index, label });
  });
  return regions;
}

export function trendBadge(model: TrendFeedback) {
  if (!model.series.length) return undefined;
  const missing = trendGaps(model).length > 0;
  const partial = model.series.some((s) =>
    s.observations?.some(
      (state, i) => model.dates[i] <= model.today && state === "partial",
    ),
  );
  if (!missing && !partial) return undefined;
  const through = model.series
    .map((s) => {
      const last = s.values.findLastIndex((value) => value !== null);
      return `${s.name}: ${last < 0 ? "표시 가능한 값 없음" : `${model.dates[last]}까지 표시`}`;
    })
    .join(" · ");
  return {
    label: missing ? "일부 날짜 확인 불가" : "일부 집계",
    reason: `${through}. ${missing ? "값이 없는 구간은 0으로 채우지 않습니다. 장애 여부는 사용량만으로 판단하지 않습니다." : "관측된 값만 집계한 수치로 실제 사용량과 다를 수 있습니다."} 날짜별 상세는 차트에서 확인할 수 있습니다.`,
  };
}
