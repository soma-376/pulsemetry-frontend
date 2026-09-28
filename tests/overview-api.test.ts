import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import example from "../docs/api/overview-response.example.json";
import { DashboardError, fetchOverview, overviewQueryOptions, overviewSchema, retryAfterMs, shouldRetryOverview, type OverviewParams } from "../src/lib/api/overview";
import { changeText, groupModels, moneyText, numeric, trendSegments } from "../src/lib/api/overview-format";

const params: OverviewParams = { organizationId: example.meta.organizationId, startDate: example.meta.startDate, endDate: example.meta.endDate, timeZone: "Asia/Seoul", compare: "prev_week" };

test("금액 null과 0을 구분하고 이전 0과 비교 불가를 표시한다", () => {
  assert.equal(numeric(null), null);
  assert.equal(moneyText(null), "-");
  assert.equal(moneyText("0.000000"), "$0.00");
  assert.equal(changeText(1, 0, "available"), "신규");
  assert.equal(changeText(0, 0, "available"), "변화 없음");
  assert.equal(changeText(20, 10, "unavailable"), "비교 불가");
  assert.equal(changeText(20, 10, "available"), "+100.0%");
});

test("차트는 중간 미관측을 연결하거나 0으로 채우지 않는다", () => {
  const data = overviewSchema.parse(example);
  const points = data.trend.points.slice(0, 3);
  points[1] = { ...points[1], observation: "unobserved", equivalentCostUsd: null, totalTokens: null };
  assert.deepEqual(trendSegments(points, "equivalentCostUsd").map((segment) => segment.map((entry) => entry.index)), [[0], [2]]);
  assert.equal(trendSegments(points, "allocatedSeatCostUsd").length, 1);
  points[1] = { ...points[1], observation: "complete", equivalentCostUsd: "0" };
  assert.equal(trendSegments(points, "equivalentCostUsd")[0][1].value, 0);
});

test("모델 기타 합계에도 모르는 비용과 토큰은 null을 유지한다", () => {
  const models = overviewSchema.parse(example).modelMix.models;
  models.push({ ...models[4], modelId: "unknown", equivalentCostUsd: null, totalTokens: null });
  const grouped = groupModels(models);
  assert.equal(grouped.length, 5);
  assert.equal(grouped[4].equivalentCostUsd, null);
  assert.equal(grouped[4].totalTokens, null);
  assert.equal(grouped[4].displayName, "기타 2개 모델");
});

test("조직·기간·시간대·비교 조건별 캐시를 분리한다", () => {
  const client = new QueryClient();
  const original = overviewQueryOptions(params);
  client.setQueryData(original.queryKey, overviewSchema.parse(example));
  for (const changed of [{ organizationId: "another" }, { startDate: "2026-09-08" }, { endDate: "2026-09-14" }, { compare: "none" as const }]) {
    assert.equal(client.getQueryData(overviewQueryOptions({ ...params, ...changed }).queryKey), undefined);
  }
  assert.deepEqual(original.queryKey[2], params);
  client.clear();
});

test("직접 호출에 필터와 취소 신호를 전달하고 응답 범위를 검증한다", async (context) => {
  const controller = new AbortController();
  context.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input);
    assert.equal(url.pathname, `/api/v1/organizations/${params.organizationId}/analytics/overview`);
    assert.equal(url.searchParams.get("compare"), "prev_week");
    assert.equal(init.signal, controller.signal);
    assert.equal(init.credentials, "omit");
    assert.equal(init.cache, "no-store");
    return Response.json(example);
  });
  assert.equal((await fetchOverview(params, controller.signal)).usage.current?.activeUsers, 100);
});

test("잘못된 스키마·조직·날짜 누락 응답을 성공 데이터로 캐시하지 않는다", async (context) => {
  const other = structuredClone(example);
  other.meta.organizationId = "wrong";
  const missing = structuredClone(example);
  missing.trend.points.splice(2, 1);
  for (const body of [{}, other, missing]) {
    const mock = context.mock.method(globalThis, "fetch", async () => Response.json(body));
    await assert.rejects(fetchOverview(params), (error) => error instanceof DashboardError && error.status === 422);
    mock.mock.restore();
  }
});

test("401은 재시도하지 않고 503과 네트워크 오류만 제한적으로 재시도한다", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ error: { code: "unauthenticated" } }, { status: 401 }));
  await assert.rejects(fetchOverview(params), (error) => error instanceof DashboardError && error.status === 401);
  for (const status of [400, 401, 403, 404, 422]) assert.equal(shouldRetryOverview(0, new DashboardError("", status)), false);
  assert.equal(shouldRetryOverview(0, new DashboardError("", 503)), true);
  assert.equal(shouldRetryOverview(2, new DashboardError("", 503)), false);
  assert.equal(shouldRetryOverview(0, new TypeError("network")), true);
  assert.equal(shouldRetryOverview(0, new DOMException("cancel", "AbortError")), false);
  assert.equal(shouldRetryOverview(0, new DashboardError("", 429, 120_000)), false);
  assert.equal(retryAfterMs("3"), 3000);
  assert.equal(retryAfterMs("Mon, 28 Sep 2026 00:00:05 GMT", Date.parse("2026-09-28T00:00:00Z")), 5000);
});
