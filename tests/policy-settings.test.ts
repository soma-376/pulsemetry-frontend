import { test } from "node:test";
import assert from "node:assert/strict";
import example from "../docs/api/settings-response.example.json";
import { settingsSchema } from "../src/lib/api/settings";
import { policySavedSchema } from "../src/lib/api/management";
import type { Operation } from "../src/lib/api/operations";
import {
  cleanupView,
  isShortening,
  retentionBoundary,
  retentionLabel,
  seoulToday,
} from "../src/lib/policy-settings";

/* 기대값은 백엔드 명세 §13.2(집계 보존 단축 → 보존 정리 요청)와 대시보드 명세 "작업 상태 조회"의 규칙에서 쓴다. */

test("줄였는가: 유한 값이 작아졌거나 무기한에서 유한으로 — 늘렸거나 무기한으로 바꾸면 아니다", () => {
  assert.deepEqual(
    [
      isShortening(24, 12),
      isShortening(null, 36),
      isShortening(12, 24),
      isShortening(24, null),
      isShortening(null, null),
      isShortening(12, 12),
    ],
    [true, true, false, false, false, false],
  );
  assert.deepEqual(
    [retentionLabel(null), retentionLabel(24)],
    ["무기한", "24개월"],
  );
});

test("삭제 경계는 저장한 날(KST)에서 N개월 전 같은 날이고, 그 날이 없는 달이면 말일이다", () => {
  assert.equal(retentionBoundary("2026-10-01", 12), "2025-10-01");
  assert.equal(retentionBoundary("2026-01-15", 24), "2024-01-15");
  assert.equal(retentionBoundary("2026-03-31", 1), "2026-02-28");
  assert.equal(retentionBoundary("2028-03-31", 1), "2028-02-29");
  assert.equal(retentionBoundary("2026-05-31", 36), "2023-05-31");
  // 서울 날짜 — UTC 로는 전날인 시각도 서울의 날짜를 쓴다.
  assert.equal(seoulToday(new Date("2026-09-30T15:30:00Z")), "2026-10-01");
});

const operation = (
  status: Operation["status"],
  extra: Partial<Operation> = {},
): Operation => ({
  operationId: "op-1",
  kind: "retention_cleanup",
  status,
  createdAt: "2026-10-01T00:00:00Z",
  completedAt: null,
  results: [
    {
      targetId: "analysis_source",
      status: "pending",
      reason: null,
      action: null,
    },
  ],
  canRestore: false,
  restoreUntil: null,
  retention: null,
  ...extra,
});
const run = (
  status: "running" | "incomplete" | "logically_deleted" | "failed",
  deletedBefore: string | null = null,
) => ({
  status,
  requestedBefore: "2025-09-30T15:00:00Z",
  deletedBefore,
  startedAt: "2026-10-01T00:00:00Z",
  finishedAt: null,
});

test("정리 상태는 서버의 작업 상태와 가장 최근 삭제 실행을 그대로 옮긴다 — 완료는 서버가 succeeded 일 때뿐이다", () => {
  assert.equal(cleanupView(operation("pending")).tone, "pending");
  assert.equal(cleanupView(operation("running")).text, "정리 진행 중");
  assert.match(
    cleanupView(operation("running", { retention: run("incomplete") })).text,
    /정리 미완/,
  );
  assert.match(
    cleanupView(operation("running", { retention: run("failed") })).text,
    /다음 실행에서 다시 시도/,
  );
  // 경계는 KST 날짜로 보인다(2025-09-30T15:00Z = 2025-10-01 00:00 KST).
  const done = cleanupView(
    operation("succeeded", {
      retention: run("logically_deleted", "2025-09-30T15:00:00Z"),
    }),
  );
  assert.deepEqual(
    [done.tone, done.text],
    ["done", "정리 완료 · 2025-10-01 이전 분석 원본을 지웠습니다(논리 삭제)"],
  );
  const failed = (reason: string) =>
    cleanupView(
      operation("failed", {
        results: [
          {
            targetId: "analysis_source",
            status: "failed",
            reason,
            action: null,
          },
        ],
      }),
    );
  assert.equal(
    failed("superseded").text,
    "새 설정으로 대체되어 실행하지 않았습니다",
  );
  assert.match(
    failed("retention_incomplete").text,
    /정해진 횟수 안에 끝나지 않았습니다/,
  );
  assert.match(failed("retention_failed").text, /삭제 실행이 실패했습니다/);
  assert.equal(failed("retention_failed").tone, "failed");
});

test("설정 응답과 저장 응답은 요청서의 계약대로 읽힌다 — 원문을 보내지 않은 저장의 null 도 받는다", () => {
  const settings = settingsSchema.parse(example);
  assert.deepEqual(
    [
      settings.collectionPolicy.settingsVersion,
      settings.collectionPolicy.options.aggregateRetentionMonths,
    ],
    [2, [12, 24, 36, null]],
  );
  const saved = policySavedSchema.parse({
    version: 0,
    collectRawContent: null,
    confirmedAt: null,
    application: "future_enrollments",
    existingInstallationsUpdated: false,
    reclaimIdleDays: null,
    aggregateRetentionMonths: 12,
    settingsVersion: 1,
    settingsUpdatedAt: "2026-10-01T00:00:00Z",
    cleanupOperationId: "op-1",
  });
  assert.equal(saved.cleanupOperationId, "op-1");
});
