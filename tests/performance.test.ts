import assert from "node:assert/strict";
import { test } from "node:test";
import { parseScope, type PerformanceView } from "../src/lib/api/performance";
import { performanceSample } from "../src/mocks/performance";
import {
  METRICS,
  presentSummary,
  rawPair,
} from "../src/lib/metrics/performance";
import {
  axisDomain,
  orgAverage,
  presentTrend,
  weekLabels,
  weeklySeries,
} from "../src/lib/metrics/performance-trend";

const period = {
  startDate: "2026-09-21",
  endDate: "2026-10-20",
  compare: "prev_period" as const,
};
const view = performanceSample(period);
const card = (key: string, scope: "all" | "platform" = "all") =>
  presentSummary(view, scope, { showDelta: true })
    .groups.flatMap((g) => g.cards)
    .find((c) => c.key === key)!;

test("완료한 작업은 성공(완료 티켓)과 실패한 작업을 합치고 성공률을 캡션에 보인다", () => {
  const done = card("done");
  assert.equal(done.value, "901");
  assert.equal(done.unit, "건");
  assert.equal(done.delta, "+11.8%");
  assert.equal(done.deltaColor, "var(--green)");
  assert.equal(done.previous, "806건");
  assert.equal(
    done.caption,
    "성공 486건 (완료 티켓) · 실패 415건 · 성공률 54%",
  );
});

test("비용·시간 지표는 줄어야 좋고 백분율 지표는 %p로 비교한다", () => {
  const cost = card("cycleCost");
  assert.equal(cost.value, "$30.09");
  assert.equal(cost.delta, "+20.7%");
  assert.equal(cost.deltaColor, "var(--red)");
  assert.equal(card("cycle").deltaColor, "var(--green)");
  assert.equal(card("ratio").value, "96.0");
  assert.equal(card("ratio").delta, "+8.9%p");
  assert.equal(
    card("waste").caption,
    "revert 14건 · hotfix 9건 · AI 비용의 9.4%",
  );
});

test("실패한 작업은 네 종류와 합계를 이전 기간과 비교한다", () => {
  const summary = presentSummary(view, "all", { showDelta: true });
  assert.deepEqual(
    summary.failures.map((f) => f.label),
    [
      "CI 실패",
      "릴리스 실패 (롤백 포함)",
      "PR 반려 (머지 없이 닫힘)",
      "PR 방치 (7일 이상)",
    ],
  );
  assert.equal(summary.failureTotal.value, "415");
  assert.equal(summary.failureTotal.previous, "385건");
  assert.equal(summary.failureTotal.delta, "+7.8%");
});

test("비교하지 않으면 증감과 이전 값을 숨긴다", () => {
  const summary = presentSummary(view, "all", { showDelta: false });
  for (const kpi of summary.groups.flatMap((g) => g.cards)) {
    assert.equal(kpi.delta, null);
    assert.equal(kpi.previous, null);
  }
});

test("값이 없으면 -로 표시하고 증감을 만들지 않는다", () => {
  const missing: PerformanceView = {
    ...view,
    scopes: {
      ...view.scopes,
      all: {
        ...view.scopes.all,
        output: {
          ...view.scopes.all.output,
          cycleDays: { current: null, previous: 3.8 },
        },
      },
    },
  };
  assert.equal(rawPair(missing, "all", "cycle"), null);
  const cycle = presentSummary(missing, "all", { showDelta: true })
    .groups.flatMap((g) => g.cards)
    .find((c) => c.key === "cycle")!;
  assert.equal(cycle.value, "-");
  assert.equal(cycle.delta, null);
  assert.equal(
    presentTrend(missing, "all", "cycle", {
      endIso: period.endDate,
      showDelta: true,
    }),
    null,
  );
});

test("전체 평균은 건수·금액이면 팀당 평균, 비율·시간이면 조직 값이다", () => {
  const org = rawPair(view, "all", "done")!;
  assert.deepEqual(orgAverage(view, "done"), [org[0] / 4, org[1] / 4]);
  assert.deepEqual(orgAverage(view, "waste"), [1940 / 4, 1520 / 4]);
  assert.deepEqual(orgAverage(view, "cycle"), rawPair(view, "all", "cycle"));
});

test("건수 지표의 추이는 주별 합계, 비율 지표는 기간 값이다", () => {
  const done = weeklySeries(METRICS.done, [901, 806]);
  assert.equal(done.length, 8);
  assert.equal(done[0], (806 / 30) * 7);
  assert.deepEqual(weeklySeries(METRICS.cycle, [3.1, 3.8])[0], 3.8);
});

test("축은 값 주변에 여백을 두고 0 아래·100% 위로 넘지 않는다", () => {
  const percent = axisDomain([95, 97, 99], true);
  assert.ok(percent.max <= 100);
  const near = axisDomain([0.1, 0.2], false);
  assert.ok(near.min >= 0);
  const flat = axisDomain([5, 5, 5], false);
  assert.ok(flat.max > flat.min);
  const zero = axisDomain([0, 0], false);
  assert.deepEqual(zero, { min: 0, max: 1 });
});

test("주 라벨은 기간 마지막 주까지 8주의 월요일이다", () => {
  assert.deepEqual(weekLabels("2026-10-20"), [
    "8.31",
    "9.7",
    "9.14",
    "9.21",
    "9.28",
    "10.5",
    "10.12",
    "10.19",
  ]);
});

test("팀 범위의 추이는 전체 평균선과 평균 대비 타일을 함께 보인다", () => {
  const trend = presentTrend(view, "payments", "cycle", {
    endIso: period.endDate,
    showDelta: true,
  })!;
  assert.equal(trend.title, "사이클 타임 추이");
  assert.equal(trend.hasAverage, true);
  assert.ok(trend.averageLine);
  assert.deepEqual(
    trend.stats.map((s) => s.label),
    ["결제 팀 · 선택 기간", "전체 평균 · 선택 기간", "전체 평균 대비"],
  );
  assert.equal(trend.stats[2].value, "+9.7%");
  assert.equal(trend.stats[2].emphasis, "평균보다 나쁨");
  assert.equal(trend.stats[2].valueColor, "var(--red)");
  assert.equal(trend.points.length, 8);
  for (const point of trend.points) {
    assert.ok(point.y >= 0 && point.y <= 100);
  }
});

test("전체 범위의 추이는 평균선 없이 주별 범위를 보이고, 비교하지 않으면 증감을 뺀다", () => {
  const trend = presentTrend(view, "all", "done", {
    endIso: period.endDate,
    showDelta: false,
  })!;
  assert.equal(trend.averageLine, null);
  assert.equal(trend.stats[1].label, "주별 범위 · 8주");
  assert.equal(trend.stats[0].emphasis, "");
  assert.match(trend.meta, /주별 합계$/);
});

test("알 수 없는 범위는 전체로 본다", () => {
  assert.equal(parseScope("platform"), "platform");
  assert.equal(parseScope("foo"), "all");
  assert.equal(parseScope(null), "all");
});
