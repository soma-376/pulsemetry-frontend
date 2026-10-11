import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchIngestStatus,
  ingestStatusOptions,
} from "../src/lib/api/ingest-status";
import { ManagementError } from "../src/lib/api/management";

const response = {
  organizationId: "org-a",
  status: "unknown",
  reason: "source_not_available",
  asOf: "2026-09-29T00:00:00Z",
  lastReceivedAt: null,
};
test("header query is scoped to organization and does not invent healthy status or a receipt time", async () => {
  const original = global.fetch;
  const controller = new AbortController();
  global.fetch = async (url, init) => {
    assert.match(String(url), /organizations\/org-a\/ingest-status$/);
    assert.equal(init?.signal, controller.signal);
    return Response.json(response);
  };
  try {
    assert.deepEqual(
      await fetchIngestStatus("org-a", controller.signal),
      response,
    );
    assert.notDeepEqual(
      ingestStatusOptions("org-a").queryKey,
      ingestStatusOptions("org-b").queryKey,
    );
    global.fetch = async () => Response.json(response);
    await assert.rejects(
      fetchIngestStatus("org-b"),
      (e) => e instanceof ManagementError && e.code === "invalid_response",
    );
    global.fetch = async () =>
      Response.json({ error: { code: "forbidden" } }, { status: 403 });
    await assert.rejects(
      fetchIngestStatus("org-a"),
      (e) => e instanceof ManagementError && e.status === 403,
    );
  } finally {
    global.fetch = original;
  }
});
test("header describes the server's judgement and omits values the server left null", async () => {
  const { ingestDetails } = await import("../src/lib/api/ingest-status");
  const base = {
    organizationId: "org-a",
    asOf: "2026-09-29T00:00:00Z",
    windowMinutes: 15,
  };
  assert.deepEqual(
    ingestDetails({
      ...base,
      status: "down",
      reason: "delivery_stalled",
      lastReceivedAt: "2026-09-28T23:00:00Z",
      activeInstallations: 3,
    }),
    [
      "수집 중인 모든 기기의 전달이 멈췄습니다",
      `마지막 수신 ${new Date("2026-09-28T23:00:00Z").toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
      "보고 중인 설치 3대(최근 15분)",
    ],
  );
  assert.deepEqual(
    ingestDetails({
      ...base,
      status: "healthy",
      reason: null,
      lastReceivedAt: null,
      activeInstallations: 0,
    }),
    ["보고 중인 설치 0대(최근 15분)"],
  );
  assert.deepEqual(
    ingestDetails({
      ...base,
      status: "unknown",
      reason: "source_not_available",
      lastReceivedAt: null,
      activeInstallations: null,
    }),
    ["수집 기기의 보고가 없어 판정할 수 없습니다"],
  );
  assert.deepEqual(
    ingestDetails({
      ...base,
      status: "empty",
      reason: null,
      lastReceivedAt: null,
    }),
    ["아직 수집된 데이터가 없습니다"],
  );
  assert.deepEqual(
    ingestDetails({
      ...base,
      status: "delayed",
      reason: "new_reason",
      lastReceivedAt: null,
    }),
    ["사유 new_reason"],
  );
});
