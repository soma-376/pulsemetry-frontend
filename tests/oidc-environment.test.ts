import test from "node:test";
import assert from "node:assert/strict";
import { oidcOrigin, oidcPassword } from "./e2e/oidc-environment";

test("IdP E2E에는 정확한 HTTPS origin을 명시한다", () => {
  assert.equal(
    oidcOrigin({ E2E_OIDC_ORIGIN: "https://idp.example.test/" }),
    "https://idp.example.test",
  );
  for (const value of [
    undefined,
    "http://idp.example.test",
    "https://user:pass@idp.example.test",
    "https://idp.example.test/login",
    "https://idp.example.test/?query=1",
    "https://idp.example.test/#hash",
  ]) {
    assert.throws(() => oidcOrigin({ E2E_OIDC_ORIGIN: value }));
  }
});

test("계정별 E2E 비밀번호는 기본값 없이 주입하며 오류에 원문을 노출하지 않는다", () => {
  const email = "owner@seed-a.example.test";
  assert.equal(
    oidcPassword(email, {
      E2E_OIDC_PASSWORDS_JSON: JSON.stringify({ [email]: "test-only" }),
    }),
    "test-only",
  );
  for (const value of [
    undefined,
    "not-json-secret",
    "null",
    "{}",
    JSON.stringify({ [email]: 123 }),
  ]) {
    assert.throws(
      () => oidcPassword(email, { E2E_OIDC_PASSWORDS_JSON: value }),
      (error) =>
        error instanceof Error && !error.message.includes("not-json-secret"),
    );
  }
});
