import assert from "node:assert/strict";
import { test } from "node:test";
import {
  safeRedirectUrl,
  loginHref,
  afterLoginHref,
} from "../src/lib/auth-redirect";
import { createLogin, validateCallback } from "../src/lib/oidc";

test("내부 복귀 경로는 검색 조건·해시를 보존하고 외부 및 인증 경로는 거부한다", () => {
  const target = "/settings?vendor=test&tab=contract#vendors";
  assert.equal(safeRedirectUrl(target), target);
  assert.equal(
    new URL(loginHref(target), "https://app.test").searchParams.get(
      "redirecturl",
    ),
    target,
  );
  for (const value of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "/login",
    "/auth/callback",
    "/api/bff/auth/logout",
    "/%2f%2fevil.test",
    "/settings/%5cfoo",
    "/settings/%252f",
    "/settings\n",
    "/settings/../../login",
    "/settings/%ZZ",
  ]) {
    assert.equal(safeRedirectUrl(value), null, value);
    assert.equal(afterLoginHref(true, value), "/overview");
  }
  assert.equal(afterLoginHref(true, target), target);
  assert.equal(
    new URL(afterLoginHref(false, target), "https://app.test").searchParams.get(
      "redirecturl",
    ),
    target,
  );
  assert.equal(afterLoginHref(true, "/onboarding"), "/overview");
});

test("SSO 복귀 목적지는 state에 묶인 pending에 보관하며 authorize callback 주소와 분리한다", async () => {
  const target = "/members?team=platform#list";
  const callback = "https://app.test/auth/callback";
  const { pending, url } = await createLogin(
    "11111111-1111-4111-8111-111111111111",
    callback,
    undefined,
    1000,
    target,
  );
  assert.equal(pending.returnTo, target);
  assert.equal(new URL(url).searchParams.get("redirect_uri"), callback);
  assert.equal(new URL(url).searchParams.has("redirecturl"), false);
  const result = validateCallback(
    `${callback}?state=${pending.state}&code=uac_${"a".repeat(43)}`,
    JSON.stringify(pending),
    2000,
  );
  assert.equal(result.pending.returnTo, target);
});
