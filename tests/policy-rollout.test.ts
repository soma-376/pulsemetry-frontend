import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EVIDENCE_LABEL,
  evidenceTime,
  rolloutEvidenceText,
} from "../src/lib/policy-rollout";

test("요약은 근거별 수를 말하고 0대인 근거는 뺀다", () => {
  assert.equal(
    rolloutEvidenceText({ heartbeat: 10, appliedConfirmation: 0, none: 1 }),
    "근거: 설치 보고 10대 · 근거 없음 1대",
  );
  assert.equal(
    rolloutEvidenceText({ heartbeat: 1, appliedConfirmation: 2, none: 0 }),
    "근거: 설치 보고 1대 · 적용 확인 기록 2대",
  );
});

test("보고를 받은 설치가 없으면 그 사실을 숨기지 않는다", () => {
  assert.equal(
    rolloutEvidenceText({ heartbeat: 0, appliedConfirmation: 6, none: 0 }),
    "근거: 적용 확인 기록 6대 — 설치 보고를 받은 설치가 없습니다",
  );
  assert.equal(
    rolloutEvidenceText({ heartbeat: 0, appliedConfirmation: 0, none: 0 }),
    "판정할 설치가 없습니다",
  );
  // 근거를 주지 않는 서버(가산 전)라면 근거를 지어내지 않는다.
  assert.equal(rolloutEvidenceText(undefined), "판정 근거를 받지 못했습니다");
});

test("행의 근거 시각은 근거에 맞는 시각이고, 근거가 없으면 없다", () => {
  const row = {
    lastHeartbeatAt: "2026-09-30T15:00:00Z",
    appliedConfirmedAt: "2026-08-16T15:00:00Z",
  };
  assert.equal(
    evidenceTime({ ...row, appliedEvidence: "heartbeat" }),
    "2026-09-30T15:00:00Z",
  );
  assert.equal(
    evidenceTime({ ...row, appliedEvidence: "applied_confirmation" }),
    "2026-08-16T15:00:00Z",
  );
  assert.equal(evidenceTime({ ...row, appliedEvidence: "none" }), null);
  assert.deepEqual(Object.values(EVIDENCE_LABEL), [
    "최근 설치 보고",
    "적용 확인 기록 · 보고 없음",
    "근거 없음",
  ]);
});
