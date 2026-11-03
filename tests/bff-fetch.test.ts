import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { bffFetch } from "../src/lib/api/bff-fetch";

const originalFetch = globalThis.fetch;
const originalOrigin = process.env.NEXT_PUBLIC_BFF_ORIGIN;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalOrigin === undefined) delete process.env.NEXT_PUBLIC_BFF_ORIGIN;
  else process.env.NEXT_PUBLIC_BFF_ORIGIN = originalOrigin;
});

test("원격 BFF 요청은 쿠키 옵션·공통 헤더를 강제하고 요청 본문과 취소 신호를 보존한다", async () => {
  process.env.NEXT_PUBLIC_BFF_ORIGIN = "https://bff.example.test/";
  const headers = new Headers({
    Authorization: "Bearer browser-token",
    "X-Pulsemetry-Request": "0",
    "Content-Type": "application/json",
    "Idempotency-Key": "command-1",
  });
  const signal = new AbortController().signal;
  const response = new Response("busy", { status: 503 });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://bff.example.test/api/bff/auth/token?test=1");
    assert.equal(init?.credentials, "include");
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, "{}");
    assert.equal(init?.signal, signal);
    assert.equal(init?.cache, "no-store");
    const actual = new Headers(init?.headers);
    assert.equal(actual.has("Authorization"), false);
    assert.equal(actual.get("X-Pulsemetry-Request"), "1");
    assert.equal(actual.get("Content-Type"), "application/json");
    assert.equal(actual.get("Idempotency-Key"), "command-1");
    return response;
  };
  assert.equal(
    await bffFetch("/api/bff/auth/token?test=1", {
      method: "POST",
      body: "{}",
      signal,
      headers,
      credentials: "omit",
      cache: "no-store",
    }),
    response,
  );
  assert.equal(headers.get("Authorization"), "Bearer browser-token");
  assert.equal(headers.get("X-Pulsemetry-Request"), "0");
});

test("BFF origin이 없으면 동일 출처 경로를 사용한다", async () => {
  delete process.env.NEXT_PUBLIC_BFF_ORIGIN;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/bff/auth/session");
    assert.equal(init?.credentials, "include");
    assert.equal(new Headers(init?.headers).get("X-Pulsemetry-Request"), "1");
    return Response.json({ user: null });
  };
  await bffFetch("/api/bff/auth/session");
});

test("임의 목적지와 origin이 아닌 설정은 네트워크 호출 전에 거부한다", () => {
  globalThis.fetch = () => {
    assert.fail("잘못된 목적지로 요청하면 안 된다.");
  };
  process.env.NEXT_PUBLIC_BFF_ORIGIN = "https://bff.example.test";
  assert.throws(() =>
    bffFetch("https://other.example.test/api/bff/auth/session"),
  );
  assert.throws(() => bffFetch("//other.example.test/api/bff/auth/session"));
  for (const origin of [
    "https://bff.example.test/path",
    "https://user:password@bff.example.test",
    "https://bff.example.test?query=1",
    "file:///",
  ]) {
    process.env.NEXT_PUBLIC_BFF_ORIGIN = origin;
    assert.throws(() => bffFetch("/api/bff/auth/session"));
  }
});
