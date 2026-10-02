import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionRole, type BackendSession } from "../src/lib/api/session";

const jwt = (claims: object) => ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "signature"].join(".");
const session = (accessToken: string, role: "admin" | "member" = "admin"): BackendSession => ({
  tokens: { access_token: accessToken, refresh_token: "urt_x", token_type: "Bearer", expires_in: 300 },
  user: { memberId: "m", organizationId: "1b59ab21-1788-35e0-bfd7-23baa88a35b4", organizationName: "조직", email: "owner@example.test", displayName: null, role },
});

test("화면의 역할은 AT 의 role 클레임이고 소유자와 관리자를 구분한다", () => {
  assert.equal(sessionRole(session(jwt({ role: "owner", sid: "s" }))), "owner");
  assert.equal(sessionRole(session(jwt({ role: "admin" }))), "admin");
  assert.equal(sessionRole(session(jwt({ role: "member" }), "member")), "member");
});

test("AT 를 읽을 수 없거나 모르는 역할이면 현재 사용자 응답의 역할을 쓴다", () => {
  assert.equal(sessionRole(session("ui-fixture-access")), "admin");
  assert.equal(sessionRole(session(jwt({ role: "root" }), "member")), "member");
  assert.equal(sessionRole(session("a.%%%.c")), "admin");
});
