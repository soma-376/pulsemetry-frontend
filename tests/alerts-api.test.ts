import assert from "node:assert/strict";
import { test } from "node:test";
import example from "../docs/api/overview-response.example.json";
import {
  alertReasonText,
  alertsResponseSchema,
  alertSummary,
} from "../src/lib/api/alerts";
import { overviewSchema } from "../src/lib/api/overview";
import { settingsSchema } from "../src/lib/api/settings";
import settingsExample from "../docs/api/settings-response.example.json";
import { presentOverview } from "../src/lib/metrics/overview-presentation";

// 서버 ADR 0051 — 미확인 수·가용성·사유는 서버 값이고 화면은 세지 않는다.
const item = (overrides: Record<string, unknown>) => ({
  alertId: "a1",
  version: 2,
  ruleId: "model_not_allowed",
  category: "security",
  status: "open",
  occurredAt: "2026-09-10T01:00:00Z",
  lastSeenAt: "2026-09-10T11:00:00Z",
  windowStart: "2026-09-10T01:00:00Z",
  windowEnd: "2026-09-10T11:00:00Z",
  subject: "claude-opus-4",
  eventCount: 3,
  memberCount: 2,
  members: [
    { memberId: "m1", account: "a@example.test" },
    { memberId: "m2", account: null },
  ],
  summary: { model: "claude-opus-4", events: 3, threshold: 1 },
  acknowledgement: null,
  ...overrides,
});

test("알림 목록 응답을 읽고 요약은 서버 값만 쓴다", () => {
  const page = alertsResponseSchema.parse({
    meta: {
      organizationId: "o",
      snapshotId: "s",
      asOf: "2026-09-14T00:00:00Z",
    },
    evaluation: {
      availability: "available",
      reason: null,
      asOf: "2026-09-14T00:00:00Z",
      rules: [
        {
          ruleId: "spend_spike",
          enabled: true,
          evaluatedAt: "2026-09-14T00:00:00Z",
          status: "not_evaluated",
          reason: "period_incomplete",
          windowStart: null,
          windowEnd: null,
        },
      ],
    },
    alerts: {
      items: [
        item({}),
        item({
          alertId: "a2",
          ruleId: "spend_spike",
          category: "cost",
          status: "closed",
          subject: null,
          eventCount: null,
          memberCount: null,
          members: [],
          summary: {
            currentStartDate: "2026-09-07",
            currentEndDate: "2026-09-13",
            currentCostUsd: "14.000000",
            previousCostUsd: "10.000000",
            increaseRatio: 0.4,
            threshold: 0.4,
          },
        }),
      ],
      totalCount: 2,
      nextCursor: null,
    },
  });
  assert.equal(
    alertSummary(page.alerts.items[0]),
    "모델 claude-opus-4 · 3건 · 구성원 2명",
  );
  assert.equal(
    alertSummary(page.alerts.items[1]),
    "2026-09-07~2026-09-13 $14.00 · 앞 7일 $10.00 · +40%",
  );
  assert.equal(
    alertReasonText(page.evaluation.rules[0].reason),
    "두 기간 중 완전히 관측되지 않은 날이 있어 평가하지 않았습니다",
  );
  assert.equal(alertReasonText("new_reason"), "new_reason");
  assert.throws(() =>
    alertsResponseSchema.parse({
      ...page,
      alerts: { ...page.alerts, items: [item({ category: "other" })] },
    }),
  );
});

test("미등록 제품 알림은 서버의 제품명을 표시하고 제품명을 모르면 ID를 쓴다", () => {
  const product = {
    ...item({}),
    ruleId: "product_not_registered",
    subject: "openai_biz",
    summary: {
      productId: "openai_biz",
      productName: "ChatGPT / Codex (OpenAI)",
    },
  };
  const parsed = alertsResponseSchema.parse({
    meta: {
      organizationId: "o",
      snapshotId: "s",
      asOf: "2026-10-04T00:00:00Z",
    },
    evaluation: {
      availability: "available",
      reason: null,
      asOf: "2026-10-04T00:00:00Z",
      rules: [],
    },
    alerts: { items: [product], totalCount: 1, nextCursor: null },
  }).alerts.items[0];
  assert.equal(
    alertSummary(parsed),
    "제품 ChatGPT / Codex (OpenAI) · 3건 · 구성원 2명",
  );
  assert.equal(
    alertSummary({ ...parsed, summary: {} }),
    "제품 openai_biz · 3건 · 구성원 2명",
  );
  assert.equal(
    alertReasonText("registered_products_not_configured"),
    "계약 벤더의 제품을 먼저 등록하세요",
  );
});

test("설정은 현재 규칙의 판·가용성·사유를 읽는다", () => {
  const data = settingsSchema.parse(settingsExample);
  assert.deepEqual(
    data.alertRules.map((rule) => [
      rule.ruleId,
      rule.availability,
      rule.reason,
    ]),
    [
      ["spend_spike", "unavailable", "evaluation_not_configured"],
      ["quota_exceeded", "unavailable", "evaluation_not_configured"],
      ["product_not_registered", "available", null],
    ],
  );
  assert.equal("alertLists" in data, false);
});

test("개요 알림 KPI — 평가 전이면 서버 사유, 평가 뒤면 미확인 수·분류·평가 시각", () => {
  const data = overviewSchema.parse(example);
  data.alerts = {
    availability: "unavailable",
    reason: "evaluation_pending",
    asOf: "2026-09-14T00:00:00Z",
    unacknowledgedTotal: null,
    security: null,
    cost: null,
  };
  const pending = presentOverview(data).kpis[4];
  assert.equal(pending.value, "-");
  assert.equal(pending.caption, "규칙을 켰지만 아직 평가 전입니다");
  assert.equal(pending.bad, false);
  data.alerts = {
    availability: "available",
    reason: null,
    asOf: "2026-09-14T00:30:00Z",
    unacknowledgedTotal: 3,
    security: 2,
    cost: 1,
  };
  const counted = presentOverview(data).kpis[4];
  assert.equal(counted.value, "3");
  assert.match(
    counted.caption,
    /^현재 미확인 · 보안 2 · 비용 1 · 평가 2026\. 9\. 14\. 오전 9:30:00$/,
  );
  assert.equal(counted.bad, true);
});
