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
