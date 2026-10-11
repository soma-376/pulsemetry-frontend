import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionRole, type BackendSession } from "../src/lib/api/session";

const user = {
  memberId: "m",
  organizationId: "1b59ab21-1788-35e0-bfd7-23baa88a35b4",
  organizationName: "조직",
  email: "owner@example.test",
  displayName: null,
  role: "admin" as const,
};
test("토큰이 없는 BFF 세션의 검증된 역할로 배지를 표시한다", () => {
  const session: BackendSession = { user };
  assert.equal(sessionRole(session), "admin");
  assert.equal(sessionRole({ user: { ...user, role: "member" } }), "member");
});
