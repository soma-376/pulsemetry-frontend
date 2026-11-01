import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  createValkeySessionStore,
  SessionStoreError,
} from "../src/lib/server/valkey-session-store";
import {
  createSessionReferenceCookie,
  type Session,
} from "../src/lib/server/session-cookie";
import { createBff } from "../src/lib/server/bff";
import { memorySessionCommands } from "./support/session-commands";
import { iamToken } from "../src/lib/server/valkey-connection";
const config = {
  origin: "https://app.example.test",
  keys: ["ab".repeat(32)],
  environment: "dev" as const,
  pollMs: 1,
};
function fixture() {
  let time = Date.now();
  const storage = memorySessionCommands(() => time);
  const a = createValkeySessionStore(storage.commands, config, () => time);
  const b = createValkeySessionStore(storage.commands, config, () => time);
  const session: Session = {
    id: randomUUID(),
    organizationId: randomUUID(),
    accessToken: "secret-at",
    refreshToken: "secret-rt",
    accessTokenExpiresAt: time + 1000,
    sessionExpiresAt: time + 30000,
  };
  return {
    a,
    b,
    storage,
    session,
    advance(ms: number) {
      time += ms;
    },
    now: () => time,
  };
}
const reauth = (error: unknown) =>
  error instanceof SessionStoreError && error.status === 401;

test("환경별 암호화 저장과 절대 TTL, v2 쿠키에는 토큰이 없다", async () => {
  const f = fixture();
  await f.a.create(f.session);
  const raw = [...f.storage.values.values()][0].value;
  assert.ok(!raw.includes("secret-at") && !raw.includes("secret-rt"));
  const prod = createValkeySessionStore(
    f.storage.commands,
    { ...config, environment: "prod" },
    f.now,
  );
  assert.equal(await prod.read(f.session.id), null);
  const reference = createSessionReferenceCookie(config, f.now);
  const response = reference.write(new Response(), f.session);
  const request = new Request(config.origin, {
    headers: { cookie: response.headers.get("set-cookie")! },
  });
  assert.deepEqual(reference.read(request), {
    id: f.session.id,
    sessionExpiresAt: f.session.sessionExpiresAt,
  });
  assert.equal(response.headers.get("set-cookie")!.includes("secret"), false);
  await f.a.refresh(
    f.session,
    async () => ({
      ...f.session,
      accessToken: "new-at",
      refreshToken: "new-rt",
    }),
    async () => {},
  );
  assert.equal(
    [...f.storage.values.values()][0].expiresAt,
    f.session.sessionExpiresAt,
  );
  f.advance(30001);
  assert.equal(await f.b.read(f.session.id), null);
});

test("서로 다른 BFF 저장소 인스턴스가 하나의 갱신 결과를 공유한다", async () => {
  const f = fixture();
  await f.a.create(f.session);
  let count = 0;
  const rotate = async () => {
    count++;
    await new Promise((r) => setTimeout(r, 30));
    return { ...f.session, accessToken: "new-at", refreshToken: "new-rt" };
  };
  const [a, b] = await Promise.all([
    f.a.refresh(f.session, rotate, async () => {}),
    f.b.refresh(f.session, rotate, async () => {}),
  ]);
  assert.equal(count, 1);
  assert.deepEqual(a, b);
});

test("갱신 응답 유실은 재로그인하며 동일 RT를 다시 제출하지 않는다", async () => {
  const f = fixture();
  await f.a.create(f.session);
  let count = 0;
  const rotate = async (): Promise<Session> => {
    count++;
    throw new Error("response lost");
  };
  await assert.rejects(
    f.a.refresh(f.session, rotate, async () => {}),
    reauth,
  );
  await assert.rejects(
    f.b.refresh(f.session, rotate, async () => {}),
    reauth,
  );
  assert.equal(count, 1);
});

