import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { routeAccess, routeDestination, type RouteAccess } from "../src/lib/route-access";
import { createSessionCookie } from "../src/lib/server/session-cookie";

test("경로와 하위 경로를 분류하되 비슷한 이름·API·정적 파일은 제외한다", () => {
  for (const root of ["overview", "teams", "members", "settings", "ops"]) {
    for (const suffix of ["", "/", "/detail"]) assert.equal(routeAccess(`/${root}${suffix}`), "protected");
    assert.equal(routeAccess(`/${root}-public`), "public");
  }
  assert.equal(routeAccess("/onboarding/step"), "onboarding");
  assert.equal(routeAccess("/login"), "guest");
  assert.equal(routeAccess("/"), "entry");
  for (const path of ["/contact", "/auth/callback", "/api/bff/auth/session", "/_next/static/test.js", "/favicon.ico"])
    assert.equal(routeAccess(path), "public");
});

test("미로그인·온보딩 미완료·완료에 대한 전체 경로 정책", () => {
  const cases: [RouteAccess, (string | null)[]][] = [
    ["public", [null, null, null]], ["guest", [null, "/onboarding", "/overview"]],
    ["onboarding", ["/login", null, "/overview"]], ["protected", ["/login", "/onboarding", null]],
    ["entry", ["/login", "/onboarding", "/overview"]],
  ];
  for (const [access, expected] of cases)
    assert.deepEqual([routeDestination(access, false), routeDestination(access, true, false), routeDestination(access, true, true)], expected);
});

test("무상태 쿠키 검사는 AT 만료를 허용하고 무결성·절대 만료·이전 키를 검증한다", () => {
  const now = 1800000000000, origin = "https://app.example.test", key = "ab".repeat(32);
  const codec = createSessionCookie({ origin, keys: [key] }, () => now);
  const session = { id: randomUUID(), organizationId: randomUUID(), accessToken: "expired-at", refreshToken: "valid-rt",
    accessTokenExpiresAt: now - 1000, sessionExpiresAt: now + 1000 };
  const value = codec.seal(session);
  const request = (v: string) => new Request(origin, { headers: { cookie: `${codec.cookieName}=${v}` } });
  assert.deepEqual(codec.read(request(value)), session);
  assert.equal(codec.read(request(value + ".tampered")), null);
  assert.equal(codec.read(request(codec.seal({ ...session, sessionExpiresAt: now }))), null);
  assert.equal(codec.read(new Request(origin)), null);
  const rotated = createSessionCookie({ origin, keys: ["cd".repeat(32), key] }, () => now);
  assert.deepEqual(rotated.read(request(value)), session);
  assert.equal(createSessionCookie({ origin, keys: ["cd".repeat(32)] }, () => now).read(request(value)), null);
});
