import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthError, authErrorFrom, rateLimitMessage, remainingSeconds } from "../src/lib/api/auth-error";

const response = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json;charset=UTF-8", ...headers } });

test("429는 인증 실패가 아니라 요청 제한이다 — 서버의 Retry-After를 보존하고 그 시간을 안내한다", async () => {
  const error = await authErrorFrom(response(429, { error: "rate_limited", message: "사용자 인증 요청을 처리할 수 없습니다." }, { "Retry-After": "17" }), "로그인에 실패했습니다.", "세션이 만료되었습니다.");
  assert.ok(error instanceof AuthError);
  assert.equal(error.status, 429);
  assert.equal(error.code, "rate_limited");
  assert.equal(error.retryAfterMs, 17_000);
  assert.equal(error.message, "요청이 많아 잠시 제한되었습니다. 17초 뒤에 다시 시도해 주세요.");
});

test("429의 Retry-After가 날짜여도 읽고, 없으면 시간을 지어내지 않는다", async () => {
  const date = new Date(Date.now() + 5_000).toUTCString();
  const dated = await authErrorFrom(response(429, {}, { "Retry-After": date }), "");
  assert.ok(dated.retryAfterMs > 0 && dated.retryAfterMs <= 5_000);
  assert.equal(dated.code, "rate_limited");
  const missing = await authErrorFrom(response(429, "not json"), "");
  assert.equal(missing.retryAfterMs, 0);
  assert.equal(missing.message, "요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.");
});

test("그 밖의 실패는 호출자의 문장, 응답의 문장, 기본 문장 순서로 쓰고 status·error를 보존한다", async () => {
  const body = { error: "seed_login_failed", message: "백엔드 시드 계정 인증에 실패했습니다." };
  const chosen = await authErrorFrom(response(401, body), "로그인에 실패했습니다.", "세션이 만료되었습니다. 다시 로그인해 주세요.");
  assert.deepEqual([chosen.status, chosen.code, chosen.message, chosen.retryAfterMs], [401, "seed_login_failed", "세션이 만료되었습니다. 다시 로그인해 주세요.", 0]);
  const server = await authErrorFrom(response(502, body), "로그인에 실패했습니다.");
  assert.deepEqual([server.status, server.message], [502, "백엔드 시드 계정 인증에 실패했습니다."]);
  const fallback = await authErrorFrom(response(500, "<html>"), "로그인에 실패했습니다.");
  assert.deepEqual([fallback.status, fallback.code, fallback.message], [500, "", "로그인에 실패했습니다."]);
});

test("남은 대기 시간은 올림한 초이고 지나면 0이다", () => {
  assert.equal(remainingSeconds(null, 1_000), 0);
  assert.equal(remainingSeconds(2_500, 1_000), 2);
  assert.equal(remainingSeconds(2_001, 1_000), 2);
  assert.equal(remainingSeconds(2_000, 1_000), 1);
  assert.equal(remainingSeconds(2_000, 2_000), 0);
  assert.equal(remainingSeconds(2_000, 9_000), 0);
  assert.equal(rateLimitMessage(1), "요청이 많아 잠시 제한되었습니다. 1초 뒤에 다시 시도해 주세요.");
});