test("로그아웃 중 완료된 갱신은 세션을 부활시키지 않고 새 RT도 폐기한다", async () => {
  const f = fixture();
  await f.a.create(f.session);
  let finish!: (value: Session) => void;
  let started!: () => void;
  const entered = new Promise<void>((r) => {
    started = r;
  });
  const revoked: string[] = [];
  const pending = f.a.refresh(
    f.session,
    () => {
      started();
      return new Promise((r) => {
        finish = r;
      });
    },
    async (s) => {
      revoked.push(s.refreshToken);
    },
  );
  await entered;
  await f.b.remove(f.session.id);
  finish({ ...f.session, refreshToken: "new-rt" });
  await assert.rejects(pending, reauth);
  assert.equal(await f.a.read(f.session.id), null);
  assert.deepEqual(revoked, ["new-rt"]);
});

test("Valkey 장애는 503이며 독자 갱신을 수행하지 않는다", async () => {
  const f = fixture();
  await f.a.create(f.session);
  f.storage.unavailable(true);
  let calls = 0;
  await assert.rejects(
    f.b.refresh(
      f.session,
      async () => {
        calls++;
        return f.session;
      },
      async () => {},
    ),
    (e) => e instanceof SessionStoreError && e.status === 503,
  );
  assert.equal(calls, 0);
  f.storage.unavailable(false);
  assert.ok(await f.a.read(f.session.id));
});

test("중단된 갱신의 담당자를 다시 선정하지 않고 재로그인한다", async () => {
  const f = fixture();
  await f.a.create(f.session);
  const [key, saved] = [...f.storage.values][0];
  const record = JSON.parse(saved.value);
  record.refresh = { owner: "dead-worker", startedAt: f.now() - 21000 };
  saved.value = JSON.stringify(record);
  let calls = 0;
  await assert.rejects(
    f.b.refresh(
      f.session,
      async () => {
        calls++;
        return f.session;
      },
      async () => {},
    ),
    reauth,
  );
  assert.equal(calls, 0);
  assert.equal(f.storage.values.has(key), false);
});

test("BFF 두 대에서 갱신 후 쿠키를 재발급하지 않고 세션 유실은 401이다", async () => {
  const f = fixture();
  await f.a.create(f.session);
  const reference = createSessionReferenceCookie(config, f.now);
  const cookie = reference
    .write(new Response(), f.session)
    .headers.get("set-cookie")!;
  let calls = 0;
  const fetcher: typeof fetch = async (input) => {
    if (String(input).endsWith("/auth/refresh")) {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return Response.json({
        access_token: "new-at",
        refresh_token: "new-rt",
        token_type: "Bearer",
        expires_in: 300,
      });
    }
    return Response.json({ userData: true });
  };
  const settings = {
    ...config,
    enrollmentUrl: "https://enrollment.example.test",
    dashboardUrl: "https://dashboard.example.test",
  };
  const a = createBff({ ...settings, sessionStore: f.a }, fetcher, f.now);
  const b = createBff({ ...settings, sessionStore: f.b }, fetcher, f.now);
  const request = () =>
    new Request(
      `${config.origin}/api/bff/dashboard/api/v1/organizations/${f.session.organizationId}/analytics/overview`,
      { headers: { cookie, "X-Pulsemetry-Request": "1" } },
    );
  const responses = await Promise.all([
    a.handle(request()),
    b.handle(request()),
  ]);
  assert.equal(calls, 1);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  await f.a.remove(f.session.id);
  assert.equal((await b.handle(request())).status, 401);
});

test("Serverless IAM 토큰은 캐시 이름·사용자·리전과 15분 만료로 서명한다", async () => {
  const token = await iamToken(
    "test-cache",
    "pulsemetry-bff-dev",
    "ap-northeast-2",
    async () => ({ accessKeyId: "TESTKEY", secretAccessKey: "TESTSECRET" }),
  );
  const url = new URL(`http://${token}`);
  assert.equal(url.hostname, "test-cache");
  assert.equal(url.searchParams.get("User"), "pulsemetry-bff-dev");
  assert.equal(url.searchParams.get("ResourceType"), "ServerlessCache");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  assert.match(
    url.searchParams.get("X-Amz-Credential")!,
    /ap-northeast-2\/elasticache\/aws4_request$/,
  );
  assert.ok(url.searchParams.get("X-Amz-Signature"));
});

