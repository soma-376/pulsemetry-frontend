import { test } from "node:test";
import assert from "node:assert/strict";
import {
  trendBadge,
  trendFeedback,
  trendGaps,
  UNKNOWN_USAGE,
  NO_OBSERVED_USAGE,
  hasNoObservedUsage,
} from "../src/lib/metrics/trend-feedback";
import { overviewSchema } from "../src/lib/api/overview";
import { presentOverview } from "../src/lib/metrics/overview-presentation";
import { cumulative } from "../src/lib/metrics/teams-presentation";
import example from "../docs/api/overview-response.example.json";

const dates = ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"];
const base = { id: "team", name: "플랫폼", color: "purple" };

test("기록 0건은 명시된 근거로만 판정하고 계산 결손을 가리지 않는다", () => {
  const missing = { value: null, reasons: ["no_data"] };
  assert.equal(hasNoObservedUsage(0, missing), true);
  assert.equal(hasNoObservedUsage(null, missing), false);
  assert.equal(hasNoObservedUsage(undefined, missing), false);
  assert.equal(hasNoObservedUsage(1, missing), false);
  assert.equal(hasNoObservedUsage(0, { value: null, reasons: [] }), false);
  for (const reason of [
    "pricing_missing",
    "token_data_incomplete",
    "source_unavailable",
  ]) {
    assert.equal(
      hasNoObservedUsage(0, { ...missing, reasons: ["no_data", reason] }),
      false,
    );
    assert.equal(
      hasNoObservedUsage(0, { value: "1", reasons: [reason] }),
      false,
    );
  }
  assert.equal(hasNoObservedUsage(0, { value: "1", reasons: [] }), true);
});

test("기록 없는 구간과 실제 결손을 다른 음영·배지로 구분하고 null을 유지한다", () => {
  const series = {
    ...base,
    values: [1, null, null, null],
    observations: [
      "complete",
      "unobserved",
      "unobserved",
      "unobserved",
    ] as const,
    noUsage: [false, true, true, false],
  };
  const model = trendFeedback(
    dates,
    [{ ...series, observations: [...series.observations] }],
    { today: dates[2] },
  );
  assert.deepEqual(trendGaps(model), [
    { start: 1, end: 2, label: NO_OBSERVED_USAGE },
  ]);
  assert.equal(trendBadge(model), undefined);
  assert.match(model.series[0].notes[1], /관측된 사용 기록이 없습니다/);
  assert.doesNotMatch(model.series[0].notes[1], /확인할 근거가 부족/);
  assert.deepEqual(model.series[0].values, [1, null, null, null]);
  const mixed = trendFeedback(
    dates,
    [
      { ...series, observations: [...series.observations] },
      { ...base, id: "broken", values: [1, null, 2, null] },
    ],
    { today: dates[2] },
  );
  assert.equal(trendGaps(mixed)[0].label, "일부 값 확인 불가");
  assert.equal(trendGaps(mixed)[1].label, "일부 사용 기록 없음");
  assert.equal(trendBadge(mixed)?.label, "일부 날짜 확인 불가");
});

test("휴일의 확인된 0과 사용 여부를 모르는 날을 구분한다", () => {
  const zero = trendFeedback(
    dates,
    [
      {
        ...base,
        values: [10, 0, 0, 20],
        observations: ["complete", "complete", "complete", "complete"],
      },
    ],
    { today: dates[3] },
  );
  assert.deepEqual(trendGaps(zero), []);
  assert.equal(trendBadge(zero), undefined);
  assert.match(zero.series[0].notes[1], /확인된 0/);
  const unknown = trendFeedback(
    dates,
    [
      {
        ...base,
        values: [10, null, null, 20],
        observations: ["complete", "unobserved", "unobserved", "complete"],
      },
    ],
    { today: dates[3] },
  );
  assert.equal(unknown.series[0].notes[1], UNKNOWN_USAGE);
  assert.deepEqual(trendGaps(unknown), [
    { start: 1, end: 2, label: "사용량 확인 불가" },
  ]);
  assert.equal(unknown.series[0].values[3], 20);
});

test("팀 누적은 확인된 0이면 유지되고, 누락 이후에는 다시 관측돼도 이어지지 않는다", () => {
  const points = dates.map((date, i) => ({
    date,
    equivalentCostUsd: ["10", "0", "0", "20"][i],
    totalTokens: 0,
    cumulativeSessionCount: 1,
    observation: "complete" as const,
    status: "complete" as const,
    reasons: [],
  }));
  assert.deepEqual(cumulative(points, "cost"), [10, 10, 10, 30]);
  const values = cumulative(
    points.map((p, i) =>
      i === 1
        ? { ...p, equivalentCostUsd: null, observation: "unobserved" }
        : p,
    ),
    "cost",
  );
  assert.deepEqual(values, [10, null, null, null]);
  const model = trendFeedback(
    dates,
    [
      {
        ...base,
        values,
        observations: ["complete", "unobserved", "complete", "complete"],
      },
    ],
    { today: dates[3], cumulative: true },
  );
  assert.equal(model.series[0].notes[1], UNKNOWN_USAGE);
  assert.match(model.series[0].notes[3], /이전 날짜/);
});

test("팀마다 종료일을 보존하고 미래는 누락 판정에서 제외한다", () => {
  const model = trendFeedback(
    dates,
    [
      { ...base, values: [1, null, null, null] },
      { ...base, id: "other", name: "디자인", values: [1, 2, 3, null] },
    ],
    { today: dates[2], cumulative: true },
  );
  assert.deepEqual(trendGaps(model), [
    { start: 1, end: 2, label: "일부 값 확인 불가" },
  ]);
  assert.match(trendBadge(model)!.reason, /플랫폼: 2026-10-09까지 표시/);
  assert.match(trendBadge(model)!.reason, /디자인: 2026-10-11까지 표시/);
  assert.match(model.series[0].notes[3], /아직 도래/);
  const futureOnly = { ...model, series: [model.series[1]] };
  assert.equal(trendBadge(futureOnly), undefined);
  assert.deepEqual(trendGaps(futureOnly), []);
  assert.equal(trendBadge({ ...model, series: [] }), undefined);
});

test("부분 관측의 누적값은 이후에도 부분합임을 안내한다", () => {
  const model = trendFeedback(
    dates,
    [
      {
        ...base,
        values: [1, 2, 3, 4],
        observations: ["complete", "partial", "complete", "complete"],
      },
    ],
    { today: dates[3], cumulative: true },
  );
  assert.equal(trendBadge(model)?.label, "일부 집계");
  assert.match(model.series[0].notes[3], /실제 사용량과 다를/);
});

test("개요 응답의 미관측·0·미래가 차트와 피드백에 동일하게 반영된다", () => {
  const data = overviewSchema.parse(example);
  const metric = (value: string | null) => ({
    value,
    status: value === null ? ("unavailable" as const) : ("complete" as const),
    reasons: [],
  });
  data.trend!.points = dates.map((date, i) => ({
    date,
    observation: i === 2 ? "unobserved" : "complete",
    equivalentCostUsd: metric(i === 1 ? "0" : i === 2 ? null : "10"),
    totalTokens: { value: 0, status: "complete", reasons: [] },
  }));
  const model = presentOverview(data, dates[2]);
  assert.deepEqual(model.chart.cost, [10, 0, null, null]);
  assert.deepEqual(model.chart.feedback!.series[0].values, model.chart.cost);
  assert.deepEqual(trendGaps(model.chart.feedback!), [
    { start: 2, end: 2, label: "사용량 확인 불가" },
  ]);
  assert.equal(model.chartStatus?.label, "일부 날짜 확인 불가");
});
