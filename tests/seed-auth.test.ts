import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSeedAccount } from "../src/lib/server/seed-auth";
import { POST } from "../src/app/api/dev/seed-login/route";

test("백엔드 A/B/C owner와 admin만 정확한 조직 UUID에 연결한다", () => {
  const ids = ["1b59ab21-1788-35e0-bfd7-23baa88a35b4", "db1c8c6b-6970-38c6-821a-eb5e61b7a180", "4769355c-a20e-327f-89fc-fef69e94dfb6"];
  for (const [index, seed] of ["a", "b", "c"].entries()) {
    for (const local of ["owner", "admin"]) assert.deepEqual(resolveSeedAccount({ email: ` ${local.toUpperCase()}@seed-${seed}.example.test ` }), { email: `${local}@seed-${seed}.example.test`, organizationId: ids[index] });
  }
  for (const email of ["member2@seed-a.example.test", "admin@codeworks.io", "owner@seed-a.example.test.evil.com", "owner@seed-d.example.test", "invalid"]) assert.equal(resolveSeedAccount({ email }), null);
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
