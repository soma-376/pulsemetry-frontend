import assert from "node:assert/strict";
import test from "node:test";
import { createBff } from "../src/lib/server/bff";
import { createSessionCookie } from "../src/lib/server/session-cookie";

const origin = "https://app.example.test";
const organizationId = "11111111-1111-4111-8111-111111111111";
const config = {
  origin,
  enrollmentUrl: "https://enrollment.example.test",
  dashboardUrl: "https://dashboard.example.test",
  keys: ["a1".repeat(32)], // Test-only key; never an environment secret.
};

// Models UserAuthService.rotate's atomic consume/reuse-revokes-session contract
// and UserAccessVerifier's revoked-session check. No real JWT, DB or IdP.
function fixture() {
  let time = 1_800_000_000_000;
  let revoked = false;
  let refreshCount = 0;
  let serial = 0;
  const used = new Set<string>();
  const known = new Set(["rt-0"]);
  const accessTokens = new Set(["at-0"]);
  const events: string[] = [];
  const releaseFirst = Promise.withResolvers<void>();
  const firstConsumed = Promise.withResolvers<void>();
  const reuseDetected = Promise.withResolvers<void>();
  const fetcher: typeof fetch = async (input, init = {}) => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/v1/auth/refresh") {
      refreshCount++;
      const token = JSON.parse(String(init.body)).refresh_token as string;
      if (!known.has(token)) return Response.json({}, { status: 401 });
      // No await inside this critical section: mirrors session row locking.
      if (used.has(token)) {
        revoked = true;
        events.push("refresh reuse -> session revoked");
        reuseDetected.resolve();
        return Response.json({}, { status: 401 });
      }
      if (revoked) return Response.json({}, { status: 401 });
      used.add(token);
      serial++;
      const tokens = {
        access_token: `at-${serial}`,
        refresh_token: `rt-${serial}`,
        token_type: "Bearer",
        expires_in: 300,
      };
      known.add(tokens.refresh_token);
      accessTokens.add(tokens.access_token);
      events.push("refresh consumed -> new tokens issued");
      if (serial === 1) {
        firstConsumed.resolve();
        // Pause response delivery after rotation has committed.
        await releaseFirst.promise;
      }
      return Response.json(tokens);
    }
    const access = new Headers(init.headers).get("Authorization")?.slice(7);
    const status = !revoked && accessTokens.has(access ?? "") ? 200 : 401;
    events.push(`business API -> ${status}`);
    return Response.json({ ok: status === 200 }, { status });
  };
  const clock = () => time;
  const codec = createSessionCookie(config, clock);
  const saved = `${codec.cookieName}=${codec.seal({
    id: "22222222-2222-4222-8222-222222222222",
    organizationId,
    accessToken: "at-0",
    refreshToken: "rt-0",
    accessTokenExpiresAt: time - 1,
    sessionExpiresAt: time + 86_400_000,
  })}`;
  const request = (cookie = saved) =>
    new Request(
      `${origin}/api/bff/dashboard/api/v1/organizations/${organizationId}/analytics/overview`,
      {
        headers: {
          Cookie: cookie,
          "X-Pulsemetry-Request": "1",
          Origin: origin,
        },
      },
    );
  return {
    instance: () => createBff(config, fetcher, clock),
    request,
    firstConsumed: firstConsumed.promise,
    reuseDetected: reuseDetected.promise,
    release: () => releaseFirst.resolve(),
    advance: (ms: number) => {
      time += ms;
    },
    snapshot: () => ({ refreshCount, revoked, events: [...events] }),
  };
}

test(
  "단일 BFF의 동시 20개 요청은 RT를 한 번 소비하고 모두 성공한다",
  { timeout: 2000 },
  async (t) => {
    const f = fixture();
    const bff = f.instance();
    const requests = Array.from({ length: 20 }, () => bff.handle(f.request()));
    await f.firstConsumed;
    assert.equal(f.snapshot().refreshCount, 1);
    f.release();
    const results = await Promise.all(requests);
    assert.ok(results.every((r) => r.status === 200));
    const late = await bff.handle(f.request());
    assert.equal(late.status, 200);
    assert.equal(f.snapshot().refreshCount, 1);
    assert.equal(f.snapshot().revoked, false);
    t.diagnostic(JSON.stringify(f.snapshot()));
  },
);

test(
  "독립 BFF 두 개의 동시 갱신은 RT 재사용으로 세션을 폐기한다",
  { timeout: 2000 },
  async (t) => {
    const f = fixture();
    const a = f.instance();
    const b = f.instance();
    const first = a.handle(f.request());
    await f.firstConsumed;
    // A's rotated response is still pending when B consumes the same old RT.
    const second = b.handle(f.request());
    await f.reuseDetected;
    f.release();
    const results = await Promise.all([first, second]);
    assert.deepEqual(
      results.map((r) => r.status),
      [401, 401],
    );
    assert.ok(results.every((r) => !r.headers.has("set-cookie")));
    assert.equal(f.snapshot().refreshCount, 2);
    assert.equal(f.snapshot().revoked, true);
    t.diagnostic(
      JSON.stringify({ phase: "concurrent responses", ...f.snapshot() }),
    );
    assert.equal((await a.handle(f.request())).status, 401);
    t.diagnostic(
      JSON.stringify({ phase: "follow-up old cookie", ...f.snapshot() }),
    );
  },
);

test(
  "한 BFF에서도 갱신 응답을 잃고 5초 유예가 지나면 이전 RT가 세션을 폐기한다",
  { timeout: 2000 },
  async (t) => {
    const f = fixture();
    const bff = f.instance();
    const first = bff.handle(f.request());
    await f.firstConsumed;
    f.release();
    const result = await first;
    assert.equal(result.status, 200);
    const newCookie = result.headers.get("set-cookie")!.split(";")[0];
    f.advance(5001);
    // Simulate lost Set-Cookie: client still sends the original encrypted cookie.
    assert.equal((await bff.handle(f.request())).status, 401);
    assert.equal(f.snapshot().refreshCount, 2);
    assert.equal(f.snapshot().revoked, true);
    t.diagnostic(
      JSON.stringify({ phase: "lost response retry", ...f.snapshot() }),
    );
    // Even the newly issued AT cannot access the now-revoked backend session.
    assert.equal((await bff.handle(f.request(newCookie))).status, 401);
    t.diagnostic(JSON.stringify(f.snapshot()));
  },
);