test("정상 갱신 대기 한도 초과는 503이며 세션을 삭제하지 않는다", async () => {
  const f = fixture();
  await f.a.create(f.session);
  const saved = [...f.storage.values.values()][0];
  saved.value = JSON.stringify({
    ...JSON.parse(saved.value),
    refresh: { owner: "active", startedAt: f.now() },
  });
  const waiter = createValkeySessionStore(
    f.storage.commands,
    { ...config, waitMs: 5 },
    f.now,
  );
  let called = false;
  await assert.rejects(
    waiter.refresh(
      f.session,
      async () => {
        called = true;
        return f.session;
      },
      async () => {},
    ),
    (e) =>
      e instanceof SessionStoreError && e.code === "session_refresh_pending",
  );
  assert.equal(called, false);
  assert.ok(await f.a.read(f.session.id));
});

test("로그인 시 공유 세션을 만들고 로그아웃은 다른 BFF에서도 즉시 무효화한다", async () => {
  const f = fixture();
  let revocations = 0;
  const fetcher: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/token"))
      return Response.json({
        access_token: "issued-at",
        refresh_token: "issued-rt",
        token_type: "Bearer",
        expires_in: 300,
      });
    if (path.endsWith("/logout")) {
      revocations++;
      return new Response(null, { status: 204 });
    }
    return Response.json({
      memberId: "member",
      organizationId: f.session.organizationId,
      organizationName: "회사",
      email: "admin@example.test",
      displayName: null,
      role: "admin",
    });
  };
  const settings = {
    ...config,
    enrollmentUrl: "https://enrollment.example.test",
    dashboardUrl: "https://dashboard.example.test",
  };
  const a = createBff({ ...settings, sessionStore: f.a }, fetcher, f.now);
  const b = createBff({ ...settings, sessionStore: f.b }, fetcher, f.now);
  const request = (path: string, cookie = "", body?: unknown) =>
    new Request(`${config.origin}/api/bff/auth/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: config.origin,
        "X-Pulsemetry-Request": "1",
        "Content-Type": "application/json",
        cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const login = await a.handle(
    request("token", "", {
      code: "uac_" + "c".repeat(43),
      code_verifier: "v".repeat(43),
      redirect_uri: config.origin + "/auth/callback",
      organizationId: f.session.organizationId,
    }),
  );
  assert.equal(login.status, 200);
  assert.equal((await login.text()).includes("issued-rt"), false);
  const cookie = login.headers.get("set-cookie")!;
  const reference = createSessionReferenceCookie(config, f.now).read(
    request("session", cookie),
  )!;
  assert.equal((await f.b.read(reference.id))?.refreshToken, "issued-rt");
  const logout = await b.handle(request("logout", cookie, {}));
  assert.equal(logout.status, 204);
  assert.equal(revocations, 1);
  assert.equal((await a.handle(request("session", cookie))).status, 401);
});

test("손상된 세션은 삭제 가능하며 v1 토큰 쿠키를 v2로 자동 이관하지 않는다", async () => {
  const f = fixture();
  await f.a.create(f.session);
  [...f.storage.values.values()][0].value = "invalid";
  await assert.rejects(f.a.read(f.session.id), reauth);
  assert.equal(await f.a.remove(f.session.id), null);
  const codec = createSessionReferenceCookie(config, f.now);
  const old = codec.seal(f.session).replace(/^v2\./, "v1.");
  const request = new Request(config.origin, {
    headers: { cookie: `${codec.cookieName}=${old}` },
  });
  assert.equal(createSessionReferenceCookie(config, f.now).read(request), null);
});
