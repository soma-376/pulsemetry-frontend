import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeRumBody, entryPage } from "../src/lib/rum/payload";
import { createRumHandler, rumConfig } from "../src/lib/rum/server";
import { createErrorGate } from "../src/lib/rum/error-gate";
const payload = {
  meta: {
    page: { url: "/teams" },
    user: { email: "secret@example.com" },
    session: { id: "secret" },
  },
  logs: [{ message: "secret" }],
  measurements: [
    {
      type: "web-vitals",
      values: { lcp: 123, delta: 99 },
      context: {
        id: "v5-123-abc",
        resource_url: "https://example.com/?token=secret",
      },
      trace: { trace_id: "secret" },
    },
  ],
};
const config = {
  endpoint: "http://127.0.0.1:12347/collect",
  origin: "http://localhost:3158",
  environment: "local" as const,
};
function request(body = JSON.stringify(payload), origin = config.origin) {
  return new Request(config.origin + "/api/rum/collect", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json", cookie: "secret" },
    body,
  });
}
test("개인정보·로그·attribution을 버리고 세 지표와 익명 측정 ID만 허용", () => {
  const clean = sanitizeRumBody(payload, "dev");
  assert.ok(clean);
  assert.equal(JSON.stringify(clean).includes("secret"), false);
  assert.deepEqual(clean.measurements[0].values, { lcp: 123 });
  assert.equal(clean.meta.app.environment, "dev");
  assert.equal(entryPage("/teams/private-team-id"), "/teams");
  for (const values of [
    { fcp: 1 },
    { lcp: -1 },
    { inp: Infinity },
    { cls: 1, lcp: 1 },
  ]) {
    assert.equal(
      sanitizeRumBody(
        { ...payload, measurements: [{ ...payload.measurements[0], values }] },
        "dev",
      ),
      null,
    );
  }
});
test("명시적으로 켠 local/dev에서만 수집 활성화", () => {
  assert.equal(rumConfig({}), null);
  assert.equal(
    rumConfig({ RUM_ENABLED: "true", RUM_ENVIRONMENT: "prod" }),
    null,
  );
});
test("프록시가 민감한 헤더를 전달하지 않고 upstream 실패를 성공으로 숨기지 않음", async () => {
  let sent = false;
  const handler = createRumHandler(async (url, options) => {
    sent = true;
    assert.equal(url, config.endpoint);
    assert.deepEqual(options?.headers, { "Content-Type": "application/json" });
    assert.equal(String(options?.body).includes("secret"), false);
    return new Response(null, { status: 202 });
  });
  assert.equal((await handler(request(), config)).status, 202);
  assert.ok(sent);
  assert.equal((await handler(request(), null)).status, 404);
  assert.equal(
    (await handler(request(undefined, "http://evil.example"), config)).status,
    403,
  );
  assert.equal((await handler(request("bad json"), config)).status, 400);
  assert.equal((await handler(request("x".repeat(17000)), config)).status, 413);
  const failed = createRumHandler(async () => {
    throw new Error("unreachable");
  });
  assert.equal((await failed(request(), config)).status, 503);
});
test("프로세스 전체 rate limit이 과도한 전송을 제한", async () => {
  const handler = createRumHandler(
    async () => new Response(null, { status: 202 }),
    () => 0,
  );
  for (let i = 0; i < 40; i++)
    assert.equal((await handler(request(), config)).status, 202);
  assert.equal((await handler(request(), config)).status, 429);
});

const exceptionPayload = {
  meta: { page: { url: "/members" }, user: { email: "private@example.test" } },
  exceptions: [
    {
      type: "TypeError",
      value: "secret token and private@example.test",
      context: {
        source: "react-boundary",
        digest: "12345",
        cause: "secret",
        email: "private@example.test",
      },
      stacktrace: {
        frames: [
          {
            filename:
              "https://private.example/_next/static/chunks/app.js?token=secret",
            function: "secretFunction",
            lineno: 10,
            colno: 20,
          },
          {
            filename: "https://private.example/members/secret",
            function: "secret",
            lineno: 1,
          },
        ],
      },
      trace: { trace_id: "secret" },
    },
  ],
};
test("브라우저 오류는 종류·정적 번들 위치만 유지하고 메시지·cause·개인정보를 제거한다", () => {
  const clean = sanitizeRumBody(exceptionPayload, "dev");
  assert.ok(clean?.exceptions);
  assert.equal(clean.exceptions[0].type, "TypeError");
  assert.equal(clean.exceptions[0].context.source, "react-boundary");
  assert.deepEqual(clean.exceptions[0].stacktrace.frames, [
    {
      filename: "/_next/static/chunks/app.js",
      function: "<anonymous>",
      lineno: 10,
      colno: 20,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(clean), /secret|private/);
  assert.deepEqual(
    sanitizeRumBody(clean, "dev", new Date(clean.exceptions[0].timestamp)),
    clean,
  );
  assert.equal(sanitizeRumBody({ meta: exceptionPayload.meta }, "dev"), null);
  assert.equal(
    sanitizeRumBody(
      {
        ...exceptionPayload,
        exceptions: Array(11).fill(exceptionPayload.exceptions[0]),
      },
      "dev",
    ),
    null,
  );
});
test("오류 payload도 기존 프록시를 통과하며 Web Vitals와 혼합할 수 있다", async () => {
  const received: string[] = [];
  const handler = createRumHandler(async (_url, init) => {
    received.push(String(init?.body));
    return new Response(null, { status: 202 });
  });
  assert.equal(
    (await handler(request(JSON.stringify(exceptionPayload)), config)).status,
    202,
  );
  assert.doesNotMatch(received[0], /secret|private/);
  const mixed = sanitizeRumBody(
    { ...exceptionPayload, measurements: payload.measurements },
    "local",
  );
  assert.equal(mixed?.measurements.length, 1);
  assert.equal(mixed?.exceptions?.length, 1);
});
test("오류 중복 5초 억제 및 분당 10건 상한은 시간창 이후 복구된다", () => {
  let time = 0;
  const allow = createErrorGate(() => time);
  assert.equal(allow("same"), true);
  assert.equal(allow("same"), false);
  time = 5000;
  assert.equal(allow("same"), true);
  for (let i = 0; i < 8; i++) assert.equal(allow(`different-${i}`), true);
  assert.equal(allow("overflow"), false);
  time = 60000;
  assert.equal(allow("overflow"), true);
});
