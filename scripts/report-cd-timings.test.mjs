import assert from "node:assert/strict";
import { test } from "node:test";
import { timingReport } from "./report-cd-timings.mjs";

const at = (seconds) =>
  new Date(Date.UTC(2026, 10, 4, 0, 0, seconds)).toISOString();
const run = {
  id: 42,
  run_attempt: 2,
  created_at: at(0),
  run_started_at: at(300),
};

test("재실행 시작 기준으로 큐 대기를 계산하고 병렬 CI 시간을 합산하지 않는다", () => {
  const report = timingReport(run, [
    {
      name: "Verify release commit / lint",
      started_at: at(310),
      completed_at: at(340),
      conclusion: "success",
    },
    {
      name: "Verify release commit / test",
      started_at: at(315),
      completed_at: at(350),
      conclusion: "success",
    },
    {
      name: "Verify release commit / build",
      started_at: at(0),
      completed_at: at(0),
      conclusion: "skipped",
    },
    { name: "Report CD timings", started_at: at(400), completed_at: at(500) },
  ]);
  assert.match(report, /첫 작업 시작 전 대기 \| 0분 10초/);
  assert.match(report, /CI 검증 \| 0분 40초/);
  assert.match(report, /배포 작업 종료까지 \(대기 포함\) \| 0분 50초/);
});

test("실패한 단계의 소요 시간을 보존하고 건너뛴 배포를 성공으로 보고하지 않는다", () => {
  const report = timingReport(run, [
    {
      name: "publish image and deploy ECS",
      started_at: at(320),
      completed_at: at(390),
      steps: [
        {
          name: "Build image with public environment",
          started_at: at(330),
          completed_at: at(380),
          conclusion: "failure",
        },
        {
          name: "Deploy image and verify running digest",
          started_at: at(380),
          completed_at: at(380),
          conclusion: "skipped",
        },
      ],
    },
  ]);
  assert.match(
    report,
    /배포 이미지 빌드 \(캐시 복원·저장 포함\) \| 0분 50초 \| failure/,
  );
  assert.match(report, /ECS 교체·실행 digest 확인 \| — \| skipped/);
  assert.match(report, /ECR 업로드·digest 확인 \| — \| 미실행/);
});

test("실행되지 않은 작업과 누락된 시간은 0초로 오인하지 않는다", () => {
  const report = timingReport(run, [
    { name: "publish image and deploy ECS", conclusion: "skipped" },
  ]);
  assert.match(report, /첫 작업 시작 전 대기 \| —/);
  assert.match(report, /CI 검증 \| —/);
  assert.doesNotMatch(report, /NaN|undefined|0분 0초/);
});
