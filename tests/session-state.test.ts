import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clearBackendSession, getSessionState, invalidateBackendSessionCheck, restoreBackendSession, sessionFetch, subscribeBackendIdentityChange } from "../src/lib/api/session";

const originalFetch = globalThis.fetch;
const user = { memberId: "member", organizationId: "11111111-1111-4111-8111-111111111111", organizationName: "회사",
  email: "admin@example.test", displayName: null, role: "admin" };
afterEach(() => { globalThis.fetch = originalFetch; clearBackendSession(); });

test("동시 세션 확인을 합치고 확인 중 상태를 노출한다", async () => {
  clearBackendSession();
  let requests = 0, release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = async () => { requests++; await pending; return Response.json({ user }); };
  const tasks = Array.from({ length: 10 }, () => restoreBackendSession(true));
  assert.equal(getSessionState().status, "checking");
  assert.equal(requests, 1);
  release(); await Promise.all(tasks);
  assert.deepEqual(getSessionState(), { status: "authenticated", session: { user } });
});

test("일시 오류·403은 사용자 정리 이벤트를 발행하지 않고 재시도 성공으로 복구한다", async () => {
  globalThis.fetch = async () => Response.json({ user });
  await restoreBackendSession(true);
  let changes = 0;
  const unsubscribe = subscribeBackendIdentityChange(() => { changes++; });
  try {
    for (const status of [403, 429, 503]) {
      globalThis.fetch = async () => Response.json({}, { status });
      await assert.rejects(restoreBackendSession(true));
      const state = getSessionState();
      assert.equal(state.status, "error");
      if (state.status === "error") assert.equal(state.error.status, status);
      assert.equal(changes, 0);
      globalThis.fetch = async () => Response.json({ user });
      await restoreBackendSession(true);
      assert.equal(getSessionState().status, "authenticated");
      assert.equal(changes, 0);
    }
    globalThis.fetch = async () => { throw new TypeError("network"); };
    await assert.rejects(restoreBackendSession(true));
    assert.equal(getSessionState().status, "error");
    assert.equal(changes, 0);
  } finally { unsubscribe(); }
});

test("401과 익명 세션은 사용자 변경 이벤트로 관련 캐시 정리를 요청한다", async () => {
  for (const source of ["session401", "anonymous", "api401"]) {
    globalThis.fetch = async () => Response.json({ user });
    await restoreBackendSession(true);
    let changes = 0;
    const unsubscribe = subscribeBackendIdentityChange(() => { changes++; });
    try {
      globalThis.fetch = async () => source === "anonymous" ? Response.json({ user: null }) : Response.json({}, { status: 401 });
      if (source === "api401") await sessionFetch("/api/bff/dashboard/api/v1/organizations/test/settings");
      else await restoreBackendSession(true);
      assert.equal(getSessionState().status, "anonymous");
      assert.equal(changes, 1);
    } finally { unsubscribe(); }
  }
});

test("로그아웃 이후 도착한 이전 세션 응답으로 사용자가 복원되지 않는다", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = async () => { await pending; return Response.json({ user }); };
  const task = restoreBackendSession(true);
  clearBackendSession();
  release(); await task;
  assert.equal(getSessionState().status, "anonymous");
});


test("잘못된 성공 응답은 미로그인이 아닌 확인 실패로 처리한다", async () => {
  globalThis.fetch = async () => Response.json({ user });
  await restoreBackendSession(true);
  let changes = 0;
  const unsubscribe = subscribeBackendIdentityChange(() => { changes++; });
  try {
    for (const body of [{}, { user: false }, { user: {} }]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(restoreBackendSession(true));
      assert.equal(getSessionState().status, "error");
      assert.equal(changes, 0);
    }
  } finally { unsubscribe(); }
});


test("캐시 복원은 이전 확인 요청을 공유하지 않고 늦은 익명 응답도 무시한다", async () => {
  let release!: () => void, requests = 0;
  const pending = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = async () => {
    requests++;
    if (requests === 1) { await pending; return Response.json({ user: null }); }
    return Response.json({ user });
  };
  const oldCheck = restoreBackendSession(true);
  invalidateBackendSessionCheck();
  assert.equal(getSessionState().status, "checking");
  await restoreBackendSession(true);
  assert.equal(requests, 2);
  release(); await oldCheck;
  assert.deepEqual(getSessionState(), { status: "authenticated", session: { user } });
});
