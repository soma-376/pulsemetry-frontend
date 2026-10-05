import assert from "node:assert/strict";
import { test } from "node:test";
import { ROLE_ACCESS_NOTE, ROLE_HINT } from "../src/lib/members-view";

/** 기대값은 서버 인가(백엔드 대시보드 명세 §1 — 조직 조회는 owner·admin 만, 구성원은 403)에서 쓴다. */
test("역할 설명은 서버 인가와 같다 — 구성원은 대시보드에 접근하지 않고, 읽기 전용 역할을 말하지 않는다", () => {
  assert.match(ROLE_HINT.member, /웹 대시보드에 접근하지 않습니다/);
  assert.match(ROLE_HINT.member, /CLI/);
  assert.match(ROLE_HINT.admin, /웹 대시보드를 보고/);
  assert.match(ROLE_HINT.owner, /웹 대시보드를 보고/);
  for (const text of [...Object.values(ROLE_HINT), ROLE_ACCESS_NOTE]) assert.doesNotMatch(text, /조회만|읽기 전용|조회 가능/);
  assert.match(ROLE_ACCESS_NOTE, /관리자와 소유자만/);
});
