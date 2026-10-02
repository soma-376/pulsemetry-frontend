import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSeedAccount } from "../src/lib/server/seed-auth";
import { POST } from "../src/app/api/dev/seed-login/route";

test("백엔드 A~E owner와 admin만 정확한 조직 UUID에 연결한다", () => {
  // 조직 ID 는 백엔드 tools/dev-seed/README.md 의 시드 표다(D·E 는 명시할 때만 적재하는 빈 조직).
  const ids = ["1b59ab21-1788-35e0-bfd7-23baa88a35b4", "db1c8c6b-6970-38c6-821a-eb5e61b7a180", "4769355c-a20e-327f-89fc-fef69e94dfb6",
    "e77dd38f-4e6c-33ff-84bd-79c8a53ba900", "bd6fe5c2-6fdd-3433-b77e-5d5334b0bb8e"];
  for (const [index, seed] of ["a", "b", "c", "d", "e"].entries()) {
    for (const local of ["owner", "admin"]) assert.deepEqual(resolveSeedAccount({ email: ` ${local.toUpperCase()}@seed-${seed}.example.test ` }), { email: `${local}@seed-${seed}.example.test`, organizationId: ids[index] });
  }
  for (const email of ["member2@seed-a.example.test", "member1@seed-e.example.test", "admin@codeworks.io", "owner@seed-a.example.test.evil.com", "owner@seed-f.example.test", "invalid"]) assert.equal(resolveSeedAccount({ email }), null);
});
test("시드 인증은 명시적으로 켠 로컬 환경에서만 허용하고 다른 출처 요청을 차단한다", async () => {
  const enabled = process.env.DEV_SEED_AUTH_ENABLED;
  const vercel = process.env.VERCEL;
  const request = (origin = "http://localhost:3000", host = "localhost:3000") => new Request(`http://${host}/api/dev/seed-login`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: "owner@seed-a.example.test" }) });
  try {
    delete process.env.DEV_SEED_AUTH_ENABLED;
    assert.equal((await POST(request())).status, 404);
    process.env.DEV_SEED_AUTH_ENABLED = "true";
    process.env.VERCEL = "1";
    assert.equal((await POST(request())).status, 404);
    delete process.env.VERCEL;
    assert.equal((await POST(request("https://other.example"))).status, 403);
    assert.equal((await POST(request("https://app.example", "app.example"))).status, 403);
  } finally {
    if (enabled === undefined) delete process.env.DEV_SEED_AUTH_ENABLED; else process.env.DEV_SEED_AUTH_ENABLED = enabled;
    if (vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = vercel;
  }
});
test("백엔드의 요청 제한(429)은 502로 바꾸지 않고 429와 Retry-After를 넘긴다", async () => {
  const saved = { enabled: process.env.DEV_SEED_AUTH_ENABLED, password: process.env.DEV_SEED_AUTH_PASSWORD, base: process.env.ENROLLMENT_API_URL, vercel: process.env.VERCEL, fetch: globalThis.fetch };
  const request = () => new Request("http://localhost:3000/api/dev/seed-login", { method: "POST", headers: { origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify({ email: "owner@seed-a.example.test" }) });
  const backend = (status: number, headers: Record<string, string> = {}) => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response(JSON.stringify({ error: "x", message: "사용자 인증 요청을 처리할 수 없습니다." }), { status, headers }); }) as typeof fetch;
    return calls;
  };
  try {
    process.env.DEV_SEED_AUTH_ENABLED = "true";
    process.env.DEV_SEED_AUTH_PASSWORD = "local-only-password";
    process.env.ENROLLMENT_API_URL = "http://localhost:9";
    delete process.env.VERCEL;
    const calls = backend(429, { "Retry-After": "42" });
    const limited = await POST(request());
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "42");
    assert.equal((await limited.json()).error, "rate_limited");
    assert.deepEqual(calls, ["http://localhost:9/v1/auth/login"]);
    backend(401);
    assert.equal((await POST(request())).status, 401);
    backend(500);
    assert.equal((await POST(request())).status, 502);
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [key, value] of [["DEV_SEED_AUTH_ENABLED", saved.enabled], ["DEV_SEED_AUTH_PASSWORD", saved.password], ["ENROLLMENT_API_URL", saved.base], ["VERCEL", saved.vercel]] as const)
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
