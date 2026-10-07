import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import {
  createLogin,
  validateCallback,
  loginErrors,
  completeOidcCallback,
  OIDC_PENDING_KEY,
} from "../src/lib/oidc";
import { exchangeLogin, clearBackendSession } from "../src/lib/api/session";

const org = "11111111-1111-4111-8111-111111111111";
const redirect = "http://localhost:3000/auth/callback";
const code = "uac_" + "a".repeat(43);
test("state와 verifier는 각각 난수이며 S256 challenge만 서버 시작 주소에 노출한다", async () => {
  const first = await createLogin(org, redirect, undefined, 1000),
    second = await createLogin(org, redirect, undefined, 1000);
  const params = new URL(first.url).searchParams;
  assert.equal(
    params.get("code_challenge"),
    createHash("sha256").update(first.pending.verifier).digest("base64url"),
  );
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.equal(params.get("tenant_id"), org);
  assert.equal(params.has("login_hint"), false);
  assert.notEqual(first.pending.state, second.pending.state);
  assert.notEqual(first.pending.state, first.pending.verifier);
  assert.equal(first.url.includes(first.pending.verifier), false);
});
test("로그인 이메일은 URL 힌트로만 전달하고 callback 임시 정보에는 보관하지 않는다", async () => {
  const { url, pending } = await createLogin(
    org,
    redirect,
    " Admin+demo@Example.test ",
  );
  assert.equal(
    new URL(url).searchParams.get("login_hint"),
    "admin+demo@example.test",
  );
  assert.equal("loginHint" in pending, false);
  assert.equal(JSON.stringify(pending).includes("example.test"), false);
});
test("콜백은 만료·state 변조·중복 파라미터·다른 주소·잘못된 코드를 거부한다", async () => {
  const { pending } = await createLogin(org, redirect, undefined, 1000);
  const raw = JSON.stringify(pending),
    href = `${redirect}?state=${pending.state}&code=${code}`;
  assert.equal(validateCallback(href, raw, 2000).code, code);
  for (const bad of [
    href.replace(pending.state, "wrong"),
    href + "&state=other",
    href + "&code=other",
    href.replace("3000", "3001"),
    href.replace(code, "bad"),
    href + "&error=access_denied",
  ]) {
    assert.throws(() => validateCallback(bad, raw, 2000));
  }
  assert.throws(() => validateCallback(href, raw, 601001), {
    message: loginErrors.login_expired,
  });
  assert.throws(() => validateCallback(href, null, 2000), {
    message: loginErrors.login_expired,
  });
  assert.throws(
    () =>
      validateCallback(
        `${redirect}?state=${pending.state}&error=login_cancelled`,
        raw,
        2000,
      ),
    { message: loginErrors.login_cancelled },
  );
  assert.throws(
    () =>
      validateCallback(
        `${redirect}?state=${pending.state}&error=unknown-secret`,
        raw,
        2000,
      ),
    { message: loginErrors.invalid_credentials },
  );
});
test("BFF의 권한 거부를 사용자 오류로 전달한다", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({}, { status: 403 }),
  );
  await assert.rejects(
    exchangeLogin(code, redirect, "v".repeat(43), org),
    /관리자 접근 권한/,
  );
  clearBackendSession();
});

test("같은 마운트는 단회 교환을 공유하고 새 마운트는 소비된 callback을 재사용하지 않는다", async (context) => {
  const { pending } = await createLogin(org, redirect);
  const storage = new Map([[OIDC_PENDING_KEY, JSON.stringify(pending)]]);
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  let exchanges = 0,
    replaced = "";
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: `${redirect}?code=${code}&state=${pending.state}` },
      history: {
        state: null,
        replaceState: (_state: unknown, _title: string, path: string) => {
          replaced = path;
        },
      },
    },
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  context.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("/token")) {
      exchanges++;
      return Response.json({
        user: {
          memberId: "member",
          organizationId: org,
          organizationName: "test",
          email: "user@example.test",
          displayName: null,
          role: "admin",
        },
      });
    }
    return Response.json({
      memberId: "member",
      organizationId: org,
      organizationName: "test",
      email: "user@example.test",
      displayName: null,
      role: "admin",
    });
  });
  try {
    const attempt = {};
    const first = completeOidcCallback(attempt),
      duplicate = completeOidcCallback(attempt);
    assert.equal(first, duplicate);
    await first;
    assert.equal(exchanges, 1);
    assert.equal(storage.has(OIDC_PENDING_KEY), false);
    assert.equal(replaced, "/auth/callback");
    await assert.rejects(completeOidcCallback({}), {
      message: loginErrors.login_expired,
    });
    assert.equal(exchanges, 1);
  } finally {
    clearBackendSession();
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalStorage)
      Object.defineProperty(globalThis, "sessionStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
