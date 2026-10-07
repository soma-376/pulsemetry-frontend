import { test } from "node:test";
import assert from "node:assert/strict";
import { InquiryError, submitInquiry } from "../src/lib/api/inquiries";

const input = { company: "코드웍스", email: "lead@example.test" };
const receipt = {
  inquiryId: "0b7a3c2e-0000-4000-8000-000000000001",
  status: "received",
  receivedAt: "2026-09-30T13:43:38.322Z",
};
type Call = {
  url: string;
  method?: string;
  headers: Headers;
  body: unknown;
  credentials?: string;
};

function stub(reply: () => Response | Promise<Response>) {
  const calls: Call[] = [],
    original = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
      credentials: init?.credentials,
    });
    return reply();
  };
  return {
    calls,
    restore: () => {
      global.fetch = original;
    },
  };
}
const failure =
  (
    status: number,
    error: string,
    message: string,
    headers: Record<string, string> = {},
  ) =>
  () =>
    Response.json({ error, message }, { status, headers });
const rejected =
  (check: (error: InquiryError) => boolean) => (error: unknown) =>
    error instanceof InquiryError && check(error);

test("an inquiry is posted to the public enrollment path without a session and returns the server receipt", async () => {
  const { calls, restore } = stub(() =>
    Response.json(receipt, { status: 201 }),
  );
  try {
    assert.deepEqual(await submitInquiry(input), receipt);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://localhost:8080/v1/inquiries");
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, input);
    assert.equal(calls[0].headers.get("Content-Type"), "application/json");
    assert.equal(calls[0].headers.has("Authorization"), false);
    assert.equal(calls[0].credentials, "omit");
  } finally {
    restore();
  }
});

test("a success without a receipt number or time is not shown as accepted", async () => {
  for (const body of [
    {},
    { ...receipt, inquiryId: "" },
    { ...receipt, receivedAt: "yesterday" },
    { inquiryId: receipt.inquiryId, status: "received" },
  ]) {
    const { restore } = stub(() => Response.json(body, { status: 201 }));
    try {
      await assert.rejects(
        () => submitInquiry(input),
        rejected((error) => error.code === "invalid_response"),
      );
    } finally {
      restore();
    }
  }
});

test("validation errors show the server's sentence; the request limit tells how long to wait", async () => {
  let server = stub(
    failure(400, "invalid_request", "회사 이메일 형식을 확인하세요."),
  );
  try {
    await assert.rejects(
      () => submitInquiry(input),
      rejected(
        (error) =>
          error.status === 400 &&
          error.code === "invalid_request" &&
          error.message === "회사 이메일 형식을 확인하세요.",
      ),
    );
  } finally {
    server.restore();
  }

  server = stub(
    failure(
      429,
      "rate_limited",
      "문의 요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
      { "Retry-After": "53" },
    ),
  );
  try {
    await assert.rejects(
      () => submitInquiry(input),
      rejected(
        (error) =>
          error.status === 429 &&
          error.code === "rate_limited" &&
          error.retryAfterSeconds === 53 &&
          /53초 뒤에 다시 시도/.test(error.message),
      ),
    );
  } finally {
    server.restore();
  }

  // 대기 시간을 읽지 못해도 0초라고 말하지 않는다.
  server = stub(failure(429, "rate_limited", "x"));
  try {
    await assert.rejects(
      () => submitInquiry(input),
      rejected(
        (error) =>
          error.retryAfterSeconds === null &&
          /잠시 후 다시 시도/.test(error.message) &&
          !/0초/.test(error.message),
      ),
    );
  } finally {
    server.restore();
  }
});

test("a closed intake, a server failure and a network failure are told apart and never look like success", async () => {
  let server = stub(
    failure(
      404,
      "not_found",
      "요청한 주소를 찾을 수 없습니다. CLI 를 최신 버전으로 업데이트한 뒤 다시 시도하세요.",
    ),
  );
  try {
    // 꺼진 서버의 404 문장은 CLI 사용자용이다. 폼에는 싣지 않는다.
    await assert.rejects(
      () => submitInquiry(input),
      rejected(
        (error) =>
          error.status === 404 &&
          /온라인 문의를 받지 않습니다/.test(error.message) &&
          !/CLI/.test(error.message),
      ),
    );
  } finally {
    server.restore();
  }

  server = stub(
    failure(
      503,
      "inquiry_unavailable",
      "문의를 접수하지 못했습니다. 잠시 후 다시 시도하세요.",
      { "Retry-After": "1" },
    ),
  );
  try {
    await assert.rejects(
      () => submitInquiry(input),
      rejected(
        (error) =>
          error.status === 503 &&
          error.code === "inquiry_unavailable" &&
          /접수하지 못했습니다/.test(error.message),
      ),
    );
  } finally {
    server.restore();
  }

  server = stub(
    () => new Response("<html>bad gateway</html>", { status: 502 }),
  );
  try {
    await assert.rejects(
      () => submitInquiry(input),
      rejected(
        (error) =>
          error.status === 502 &&
          error.code === "unavailable" &&
          /접수하지 못했습니다/.test(error.message),
      ),
    );
  } finally {
    server.restore();
  }

  server = stub(() => {
    throw new TypeError("fetch failed");
  });
  try {
    await assert.rejects(
      () => submitInquiry(input),
      rejected(
        (error) =>
          error.code === "network" &&
          error.status === 0 &&
          /연결하지 못했습니다/.test(error.message),
      ),
    );
  } finally {
    server.restore();
  }
});
