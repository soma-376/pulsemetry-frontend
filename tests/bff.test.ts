import assert from "node:assert/strict";
import { test } from "node:test";
import { createBff, type BffConfig } from "../src/lib/server/bff";

const origin = "https://app.example.test", org = "11111111-1111-4111-8111-111111111111";
const user = { memberId: "member", organizationId: org, organizationName: "회사", email: "admin@example.test", displayName: null, role: "admin" };
const config: BffConfig = { origin, enrollmentUrl: "https://enrollment.example.test", dashboardUrl: "https://dashboard.example.test", keys: ["a1".repeat(32)] };
const api = `/dashboard/api/v1/organizations/${org}/analytics/overview`;
const cookie = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
function request(path: string, saved = "", body?: unknown, extra: HeadersInit = {}) {
  return new Request(`${origin}/api/bff${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { "X-Pulsemetry-Request": "1", Origin: origin, Cookie: saved,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
}
function fixture(options: Partial<BffConfig> = {}) {
  let time = 1_800_000_000_000, refreshCount = 0, logoutCount = 0, exchanges = 0;
  let refreshStatus = 200, role = "admin", meOrg = org, revoked = false;
  let pause: Promise<void> | undefined;
  const sent: { url: URL; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input)); sent.push({ url, init });
    if (url.pathname === "/v1/auth/token") {
      exchanges++; revoked = false;
      return Response.json({ access_token: `secret-at-${exchanges}`, refresh_token: `secret-rt-${exchanges}`, token_type: "Bearer", expires_in: 300 });
    }
    if (url.pathname === "/v1/auth/refresh") {
      refreshCount++;
      if (pause) await pause;
      if (revoked || refreshStatus !== 200) return Response.json({}, { status: revoked ? 401 : refreshStatus });
      return Response.json({ access_token: "new-secret-at", refresh_token: "new-secret-rt", token_type: "Bearer", expires_in: 300 });
    }
    if (url.pathname === "/v1/auth/logout") { logoutCount++; revoked = true; return new Response(null, { status: 204 }); }
    if (revoked) return Response.json({}, { status: 401 });
    if (url.pathname === "/v1/auth/me") return Response.json({ ...user, role, organizationId: meOrg });
    return Response.json({ ok: true }, { headers: { "Set-Cookie": "upstream-secret=do-not-forward", "Retry-After": "2" } });
  };
  const bff = createBff({ ...config, ...options }, fetcher, () => time);
  const login = () => bff.handle(request("/auth/token", "", { code: "uac_" + "c".repeat(43), code_verifier: "v".repeat(43), redirect_uri: origin + "/auth/callback", organizationId: org }));
  return { bff, login, sent, fetcher, clock: () => time, advance: (ms: number) => { time += ms; },
    pause: (p: Promise<void> | undefined) => { pause = p; }, failRefresh: (s: number) => { refreshStatus = s; },
    setUser: (r: string, o = org) => { role = r; meOrg = o; }, counts: () => ({ refreshCount, logoutCount, exchanges }) };
}

test("로그인은 사용자만 반환하고 인증 암호화 HttpOnly 쿠키를 발급한다", async () => {
  const f = fixture(), result = await f.login();
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { user });
  const saved = result.headers.get("set-cookie")!;
  assert.match(saved, /^__Host-pulsemetry-session=v1\./);
  for (const option of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert.ok(saved.includes(option));
  assert.doesNotMatch(saved, /secret-at|secret-rt|Domain=/);
  const restored = await f.bff.handle(request("/auth/session", cookie(result)));
  assert.deepEqual(await restored.json(), { user });
  assert.equal(restored.headers.has("set-cookie"), false);
});

test("쿠키 변조·다른 키·다른 origin·절대 만료는 upstream 인증을 하지 못한다", async () => {
  const f = fixture(), saved = cookie(await f.login());
  const pieces = saved.split("."); pieces[3] = (pieces[3][0] === "X" ? "Y" : "X") + pieces[3].slice(1);
  assert.equal((await f.bff.handle(request(api, pieces.join(".")))).status, 401);
  const other = createBff({ ...config, keys: ["b2".repeat(32)] }, f.fetcher, f.clock);
  assert.equal((await other.handle(request(api, saved))).status, 401);
  const otherOrigin = createBff({ ...config, origin: "https://other.example.test" }, f.fetcher, f.clock);
  assert.equal((await otherOrigin.handle(request(api, saved, undefined, { Origin: "https://other.example.test" }))).status, 401);
  f.advance(30 * 86400000);
  assert.equal((await f.bff.handle(request(api, saved))).status, 401);
});

test("이전 키 쿠키를 읽고 현재 키로 갱신하되 절대 수명은 연장하지 않는다", async () => {
  const f = fixture(), saved = cookie(await f.login());
  const rotated = createBff({ ...config, keys: ["b2".repeat(32), ...config.keys] }, f.fetcher, f.clock);
  f.advance(300000);
  const result = await rotated.handle(request(api, saved));
  assert.equal(result.status, 200);
  assert.notEqual(cookie(result).split(".")[1], saved.split(".")[1]);
  assert.match(result.headers.get("set-cookie")!, /Max-Age=2591700/);
});

test("CSRF·임의 upstream·다른 조직·인증 proxy 경로를 거부한다", async () => {
  const f = fixture(), saved = cookie(await f.login()), before = f.sent.length;
  assert.equal((await f.bff.handle(request(api, saved, {}, { Origin: "https://evil.example.test" }))).status, 403);
  assert.equal((await f.bff.handle(request(api, saved, undefined, { "X-Pulsemetry-Request": "" }))).status, 403);
  assert.equal((await f.bff.handle(request(api, saved, undefined, { "Sec-Fetch-Site": "cross-site" }))).status, 403);
  assert.equal((await f.bff.handle(request("/enrollment/v1/auth/token", saved))).status, 404);
  assert.equal((await f.bff.handle(request(api.replace(org, "22222222-2222-4222-8222-222222222222"), saved))).status, 403);
  assert.equal((await f.bff.handle(request("/dashboard/api/v1/organizations/evil%2Fhost/settings", saved))).status, 400);
  assert.equal(f.sent.length, before);
});

test("proxy는 클라이언트 자격증명·쿠키를 버리고 응답 Set-Cookie도 전달하지 않는다", async () => {
  const f = fixture(), saved = cookie(await f.login());
  const result = await f.bff.handle(request(api + "?compare=none", saved, undefined,
    { Authorization: "Bearer attacker", "X-Forwarded-For": "spoof", "Idempotency-Key": "command" }));
  const { url, init } = f.sent.at(-1)!;
  assert.equal(url.origin, config.dashboardUrl);
  const headers = new Headers(init.headers);
  assert.equal(headers.get("Authorization"), "Bearer secret-at-1");
  assert.equal(headers.get("Cookie"), null); assert.equal(headers.get("X-Forwarded-For"), null);
  assert.equal(headers.get("Idempotency-Key"), "command");
  assert.equal(result.headers.get("Set-Cookie"), null);
  assert.equal(result.headers.get("Retry-After"), "2");
  assert.equal(result.headers.get("Cache-Control"), "no-store");
});

test("본문 없는 벤더 삭제·계약 비우기는 빈 스트림이어도 If-Match와 함께 전달한다", async () => {
  const f = fixture(), saved = cookie(await f.login());
  const sent: { url: string; init: RequestInit }[] = [];
  const bff = createBff(config, async (input, init = {}) => {
    sent.push({ url: String(input), init });
    return new Response(null, { status: 204 });
  }, f.clock);
  for (const suffix of ["", "/contract"]) {
    for (const bodyKind of ["none", "empty-stream", "zero-length"] as const) {
      const path = `/api/v1/organizations/${org}/vendors/vendor-1${suffix}`;
      const init: RequestInit & { duplex: "half" } = { method: "DELETE", duplex: "half",
        headers: { "X-Pulsemetry-Request": "1", Origin: origin, Cookie: saved, "If-Match": '"vendor-123"',
          ...(bodyKind === "zero-length" ? { "Content-Length": "0", "Content-Type": "application/json" } : {}) },
        // Next.js의 Node 어댑터는 본문이 없어도 DELETE에 요청 스트림을 붙인다.
        body: bodyKind === "none" ? undefined : new ReadableStream({ start(controller) { controller.close(); } }),
      };
      const result = await bff.handle(new Request(`${origin}/api/bff/enrollment${path}`, init));
      assert.equal(result.status, 204, `${suffix || "vendor"}: ${bodyKind}`);
      assert.equal(await result.text(), "");
      const forwarded = sent.at(-1)!;
      assert.equal(forwarded.url, config.enrollmentUrl + path);
      assert.equal(forwarded.init.method, "DELETE");
      assert.equal(forwarded.init.body, undefined);
      const headers = new Headers(forwarded.init.headers);
      assert.equal(headers.get("If-Match"), '"vendor-123"');
      assert.equal(headers.get("Authorization"), "Bearer secret-at-1");
      assert.equal(headers.get("Content-Type"), bodyKind === "zero-length" ? "application/json" : null);
    }
  }
  assert.equal(sent.length, 6);
});

test("proxy는 JSON을 해석하지 않고 원문 바이트와 Content-Type을 전달한다", async () => {
  const f = fixture(), saved = cookie(await f.login());
  const path = `/enrollment/api/v1/organizations/${org}/vendors/vendor-1`;
  for (const [body, contentType] of [
    ['{ "displayName": "새 이름", "number": 9007199254740993 }\n', "application/json; charset=utf-8"],
    ['{"displayName":"새 이름"}', "text/plain"],
    ["broken", "application/json"],
    [" ", "application/json"],
    [new Uint8Array([0, 255, 128, 13, 10]), "application/octet-stream"],
    [new Uint8Array([0, 255, 128]), null],
  ] as const) {
    const before = f.sent.length;
    const result = await f.bff.handle(new Request(`${origin}/api/bff${path}`, { method: "PATCH", body,
      headers: { "X-Pulsemetry-Request": "1", Origin: origin, Cookie: saved,
        ...(contentType === null ? {} : { "Content-Type": contentType }) } }));
    assert.equal(result.status, 200);
    assert.equal(f.sent.length, before + 1);
    assert.deepEqual(Buffer.from(await new Response(f.sent.at(-1)!.init.body).arrayBuffer()), Buffer.from(body));
    assert.equal(new Headers(f.sent.at(-1)!.init.headers).get("Content-Type"), contentType);
  }
});

test("proxy는 실제 바이트 기준 1MiB까지 허용하고 초과 스트림은 중단한다", async () => {
  const f = fixture(), saved = cookie(await f.login());
  for (const extraByte of [false, true]) {
    const before = f.sent.length;
    let cancelled = false, chunk = 0;
    const init: RequestInit & { duplex: "half" } = { method: "POST", duplex: "half",
      headers: { "X-Pulsemetry-Request": "1", Origin: origin, Cookie: saved },
      body: new ReadableStream({
        pull(controller) {
          if (chunk++ === 0) controller.enqueue(new Uint8Array(1024 * 1024));
          else if (extraByte) controller.enqueue(new Uint8Array([255]));
          else controller.close();
        },
        cancel() { cancelled = true; },
      }),
    };
    const result = await f.bff.handle(new Request(`${origin}/api/bff/enrollment/api/v1/organizations/${org}/vendors`, init));
    assert.equal(result.status, extraByte ? 413 : 200);
    assert.equal(f.sent.length, before + (extraByte ? 0 : 1));
    assert.equal(cancelled, extraByte);
  }
});

test("인증 경로는 JSON 문법·Content-Type·필드·크기를 계속 검증한다", async () => {
  const f = fixture();
  for (const route of ["organizations", "token"]) {
    for (const [body, contentType, status] of [
      ["{}", "text/plain", 415], ["broken", "application/json", 400],
      ["", "application/json", 400], ["{}", "application/json", 400],
      ["x".repeat(1024 * 1024 + 1), "application/json", 413],
    ] as const) {
      const result = await f.bff.handle(new Request(`${origin}/api/bff/auth/${route}`, { method: "POST", body,
        headers: { "X-Pulsemetry-Request": "1", Origin: origin, "Content-Type": contentType } }));
      assert.equal(result.status, status);
    }
  }
  assert.equal(f.sent.length, 0);
});

test("토큰 갱신 재요청도 원문을 유지하고 백엔드의 본문 검증 오류를 전달한다", async () => {
  const f = fixture(), saved = cookie(await f.login());
  const path = `/api/v1/organizations/${org}/vendors/vendor-1`;
  const sent: RequestInit[] = [];
  const backendError = { error: { code: "invalid_request", message: "잘못된 JSON" } };
  const bff = createBff(config, async (input, init = {}) => {
    if (new URL(String(input)).pathname !== path) return f.fetcher(input, init);
    sent.push(init);
    return Response.json(sent.length === 1 ? {} : backendError, { status: sent.length === 1 ? 401 : 400 });
  }, f.clock);
  const body = '{ "number": 9007199254740993, broken }\n';
  const result = await bff.handle(new Request(`${origin}/api/bff/enrollment${path}`, { method: "PATCH", body,
    headers: { "X-Pulsemetry-Request": "1", Origin: origin, Cookie: saved, "Content-Type": "application/json" } }));
  assert.equal(result.status, 400);
  assert.deepEqual(await result.json(), backendError);
  assert.equal(f.counts().refreshCount, 1);
  assert.equal(sent.length, 2);
  for (const init of sent) assert.deepEqual(Buffer.from(await new Response(init.body).arrayBuffer()), Buffer.from(body));
  assert.equal(new Headers(sent[0].headers).get("Authorization"), "Bearer secret-at-1");
  assert.equal(new Headers(sent[1].headers).get("Authorization"), "Bearer new-secret-at");
});

test("동시 요청과 완료 직후의 이전 쿠키 요청은 갱신 한 번을 공유한다", async () => {
  const f = fixture(), saved = cookie(await f.login()); f.advance(300000);
  let release!: () => void;
  f.pause(new Promise<void>(resolve => { release = resolve; }));
  const pending = Array.from({ length: 20 }, () => f.bff.handle(request(api, saved)));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.counts().refreshCount, 1); release();
  const results = await Promise.all(pending);
  assert.ok(results.every(r => r.status === 200 && r.headers.has("set-cookie")));
  assert.equal((await f.bff.handle(request(api, saved))).status, 200);
  assert.equal(f.counts().refreshCount, 1);
  const latest = await f.bff.handle(request(api, cookie(results[0])));
  assert.equal(latest.status, 200); assert.equal(latest.headers.has("set-cookie"), false);
});

test("갱신 cache 포화는 진행 중 작업을 축출하지 않으며 TTL 뒤 용량을 회수한다", async () => {
  const f = fixture({ maxRefreshEntries: 1 });
  const a = cookie(await f.login()), b = cookie(await f.login()); f.advance(300000);
  assert.equal((await f.bff.handle(request(api, a))).status, 200);
  assert.equal((await f.bff.handle(request(api, b))).status, 503);
  assert.equal(f.counts().refreshCount, 1);
  assert.equal((await f.bff.handle(request(api, a))).status, 200);
  f.advance(5001);
  assert.equal((await f.bff.handle(request(api, b))).status, 200);
  assert.equal(f.counts().refreshCount, 2);
});

test("갱신 실패 작업은 제거하여 재시도할 수 있고 로그아웃은 공유 결과도 무효화한다", async () => {
  const f = fixture(), saved = cookie(await f.login()); f.advance(300000);
  f.failRefresh(503);
  assert.equal((await f.bff.handle(request(api, saved))).status, 502);
  f.failRefresh(200);
  const success = await f.bff.handle(request(api, saved)); assert.equal(success.status, 200);
  assert.equal(f.counts().refreshCount, 2);
  const logout = await f.bff.handle(request("/auth/logout", cookie(success), {}));
  assert.equal(logout.status, 204); assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal((await f.bff.handle(request(api, saved))).status, 401);
  assert.equal(f.counts().refreshCount, 3);
});

test("다른 조직·비관리자는 새 토큰을 저장하지 않고 폐기한다", async () => {
  for (const [role, id] of [["member", org], ["admin", "22222222-2222-4222-8222-222222222222"]]) {
    const f = fixture(); f.setUser(role, id);
    const result = await f.login();
    assert.equal(result.status, 403); assert.equal(result.headers.has("set-cookie"), false);
    assert.equal(f.counts().logoutCount, 1);
  }
});

test("갱신 도중 로그아웃은 완료되는 새 세션도 폐기한다", async () => {
  const f = fixture(), saved = cookie(await f.login()); f.advance(300000);
  let release!: () => void; f.pause(new Promise<void>(resolve => { release = resolve; }));
  const pending = f.bff.handle(request(api, saved));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.bff.handle(request("/auth/logout", saved, {}))).status, 204);
  release();
  assert.equal((await pending).status, 401);
});

test("upstream 401은 한 번만 갱신하고 재시도하며 작업 타임아웃 후 메모리를 회수한다", async () => {
  const f = fixture();
  let sends = 0, stall = false;
  const fetcher: typeof fetch = async (input, init) => {
    if (String(input).includes("/analytics/overview")) {
      sends++;
      if (sends === 1) return Response.json({}, { status: 401 });
    }
    if (stall && String(input).endsWith("/refresh")) {
      return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("timeout")), { once: true }));
    }
    return f.fetcher(input, init);
  };
  const bff = createBff({ ...config, timeoutMs: 15, maxRefreshEntries: 1 }, fetcher, f.clock);
  const saved = cookie(await f.login());
  assert.equal((await bff.handle(request(api, saved))).status, 200);
  assert.equal(sends, 2); assert.equal(f.counts().refreshCount, 1);
  f.advance(300000); stall = true;
  // AbortSignal.timeout 타이머는 unref되므로 테스트 동안 이벤트 루프를 유지한다.
  const keepAlive = setTimeout(() => {}, 500);
  try { assert.equal((await bff.handle(request(api, saved))).status, 503); }
  finally { clearTimeout(keepAlive); }
  stall = false;
  assert.equal((await bff.handle(request(api, saved))).status, 200);
});

// 서버 갱신 요청은 브라우저 목으로 관찰할 수 없으므로 실제 BFF 경계를 검사한다.
test("인증 경로의 429와 Retry-After를 보존하고 쿠키를 삭제하지 않는다", async () => {
  const f = fixture(), saved = cookie(await f.login());
  f.advance(300000);
  const bff = createBff(config, async (input, init) => String(input).endsWith("/v1/auth/refresh") || String(input).endsWith("/v1/auth/logout")
    ? Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "7" } }) : f.fetcher(input, init), f.clock);
  for (const requestValue of [request("/auth/session", saved), request("/auth/logout", saved, {})]) {
    const result = await bff.handle(requestValue);
    assert.equal(result.status, 429);
    assert.equal(result.headers.get("Retry-After"), "7");
    assert.equal(result.headers.has("Set-Cookie"), false);
  }
});

test("세션 갱신 후 역할 거부와 일시적인 me 실패도 회전한 RT를 보존한다", async () => {
  for (const status of [403, 503]) {
    const f = fixture(), saved = cookie(await f.login());
    f.advance(300000);
    const bff = createBff(config, async (input, init) => String(input).endsWith("/v1/auth/me")
      ? status === 403 ? Response.json({ ...user, role: "member" }) : Response.json({}, { status })
      : f.fetcher(input, init), f.clock);
    const result = await bff.handle(request("/auth/session", saved));
    assert.equal(result.status, status === 503 ? 502 : status);
    assert.ok(result.headers.has("set-cookie"));
    const { createSessionCookie } = await import("../src/lib/server/session-cookie");
    const session = createSessionCookie(config, f.clock).read(request("/auth/session", cookie(result)));
    assert.equal(session?.refreshToken, "new-secret-rt");
    assert.equal(f.counts().refreshCount, 1);
  }
});
