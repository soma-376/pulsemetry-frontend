import assert from "node:assert/strict";
import test from "node:test";
import { timeAxisLayout } from "../src/lib/metrics/time-axis";

test("24시간·60구간 눈금은 좁은 폭에서도 양끝을 보존하고 겹치지 않는다", () => {
  for (const count of [24, 60]) {
    // 개요의 마지막 bucketStart는 선택 기간 끝보다 앞에 있다.
    const positions = Array.from(
      { length: count },
      (_, i) => (i / count) * 100,
    );
    const widths = positions.map((_, i) => (i % 2 ? 72 : 65));
    for (const available of [1100, 701, 500, 300, 190, 80, 40]) {
      const { ticks, stacked } = timeAxisLayout(positions, widths, available);
      assert.equal(ticks[0].index, 0);
      assert.equal(ticks.at(-1)?.index, count - 1);
      assert.equal(new Set(ticks.map((tick) => tick.index)).size, ticks.length);
      for (const [i, tick] of ticks.entries()) {
        assert.ok(tick.left >= 0);
        assert.ok(tick.left + tick.width <= available);
        if (!stacked && i > 0)
          assert.ok(ticks[i - 1].left + ticks[i - 1].width + 8 <= tick.left);
      }
    }
  }
});

test("짧은 마지막 구간과 같은 시각의 중간 눈금은 끝 눈금을 덮지 않는다", () => {
  const positions = [4, 25, 50, 75, 99, 99];
  const { ticks, stacked } = timeAxisLayout(
    positions,
    positions.map(() => 60),
    600,
  );
  assert.equal(stacked, false);
  assert.deepEqual(
    ticks.map((tick) => tick.index),
    [0, 1, 2, 3, 5],
  );
  // 팀의 첫 bucketEnd와 진행 중 asOf 좌표를 0/100으로 재정규화하지 않는다.
  assert.equal(ticks[0].left, 24);
  assert.equal(ticks.at(-1)?.left, 534);
});

test("한 점은 중앙에 한 번만 표시하고 라벨보다 좁으면 줄바꿈한다", () => {
  assert.deepEqual(timeAxisLayout([50], [60], 200), {
    stacked: false,
    ticks: [{ index: 0, left: 70, width: 60 }],
  });
  assert.deepEqual(timeAxisLayout([50], [60], 40), {
    stacked: true,
    ticks: [{ index: 0, left: 0, width: 40 }],
  });
});

test("빈 구간이나 측정할 수 없는 폭은 눈금을 만들지 않는다", () => {
  assert.deepEqual(timeAxisLayout([], [], 300).ticks, []);
  assert.deepEqual(timeAxisLayout([0, 100], [60, 60], 0).ticks, []);
});
