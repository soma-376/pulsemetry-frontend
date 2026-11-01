import { createValkeySessionStore } from "../src/lib/server/valkey-session-store";
import { memorySessionCommands } from "./support/session-commands";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createBff } from "../src/lib/server/bff";
import { createSessionReferenceCookie } from "../src/lib/server/session-cookie";
import {
  createServerLogger,
  type ServerLogRecord,
} from "../src/lib/server/logger";

const origin = "https://app.example.test";
const org = "11111111-1111-4111-8111-111111111111";
const config = {
  origin,
  keys: ["a1".repeat(32)],
  enrollmentUrl: "https://enrollment.example.test",
  dashboardUrl: "https://dashboard.example.test",
};
async function fixture(fetcher: typeof fetch) {
  let time = 1_800_000_000_000;
  const records: ServerLogRecord[] = [];
  const logger = createServerLogger(
    (line) => {
      records.push(JSON.parse(line));
    },
    () => undefined,
  );
  const store = createValkeySessionStore(
    memorySessionCommands(() => time).commands,
    { ...config, environment: "dev" },
    () => time,
  );
  const bff = createBff(
    { ...config, sessionStore: store },
    fetcher,
    () => time,
    logger,
  );
  const codec = createSessionReferenceCookie(config, () => time);
  const session = {
    id: org,
    organizationId: org,
    accessToken: "secret-at",
    refreshToken: "secret-rt",
    accessTokenExpiresAt: time + 300_000,
    sessionExpiresAt: time + 86400_000,
  };
  await store.create(session);
  const saved = codec
    .write(new Response(), session)
    .headers.get("set-cookie")!
    .split(";")[0];
  return {
    records,
    advance: (ms: number) => {
      time += ms;
    },
    request: (path: string) =>
      bff.handle(
        new Request(`${origin}/api/bff/${path}`, {
          headers: {
            "X-Pulsemetry-Request": "1",
            Origin: origin,
            Cookie: saved,
          },
        }),
      ),
  };
}

test("auth upstream 429 records provenance once, preserves retry response, omits secrets", async () => {
  const f = await fixture(async () =>
    Response.json(
      { secret: "private upstream body" },
      { status: 429, headers: { "Retry-After": "8" } },
    ),
  );
  const response = await f.request("auth/session?token=private");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "8");
  assert.equal((await response.json()).error.code, "rate_limited");
  assert.equal(f.records.length, 1);
  assert.equal(f.records[0].level, "WARN");
  assert.equal(f.records[0].source, "upstream");
  assert.equal(f.records[0].upstreamService, "enrollment");
  assert.equal(f.records[0].upstreamStatus, 429);
  assert.doesNotMatch(JSON.stringify(f.records), /secret|private|11111111/);
});

test("business upstream failures retain body bytes and headers without logging the body", async () => {
  const body = '{"error":{"code":"version_conflict"},"sensitive":"private"}';
  for (const status of [409, 503]) {
    const f = await fixture(
      async () => new Response(body, { status, headers: { ETag: '"v2"' } }),
    );
    const response = await f.request(
      `enrollment/api/v1/organizations/${org}/members?email=private`,
    );
    assert.equal(response.status, status);
    assert.equal(await response.text(), body);
    assert.equal(response.headers.get("etag"), '"v2"');
    assert.equal(f.records.length, 1);
    assert.equal(f.records[0].level, status === 503 ? "ERROR" : "WARN");
    assert.equal(f.records[0].source, "upstream");
    assert.doesNotMatch(
      JSON.stringify(f.records),
      /private|sensitive|11111111/,
    );
  }
});

test("local auth rejection and upstream transport failure are distinguishable", async () => {
  const f = await fixture(async () => {
    throw new Error("private URL token");
  });
  assert.equal((await f.request("unknown/private")).status, 404);
  assert.equal(f.records[0].source, "bff");
  assert.equal((await f.request("auth/session")).status, 503);
  assert.equal(f.records[1].source, "upstream");
  assert.equal(f.records[1].level, "ERROR");
  assert.doesNotMatch(JSON.stringify(f.records), /private|token/);
});

test("stable session reference reads the shared rotated token without error logs", async () => {
  let calls = 0;
  const f = await fixture(async (input) => {
    calls++;
    return String(input).endsWith("/auth/refresh")
      ? Response.json({
          access_token: "next-at",
          refresh_token: "next-rt",
          token_type: "Bearer",
          expires_in: 300,
        })
      : Response.json({
          memberId: "member",
          organizationId: org,
          organizationName: "org",
          email: "private@example.test",
          displayName: null,
          role: "admin",
        });
  });
  f.advance(300_000);
  assert.equal((await f.request("auth/session")).status, 200);
  const before = calls;
  f.advance(6000);
  const response = await f.request("auth/session");
  assert.equal(response.status, 200);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(calls, before + 1);
  assert.equal(f.records.length, 0);
});
