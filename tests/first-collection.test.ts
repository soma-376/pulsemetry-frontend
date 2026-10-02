import assert from "node:assert/strict";
import { test } from "node:test";
import { FIRST_COLLECTION_STEPS, INVITE_DEEP_LINK, waitingText } from "../src/lib/first-collection";

/** 기대값은 실제 설치 경로(초대 메일의 설치 명령 → CLI 등록)와 허브 PRD 의 범위(MDM 일괄 배포 없음)에서 쓴다. */
test("첫 수집 단계는 초대 → 메일의 설치 명령 → 첫 수집이고, 없는 경로를 말하지 않는다", () => {
  assert.deepEqual(FIRST_COLLECTION_STEPS.map((step) => step.title), ["구성원 초대", "구성원이 CLI 설치", "첫 수집"]);
  assert.match(FIRST_COLLECTION_STEPS[1].note, /초대 메일의 설치 명령/);
  for (const step of FIRST_COLLECTION_STEPS) assert.doesNotMatch(`${step.title} ${step.note}`, /MDM|login|로그인|가입|계약 정보/);
  assert.equal(INVITE_DEEP_LINK, "/members?invite=1");
});

test("대기 문구는 자동 갱신 상태와 맞다 — 꺼져 있으면 화면이 스스로 바뀐다고 약속하지 않는다", () => {
  assert.match(waitingText(true), /최대 5분마다 다시 확인/);
  assert.match(waitingText(false), /자동 갱신이 꺼져 있습니다/);
  assert.doesNotMatch(waitingText(false), /5분/);
});
