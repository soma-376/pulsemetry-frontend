import {
  valueStatus,
  reasonsText,
} from "../src/lib/metrics/overview-presentation";
import assert from "node:assert/strict";
import { test } from "node:test";
import example from "../docs/api/overview-response.example.json";
import { overviewSchema, type OverviewValue } from "../src/lib/api/overview";
import { presentOverview } from "../src/lib/metrics/overview-presentation";
import { nullableLinePath } from "../src/components/charts/scale";
const data = () => overviewSchema.parse(example);
const value = <T>(v: T | null, reasons: string[] = []): OverviewValue<T> => ({
  value: v,
  status: v === null ? "unavailable" : reasons.length ? "partial" : "complete",
  reasons,
});
const unavailable = {
  status: "unavailable" as const,
  reasons: ["previous_period_incomplete"],
  previousValue: null,
  absoluteChange: null,
  percentChange: null,
  change: null,
};
test("KPI 5개는 파생값을 재계산하지 않고 서버 값을 표시한다", () => {
  const d = data();
  d.summary!.equivalentCostUsd.value = "0.525980";
  d.summary!.equivalentCostPerUserUsd.value = "1.2345";
  d.summary!.totalTokens = {
    ...value<number>(null, ["token_data_incomplete"]),
    comparison: unavailable,
  };
  const m = presentOverview(d);
  assert.deepEqual(
    m.kpis.map((k) => k.label),
    ["사용자 수", "사용 환산액", "세션 수", "사용자당 환산액", "총 토큰 수"],
  );
  assert.equal(m.kpis[1].value, "$0.53");
  assert.equal(m.kpis[3].value, "$1.23");
  assert.equal(m.kpis[4].value, "-");
  assert.equal(m.kpis[2].unit, "개");
  assert.equal("vendorOverview" in m, false);
});
test("팀의 관측 제품과 미확인 제품은 유지하고 계약·제품별 집계는 제거한다", () => {
  const d = data(),
    m = presentOverview(d);
  assert.deepEqual(m.attribution.rows[0].vendors, [
    "Claude (Anthropic)",
    "ChatGPT / Codex (OpenAI)",
  ]);
  assert.deepEqual(m.attribution.unmappedVendors, [
    "Claude (Anthropic)",
    "미확인 제품",
  ]);
  assert.equal("productUsage" in d, false);
  assert.equal("seats" in d, false);
});
test("미관측 날짜는 연결하지 않고 단일 모델 비중은 서버 값을 사용한다", () => {
  const d = data();
  d.trend!.points[1].observation = "unobserved";
  d.modelMix!.models = [{ ...d.modelMix!.models[0], costShare: value(1) }];
  const m = presentOverview(d);
  assert.equal(m.chart.cost[1], null);
  assert.equal(m.chart.ticks.length, d.meta.dayCount);
  assert.equal(m.mix.count, 1);
  assert.equal(m.mix.rows[0].shareText, "100.0%");
  assert.equal(
    nullableLinePath([1, null, 3, 0], { max: 4 }),
    "M0,75 M66.67,25 L100,100",
  );
});
test("토큰이 누락돼도 서버가 확인한 금액 비중은 보여준다", () => {
  const d = data();
  d.modelMix!.models = d.modelMix!.models.slice(0, 2).map((m, i) => ({
    ...m,
    costShare: value(i ? 0.25 : 0.75),
    totalTokens: value<number>(null, ["token_data_incomplete"]),
    effectiveCostPerMillionTokensUsd: value<string>(null, [
      "token_data_incomplete",
    ]),
  }));
  const m = presentOverview(d);
  assert.deepEqual(
    m.mix.slices.map((s) => s.share),
    [75, 25],
  );
  assert.ok(m.mix.rows.every((r) => r.perMText === "-"));
});
test("금액 누락과 비중 산출 불가 상태는 목록에 남고 도넛은 생략한다", () => {
  const d = data();
  d.modelMix!.models = d.modelMix!.models.slice(0, 2).map((m) => ({
    ...m,
    costShare: value<number>(null, ["pricing_missing"]),
  }));
  d.modelMix!.models[0].equivalentCostUsd = value<string>(null, [
    "pricing_missing",
  ]);
  const m = presentOverview(d);
  assert.equal(m.mix.rows.length, 2);
  assert.ok(m.mix.rows.some((r) => r.costText === "-"));
  assert.deepEqual(m.mix.slices, []);
});
test("두 기간이 완전한 지표는 서버 증감·이전 값·팀 변화액을 표시한다", () => {
  const m = presentOverview(data());
  assert.equal(m.kpis[0].delta, "11.1%");
  assert.equal(m.kpis[0].previousText, "90명");
  assert.equal(m.kpis[3].delta, "12.5%");
  assert.equal(m.kpis[3].previousText, "$44.44");
  assert.equal(m.attribution.rows[0].contribText, "+$600.00");
  assert.equal(m.attribution.rows[0].changeText, "+42.9%");
});
test("신규·변화 없음은 0분모 증감률이나 화살표로 대체하지 않는다", () => {
  const d = data();
  d.summary!.activeUsers.comparison = {
    status: "available",
    reasons: [],
    previousValue: 0,
    absoluteChange: 100,
    percentChange: null,
    change: "new",
  };
  d.summary!.sessionCount.comparison = {
    status: "available",
    reasons: [],
    previousValue: 0,
    absoluteChange: 0,
    percentChange: 0,
    change: "unchanged",
  };
  const m = presentOverview(d);
  assert.equal(m.kpis[0].delta, "신규");
  assert.equal(m.kpis[0].showArrow, false);
  assert.equal(m.kpis[2].delta, "변화 없음");
  assert.equal(m.kpis[2].showArrow, false);
});
test("비교 불가 사유는 지표마다 다르게 표시하고 값의 상태와 분리한다", () => {
  const d = data();
  d.summary!.activeUsers.comparison = unavailable;
  d.summary!.equivalentCostUsd.comparison = {
    ...unavailable,
    reasons: ["pricing_missing"],
  };
  const m = presentOverview(d);
  assert.match(m.kpis[0].noDeltaReason, /비교 기간/);
  assert.match(m.kpis[1].noDeltaReason, /단가/);
  assert.equal(m.kpis[0].valueStatus, undefined);
  assert.equal(m.kpis[0].showDelta, false);
  assert.equal(m.kpis[2].showDelta, true);
});
test("서버가 제공한 지표 상태를 따르며 전역 관측 상태로 덮어쓰지 않는다", () => {
  const d = data();
  d.meta.currentCoverage = { status: "partial", observedDays: 7 };
  d.summary!.activeUsers = {
    ...d.summary!.activeUsers,
    status: "partial",
    reasons: ["member_identity_missing"],
    comparison: unavailable,
  };
  const m = presentOverview(d);
  assert.match(m.kpis[0].valueStatus!.reason, /구성원/);
  assert.equal(m.kpis[1].valueStatus, undefined);
});
test("좌석 후보는 개요 API와 표시 모델에서 제외한다", () => {
  const d = data();
  assert.equal("seats" in d, false);
  assert.equal("vendorOverview" in presentOverview(d), false);
});
test("평균 산출 불가는 null과 사유, 실제 0원은 0으로 표시한다", () => {
  const d = data();
  d.summary!.equivalentCostPerUserUsd = {
    ...value<string>(null, ["zero_denominator"]),
    comparison: unavailable,
  };
  assert.equal(presentOverview(d).kpis[3].value, "-");
  d.summary!.equivalentCostPerUserUsd = {
    ...value("0"),
    comparison: unavailable,
  };
  assert.equal(presentOverview(d).kpis[3].value, "$0.00");
});
test("비교 없음에서도 현재 값의 부분 관측·누락은 유지한다", () => {
  const d = data();
  d.comparison.mode = "none";
  for (const m of Object.values(d.summary!))
    if ("comparison" in m)
      m.comparison = {
        status: "disabled",
        reasons: [],
        previousValue: null,
        absoluteChange: null,
        percentChange: null,
        change: null,
      };
  d.summary!.sessionCount = {
    ...d.summary!.sessionCount,
    ...value(0, ["current_period_incomplete"]),
  };
  d.summary!.totalTokens = {
    ...d.summary!.totalTokens,
    ...value<number>(null, ["token_data_incomplete"]),
  };
  const m = presentOverview(d);
  assert.equal(m.kpis[2].value, "0");
  assert.equal(m.kpis[2].valueStatus!.label, "관측 근거 부족");
  assert.equal(m.kpis[4].valueStatus!.label, "값 확인 불가");
  assert.ok(m.kpis.every((k) => !k.noDelta && !k.showDelta));
});
test("추이 부분 실패는 다른 지표를 보존하고 빈 기간은 팀 요약까지 숨긴다", () => {
  const d = data();
  d.trend = null;
  d.errors = [
    { section: "trend", code: "source_unavailable", retryable: true },
  ];
  assert.equal(overviewSchema.safeParse(d).success, true);
  const m = presentOverview(d);
  assert.equal(m.kpis.length, 5);
  assert.equal(m.mix.count, 5);
  assert.equal(m.chart.cost.length, 0);
  d.meta.dataState = "no_data";
  d.summary = null;
  d.modelMix = null;
  d.teamUsage = null;
  d.errors = [];
  assert.equal(overviewSchema.safeParse(d).success, true);
  assert.equal(presentOverview(d).attribution.show, false);
});

test("집계 대기와 수집 공백의 배지 및 비교 기간 사유를 구분한다", () => {
  const pending = ["current_period_incomplete", "period_pending"];
  assert.equal(
    valueStatus({ value: 10, status: "partial", reasons: pending })?.label,
    "집계 중",
  );
  assert.equal(
    valueStatus({
      value: 10,
      status: "partial",
      reasons: [...pending, "collection_gap"],
    })?.label,
    "관측 근거 부족",
  );
  assert.equal(
    valueStatus({
      value: null,
      status: "unavailable",
      reasons: [...pending, "token_data_incomplete"],
    })?.label,
    "값 확인 불가",
  );
  assert.equal(
    valueStatus({
      value: 10,
      status: "partial",
      reasons: ["member_identity_missing"],
    })?.label,
    "일부 집계",
  );
  assert.match(
    reasonsText(["previous_period_incomplete", "previous_collection_gap"]),
    /비교 기간:.*보고 공백/,
  );
  assert.doesNotMatch(reasonsText(pending), /근거가 완전하지/);
  assert.equal(reasonsText([...pending, ...pending]), reasonsText(pending));
});
