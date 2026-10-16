import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  clearBackendSession,
  getSessionState,
  restoreBackendSession,
  sessionFetch,
} from "../src/lib/api/session";

const originalFetch = globalThis.fetch;
const path = "/api/bff/enrollment/api/v1/organizations/test/teams";
const user = {
  memberId: "existing",
  organizationId: "11111111-1111-4111-8111-111111111111",
  organizationName: "격리 회귀",
  email: "existing@example.test",
  displayName: null,
  role: "admin",
};
const stale = () =>
  Response.json(
    { error: { code: "session_refresh_required" } },
    { status: 409, headers: { "X-Pulsemetry-Session-Retry": "1" } },
  );
async function authenticated() {
  globalThis.fetch = async () => Response.json({ user });
  await restoreBackendSession(true);
}
afterEach(() => {
  globalThis.fetch = originalFetch;
  clearBackendSession();
});

test("세션 확인은 전용 stale 응답만 현재 쿠키로 한 번 재요청한다", async () => {
  clearBackendSession();
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(init?.credentials, "same-origin");
    assert.equal(new Headers(init?.headers).has("Cookie"), false);
    return calls === 1 ? stale() : Response.json({ user });
  };
  await restoreBackendSession(true);
  assert.equal(calls, 2);
  assert.equal(getSessionState().status, "authenticated");
});

test("업무 명령은 BFF 미전달 stale만 같은 원문·멱등키로 한 번 재요청한다", async () => {
  await authenticated();
  const requests: RequestInit[] = [];
  globalThis.fetch = async (_url, init = {}) => {
    requests.push(init);
    return requests.length === 1 ? stale() : Response.json({ saved: true });
  };
  const body = JSON.stringify({ expectedVersion: 7, name: "초안" });
  const result = await sessionFetch(path, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "same-key",
    },
  });
  assert.equal(result.status, 200);
  assert.equal(requests.length, 2);
  for (const init of requests) {
    assert.equal(init.body, body);
    assert.equal(new Headers(init.headers).get("Idempotency-Key"), "same-key");
    assert.equal(new Headers(init.headers).get("X-Pulsemetry-Request"), "1");
  }
});

test("반복 stale은 두 번에서 멈추고 일반 409·503은 자동 재요청하지 않는다", async () => {
  await authenticated();
  for (const mode of ["repeated", "conflict", "unavailable"]) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return mode === "repeated"
        ? stale()
        : Response.json({}, { status: mode === "conflict" ? 409 : 503 });
    };
    const response = await sessionFetch(path);
    assert.equal(response.status, mode === "unavailable" ? 503 : 409);
    assert.equal(calls, mode === "repeated" ? 2 : 1);
    assert.equal(getSessionState().status, "authenticated");
  }
});

test("세션 확인의 반복 stale도 무한 갱신 없이 확인 오류로 남긴다", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return stale();
  };
  await assert.rejects(restoreBackendSession(true));
  assert.equal(calls, 2);
  assert.equal(getSessionState().status, "error");
});

for (const changed of ["logout", "other-identity"]) {
  test(`stale 도착 전 ${changed}이면 이전 업무를 재전송하지 않는다`, async () => {
    await authenticated();
    let release!: (response: Response) => void;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    };
    const pending = sessionFetch(path, { method: "POST", body: "draft" });
    clearBackendSession();
    if (changed === "other-identity") {
      globalThis.fetch = async () =>
        Response.json({ user: { ...user, memberId: "different" } });
      await restoreBackendSession(true);
    }
    release(stale());
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(calls, 1);
  });
}

test("폐기된 세션 확인과 소비 가능한 스트림은 stale을 재전송하지 않는다", async () => {
  let release!: (response: Response) => void;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  };
  const pending = restoreBackendSession(true);
  clearBackendSession();
  release(stale());
  await pending;
  assert.equal(calls, 1);
  assert.equal(getSessionState().status, "anonymous");
  await authenticated();
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return stale();
  };
  const response = await sessionFetch(path, {
    method: "POST",
    body: new ReadableStream(),
  });
  assert.equal(response.status, 409);
  assert.equal(calls, 1);
});
