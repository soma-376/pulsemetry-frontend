import assert from "node:assert/strict";
import test from "node:test";
import { deltaTone } from "../src/lib/metrics/deltas";

test("증감 색은 지표와 상관없이 오르면 빨강, 내리면 파랑이다", () => {
  assert.equal(deltaTone(0.001), "var(--red)");
  assert.equal(deltaTone(0.25), "var(--red)");
  assert.equal(deltaTone(-0.001), "var(--blue)");
  assert.equal(deltaTone(-0.25), "var(--blue)");
});

test("0·계산할 수 없는 변화는 회색이다", () => {
  assert.equal(deltaTone(0), "var(--text2)");
  assert.equal(deltaTone(null), "var(--text2)");
  assert.equal(deltaTone(Number.POSITIVE_INFINITY), "var(--text2)");
});
