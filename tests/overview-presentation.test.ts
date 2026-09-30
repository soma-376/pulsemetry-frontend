import assert from "node:assert/strict";
import { test } from "node:test";
import example from "../docs/api/overview-response.example.json";
import { overviewSchema } from "../src/lib/api/overview";
import { presentOverview } from "../src/lib/metrics/overview-presentation";
import { nullableLinePath } from "../src/components/charts/scale";

test("기존 5개 지표에 서버 값을 연결하며 미제공 값은 0으로 바꾸지 않는다", () => {
  const data = overviewSchema.parse(example);
  data.usage.current!.equivalentCostUsd = "0.525980";
  data.usage.current!.tokens.total = null;
  data.alerts.availability = "unavailable";
  const model = presentOverview(data);
  assert.deepEqual(model.kpis.map((kpi) => kpi.label), ["사용 관측 인원", "토큰 비용", "월 좌석 계약액", "세션", "보안 경보 및 알림"]);
  assert.equal(model.kpis[1].value, "$0.53");
  assert.equal(model.kpis[1].unit, " / -");
  assert.equal(model.kpis[2].value, "-");
  assert.equal(model.kpis[4].value, "-");
  assert.equal(data.usage.current!.equivalentCostUsd, "0.525980");
  assert.equal(model.attribution.rows[0].vendors, null);
  assert.deepEqual(model.vendorOverview.rows, []);
});
test("미관측 날짜를 원래 차트에서 연결하지 않고 단일 모델은 단일 모델 카드 데이터를 유지한다", () => {
  const data = overviewSchema.parse(example);
  data.trend.points[1].observation = "unobserved";
  data.trend.points[1].equivalentCostUsd = "123";
  data.modelMix.models = [data.modelMix.models[0]];
  const model = presentOverview(data);
  assert.equal(model.chart.cost[1], null);
  assert.equal(model.chart.ticks.length, data.meta.dayCount);
  assert.equal(model.mix.count, 1);
  assert.equal(model.mix.rows[0].shareText, "100.0%");
  assert.equal(nullableLinePath([1, null, 3, 0], { max: 4 }), "M0,75 M66.67,25 L100,100");
});
test("비용이 누락된 모델은 목록에 유지하고 도넛 비중을 만들지 않는다", () => {
  const data = overviewSchema.parse(example);
  data.modelMix.models = data.modelMix.models.slice(0, 2);
  data.modelMix.models[0].equivalentCostUsd = null;
  data.modelMix.models[0].displayName = "unknown-model";
  const model = presentOverview(data);
  assert.equal(model.mix.rows.length, 2);
  assert.ok(model.mix.rows.some((row) => row.name === "unknown-model" && row.costText === "-"));
  assert.deepEqual(model.mix.slices, []);
  assert.equal(model.mix.topShare, "-");
});
test("두 기간이 모두 완전하면 서버의 이전 값으로 증감·이전 값·팀 증가 기여를 그린다", () => {
  const model = presentOverview(overviewSchema.parse(example));
  const [users, cost, , sessions] = model.kpis;
  // 100명 ← 90명, $5,000 ← $4,000, 1,000회 ← 800회(예시 응답).
  assert.deepEqual([users.delta, users.up, users.showDelta, users.showArrow, users.previousText], ["11.1%", true, true, true, "90명"]);
  assert.deepEqual([cost.delta, cost.previousText, sessions.delta, sessions.previousText], ["25.0%", "$4,000.00", "25.0%", "800"]);
  assert.ok(model.kpis.every((kpi) => !kpi.noDelta));
  assert.equal(model.compareLabel, "전주 대비");
  assert.equal(model.attribution.comparable, true);
  assert.deepEqual(model.attribution.rows.map((row) => [row.team, row.changeText, row.contribText]),
    [["플랫폼", "+42.9%", "+$600.00"], ["결제", "+16.7%", "+$200.00"], ["데이터", "+14.3%", "+$100.00"]]);
  assert.deepEqual([model.attribution.unmapped.changeText, model.attribution.unmapped.contribText], ["변화 없음", "+$0.00"]);
});
test("완전한 이전 기간에 사용이 없었으면 0% 대신 신규·변화 없음이고 화살표가 없다", () => {
  const data = overviewSchema.parse(example);
  data.usage.previous = { ...data.usage.previous!, activeUsers: 0, equivalentCostUsd: "0", sessionCount: 0 };
  data.usage.current!.sessionCount = 0;
  const [users, cost, , sessions] = presentOverview(data).kpis;
  assert.deepEqual([users.delta, users.showArrow, users.showDelta], ["신규", false, true]);
  assert.equal(cost.delta, "신규");
  assert.deepEqual([sessions.delta, sessions.showArrow], ["변화 없음", false]);
});
test("비교를 내지 않으면 사유를 보여 주고 0%로 그리지 않는다", () => {
  const data = overviewSchema.parse(example);
  data.comparison = { ...data.comparison, status: "unavailable", reason: "source_not_available", coverage: { status: "partial", observedDays: 5 } };
  data.usage.previous = null;
  data.teamUsage.topTeams.forEach((team) => { team.previous = null; });
  let model = presentOverview(data);
  const compared = model.kpis.filter((_, index) => index !== 2 && index !== 4);
  assert.ok(compared.every((kpi) => kpi.noDelta && !kpi.showDelta && kpi.previousText === undefined));
  assert.equal(compared[0].noDeltaReason, "비교 기간(2026-08-31 ~ 2026-09-06)에 수집 근거가 완전하지 않은 날이 있습니다");
  assert.equal(model.attribution.comparable, false);
  assert.ok(model.attribution.rows.every((row) => row.changeText === "비교 불가" && row.contribText === "-"));

  // 선택 기간이 완전하지 않으면 그것이 이유다. 확정된 마지막 날은 dataThrough(다음 날 자정)의 전날이다.
  data.meta.currentCoverage = { status: "partial", observedDays: 6 };
  data.meta.dataThrough = "2026-09-10T15:00:00Z";
  model = presentOverview(data);
  assert.equal(model.kpis[0].noDeltaReason, "선택 기간에 수집 근거가 완전하지 않은 날이 있습니다");
  assert.equal(model.observation.coverageNote, "선택 7일 중 6일 관측 · 9월 10일까지 확정");

  // 비교 없음을 고르면 증감도 사유도 없다.
  data.comparison = { mode: "none", status: "disabled", reason: null, startDate: null, endDate: null, coverage: null };
  model = presentOverview(data);
  assert.ok(model.kpis.every((kpi) => !kpi.noDelta && !kpi.showDelta));
});
test("서버가 비교를 냈더라도 선택 기간이 완전하지 않으면 비교하지 않고 그 이유를 말한다", () => {
  const data = overviewSchema.parse(example);
  data.meta.currentCoverage = { status: "partial", observedDays: 7 };
  const model = presentOverview(data);
  assert.ok(model.kpis.filter((_, index) => index !== 2 && index !== 4).every((kpi) => kpi.noDelta && kpi.noDeltaReason === "선택 기간에 수집 근거가 완전하지 않은 날이 있습니다"));
  assert.equal(model.attribution.comparable, false);
});
