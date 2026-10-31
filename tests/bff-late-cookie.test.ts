import assert from "node:assert/strict";
import { test } from "node:test";
import { createBff, type BffConfig } from "../src/lib/server/bff";

const origin = "https://app.example.test";
const organizationId = "11111111-1111-4111-8111-111111111111";
const path = `/dashboard/api/v1/organizations/${organizationId}/analytics/overview`;
const user = {
  memberId: "existing-test-member",
  organizationId,
  organizationName: "격리 회귀",
  email: "existing@example.test",
  displayName: null,
  role: "admin",
};

function request(route: string, cookie = "", body?: unknown) {
  return new Request(`${origin}/api/bff${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      Cookie: cookie,
      "X-Pulsemetry-Request": "1",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const cookie = (response: Response) =>
  response.headers.get("set-cookie")!.split(";")[0];

/** 실제 BE 계약처럼 RT를 한 번만 소비하고 재사용이면 세션 전체를 폐기한다. */
function rotatingBackend(options: Partial<BffConfig> = {}) {
  let time = 1_800_000_000_000;
  let generation = 0;
  let revoked = false;
  let refreshCalls = 0;
  let rejectNextResource = false;
  let failNextRead = false;
  const consumed = new Set<string>();
  const accessExpiry = new Map<string, number>();
  function issue() {
    generation++;
    const accessToken = `test-access-${generation}`;
    accessExpiry.set(accessToken, time + 300_000);
    return {
      access_token: accessToken,
      refresh_token: `test-refresh-${generation}`,
      token_type: "Bearer",
      expires_in: 300,
    };
  }
  const fetcher: typeof fetch = async (input, init = {}) => {
    const pathname = new URL(String(input)).pathname;
    if (pathname === "/api/v1/auth/token") return Response.json(issue());
    if (pathname === "/api/v1/auth/refresh") {
      refreshCalls++;
      const token = JSON.parse(String(init.body)).refresh_token as string;
      if (consumed.has(token)) revoked = true;
      if (revoked || token !== `test-refresh-${generation}`)
        return Response.json({}, { status: 401 });
      consumed.add(token);
      return Response.json(issue());
    }
    if (pathname === "/api/v1/auth/logout") {
      revoked = true;
      return new Response(null, { status: 204 });
    }
    if (failNextRead) {
      failNextRead = false;
      throw new TypeError("synthetic network failure");
    }
    const authorization = new Headers(init.headers).get("Authorization");
    const expiry = accessExpiry.get(
      authorization?.replace(/^Bearer /, "") ?? "",
    );
    if (revoked || expiry === undefined || expiry <= time)
      return Response.json({}, { status: 401 });
    if (pathname !== "/api/v1/auth/me" && rejectNextResource) {
      rejectNextResource = false;
      return Response.json({}, { status: 401 });
    }
    return Response.json(pathname === "/api/v1/auth/me" ? user : { ok: true });
  };
  const makeBff = () =>
    createBff(
      {
        origin,
        enrollmentUrl: "https://enrollment.example.test",
        dashboardUrl: "https://dashboard.example.test",
        keys: ["a1".repeat(32)],
        ...options,
      },
      fetcher,
      () => time,
    );
  const bff = makeBff();
  return {
    bff,
    fetcher,
    anotherProcess: makeBff,
    failNextRead: () => {
      failNextRead = true;
    },
    rejectNextResource: () => {
      rejectNextResource = true;
    },
    advance(milliseconds: number) {
      time += milliseconds;
    },
    status: () => ({ revoked, refreshCalls }),
    login: () =>
      bff.handle(
        request("/auth/token", "", {
          code: "uac_" + "c".repeat(43),
          code_verifier: "v".repeat(43),
          redirect_uri: origin + "/auth/callback",
          organizationId,
        }),
      ),
  };
}

test("15초 늦은 이전 쿠키는 소비 RT를 재사용하지 않고 현재 쿠키 재요청을 요구한다", async () => {
  const f = rotatingBackend();
  const old = cookie(await f.login());
  f.advance(300_000);
  const fresh = await f.bff.handle(request(path, old));
  assert.equal(fresh.status, 200);
  const current = cookie(fresh);
  f.advance(15_000);
  const delayed = await f.bff.handle(request(path, old));
  assert.deepEqual(f.status(), { revoked: false, refreshCalls: 1 });
  assert.equal(delayed.status, 409);
  assert.equal(delayed.headers.get("X-Pulsemetry-Session-Retry"), "1");
  assert.equal(delayed.headers.has("set-cookie"), false);
  assert.equal((await f.bff.handle(request(path, current))).status, 200);
});

test("5초 안 두 번 회전했어도 공유 결과의 최신 RT를 따라간다", async () => {
  const f = rotatingBackend();
  const first = cookie(await f.login());
  f.advance(300_000);
  const second = cookie(await f.bff.handle(request(path, first)));
  f.rejectNextResource();
  const third = await f.bff.handle(request(path, second));
  assert.equal(third.status, 200);
  assert.equal((await f.bff.handle(request(path, first))).status, 200);
  assert.deepEqual(f.status(), { revoked: false, refreshCalls: 2 });
});

test("최신 해시 상한은 다른 세션 기록을 축출하지 않고 절대 만료 뒤 회수한다", async () => {
  const f = rotatingBackend({ maxRefreshSessions: 1 });
  const first = cookie(await f.login());
  f.advance(300_000);
  assert.equal((await f.bff.handle(request(path, first))).status, 200);
  const second = cookie(await f.login());
  f.advance(300_000);
  assert.equal((await f.bff.handle(request(path, second))).status, 503);
  assert.equal((await f.bff.handle(request(path, first))).status, 409);
  assert.deepEqual(f.status(), { revoked: false, refreshCalls: 1 });
  f.advance(30 * 86_400_000);
  const later = cookie(await f.login());
  f.advance(300_000);
  assert.equal((await f.bff.handle(request(path, later))).status, 200);
  assert.deepEqual(f.status(), { revoked: false, refreshCalls: 2 });
});

test("캐시가 공유되지 않는 다른 프로세스의 구쿠키는 계속 재로그인 한계다", async () => {
  const f = rotatingBackend();
  const first = cookie(await f.login());
  f.advance(300_000);
  assert.equal((await f.bff.handle(request(path, first))).status, 200);
  f.advance(15_000);
  const separateProcess = f.anotherProcess();
  assert.equal(
    (await separateProcess.handle(request(path, first))).status,
    401,
  );
  assert.equal(f.status().revoked, true);
});

test("지연 요청·실제 BFF·브라우저 현재 쿠키 재요청을 함께 연결하면 세션을 유지한다", async () => {
  const session = await import("../src/lib/api/session");
  const originalFetch = globalThis.fetch;
  const f = rotatingBackend();
  let browserCookie = cookie(await f.login());
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let delayedCount = 0;
  const statuses: number[] = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const atDispatch = browserCookie;
    if (url.endsWith("?delayed=1") && ++delayedCount === 1) await blocked;
    const result = await f.bff.handle(
      new Request(origin + url, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init.headers)),
          Origin: origin,
          Cookie: atDispatch,
        },
      }),
    );
    if (result.headers.has("set-cookie")) browserCookie = cookie(result);
    if (url.includes("analytics/overview")) statuses.push(result.status);
    return result;
  };
  try {
    session.clearBackendSession();
    await session.restoreBackendSession(true);
    f.advance(300_000);
    const delayed = session.sessionFetch("/api/bff" + path + "?delayed=1");
    assert.equal((await session.sessionFetch("/api/bff" + path)).status, 200);
    f.advance(15_000);
    release();
    assert.equal((await delayed).status, 200);
    assert.deepEqual(statuses, [200, 409, 200]);
    assert.deepEqual(f.status(), { revoked: false, refreshCalls: 1 });
    assert.equal(session.getSessionState().status, "authenticated");
  } finally {
    release();
    globalThis.fetch = originalFetch;
    session.clearBackendSession();
  }
});

test("여러 판 전의 쿠키도 최신 세션을 폐기하거나 새 자격증명을 받지 않는다", async () => {
  const f = rotatingBackend();
  const first = cookie(await f.login());
  f.advance(300_000);
  const second = cookie(await f.bff.handle(request(path, first)));
  f.advance(300_000);
  const latest = cookie(await f.bff.handle(request(path, second)));
  f.advance(15_000);
  const delayed = await f.bff.handle(request(path, first));
  assert.deepEqual(f.status(), { revoked: false, refreshCalls: 2 });
  assert.equal(delayed.status, 409);
  assert.equal(delayed.headers.has("set-cookie"), false);
  assert.equal(
    (await f.bff.handle(request("/auth/session", latest))).status,
    200,
  );
});

test("회전 upstream fixture 자체는 실제 소비 RT 재사용을 계속 거부한다", async () => {
  const f = rotatingBackend();
  const first = cookie(await f.login());
  f.advance(300_000);
  const current = cookie(await f.bff.handle(request(path, first)));
  const replay = await f.fetcher(
    "https://enrollment.example.test/api/v1/auth/refresh",
    {
      method: "POST",
      body: JSON.stringify({ refresh_token: "test-refresh-1" }),
    },
  );
  assert.equal(replay.status, 401);
  assert.equal(f.status().revoked, true);
  assert.equal((await f.bff.handle(request(path, current))).status, 401);
});

for (const route of [path, "/auth/session"]) {
  test(`갱신 후 연결 실패 응답도 새 쿠키를 전달하고 유예 뒤 복구한다: ${route}`, async () => {
    const f = rotatingBackend();
    const old = cookie(await f.login());
    f.advance(300_000);
    f.failNextRead();
    const failed = await f.bff.handle(request(route, old));
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).error.code, "unavailable");
    assert.ok(failed.headers.has("set-cookie"));
    const current = cookie(failed);
    f.advance(6_000);
    const recovered = await f.bff.handle(request(route, current));
    assert.equal(recovered.status, 200);
    assert.deepEqual(f.status(), { revoked: false, refreshCalls: 1 });
  });
}

test("다른 요청의 갱신 결과를 재사용한 뒤 연결 실패해도 새 쿠키를 전달한다", async () => {
  const f = rotatingBackend();
  const old = cookie(await f.login());
  f.advance(300_000);
  assert.equal((await f.bff.handle(request(path, old))).status, 200);
  f.failNextRead();
  const failed = await f.bff.handle(request(path, old));
  assert.equal(failed.status, 503);
  assert.ok(failed.headers.has("set-cookie"));
  f.advance(6_000);
  assert.equal((await f.bff.handle(request(path, cookie(failed)))).status, 200);
  assert.equal(f.status().refreshCalls, 1);
});
