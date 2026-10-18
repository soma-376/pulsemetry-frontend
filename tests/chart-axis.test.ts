import assert from "node:assert/strict";
import { test } from "node:test";
import { costAxisLabel, trendAxisMax } from "../src/lib/metrics/chart-axis";
import { yAt } from "../src/components/charts/scale";

test("센트 미만 양수도 차트 높이를 사용하고 null은 축 최댓값에 포함하지 않는다", () => {
  for (const headroom of [1.15, 1.08]) {
    const max = trendAxisMax([0, null, 0.0008, 0.0004], headroom);
    assert.equal(max, 0.0008 * headroom);
    assert.ok(yAt(0.0008, { max }) < 15);
    assert.equal(yAt(0, { max }), 100);
  }
});

test("0·null만 있거나 빈 계열이어도 유효한 축을 유지한다", () => {
  for (const values of [[], [0, 0], [null, null], [0, null]]) {
    assert.equal(trendAxisMax(values, 1.15), 1);
  }
});

test("소액 축의 위·중간·0 눈금은 구분되며 일반 금액은 기존 두 자리 표시다", () => {
  for (const max of [0.008, 0.0008, 0.00000115]) {
    const labels = [max, max / 2, 0].map((value) => costAxisLabel(value, max));
    assert.equal(new Set(labels).size, 3);
    assert.ok(Number(labels[0].slice(1)) > Number(labels[1].slice(1)));
    assert.ok(Number(labels[1].slice(1)) > 0);
  }
  assert.equal(costAxisLabel(0.008, 0.008), "$0.008");
  assert.equal(costAxisLabel(0.004, 0.008), "$0.004");
  assert.equal(costAxisLabel(1234.5, 2469), "$1,234.50");
});
