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
  evidence: { kind: "usage", targetName: "claude-opus-4" },
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
      status: "partial",
      reasons: ["period_incomplete"],
      asOf: "2026-09-14T00:00:00Z",
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
          evidence: {
            kind: "spend",
            startDate: "2026-09-07",
            endDate: "2026-09-13",
            currentCostUsd: "14.000000",
            previousCostUsd: "10.000000",
            increaseRatio: 0.4,
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
    alertReasonText(page.evaluation.reasons[0]),
    "비교 기간 데이터 부족",
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
    evidence: { kind: "usage", targetName: "ChatGPT / Codex (OpenAI)" },
  };
  const parsed = alertsResponseSchema.parse({
    meta: {
      organizationId: "o",
      snapshotId: "s",
      asOf: "2026-10-04T00:00:00Z",
    },
    evaluation: {
      status: "complete",
      reasons: [],
      asOf: "2026-10-04T00:00:00Z",
    },
    alerts: { items: [product], totalCount: 1, nextCursor: null },
  }).alerts.items[0];
  assert.equal(
    alertSummary(parsed),
    "제품 ChatGPT / Codex (OpenAI) · 3건 · 구성원 2명",
  );
  assert.equal(
    alertSummary({ ...parsed, evidence: null }),
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

test("현재 알림 건수는 기간별 개요 KPI에 섞지 않는다", () => {
  const data = overviewSchema.parse(example);
  const before = presentOverview(data).kpis;
  const responseWithExtra = {
    ...data,
    alerts: {
      availability: "available",
      reason: null,
      asOf: "2026-09-14T00:30:00Z",
      unacknowledgedTotal: 3,
      security: 2,
      cost: 1,
    },
  };
  assert.deepEqual(
    presentOverview(overviewSchema.parse(responseWithExtra)).kpis,
    before,
  );
  assert.equal("alerts" in overviewSchema.parse(responseWithExtra), false);
});

test("알림은 임의 summary 없이 화면용 근거를 검증하고 누락된 비용을 0으로 표시하지 않는다", () => {
  const page = {
    meta: {
      organizationId: "o",
      snapshotId: "s",
      asOf: "2026-10-04T00:00:00Z",
    },
    evaluation: {
      status: "unavailable",
      reasons: ["evaluation_pending"],
      asOf: null,
    },
    alerts: {
      items: [
        item({ ruleId: "spend_spike", category: "cost", evidence: null }),
      ],
      totalCount: 1,
      nextCursor: null,
    },
  };
  const parsed = alertsResponseSchema.parse(page);
  assert.equal(
    alertSummary(parsed.alerts.items[0]),
    "비용 정보를 확인할 수 없습니다",
  );
  assert.throws(() =>
    alertsResponseSchema.parse({
      ...page,
      alerts: {
        ...page.alerts,
        items: [
          item({
            evidence: {
              kind: "spend",
              startDate: "2026-10-01",
              endDate: "2026-10-02",
              currentCostUsd: "NaN",
              previousCostUsd: "10",
              increaseRatio: 0.4,
            },
          }),
        ],
      },
    }),
  );
  assert.equal("summary" in parsed.alerts.items[0], false);
});
