import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchIngestStatus,
  ingestStatusOptions,
  ingestStatusSchema,
  transmissionLossLabel,
  fetchLossInstallations,
  lossInstallationsOptions,
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

const loss = {
  payloadCount: 10,
  affectedInstallationCount: 2,
  windowStart: "2026-10-28T00:00:00Z",
  windowEnd: "2026-11-04T00:00:00Z",
  availableFrom: "2026-10-28T00:00:00Z",
  availability: "complete" as const,
  reasons: [],
};

test("손실 집계는 확인된 0·부분·불가·구버전 누락을 구분한다", () => {
  assert.equal(ingestStatusSchema.parse(response).transmissionLoss, undefined);
  assert.equal(transmissionLossLabel(undefined), "집계 정보 없음");
  const zero = ingestStatusSchema.parse({
    ...response,
    transmissionLoss: {
      ...loss,
      payloadCount: 0,
      affectedInstallationCount: 0,
    },
  });
  assert.equal(
    transmissionLossLabel(zero.transmissionLoss),
    "최근 7일 보고된 전송 손실 0건",
  );
  const partial = ingestStatusSchema.parse({
    ...response,
    transmissionLoss: {
      ...loss,
      availability: "partial",
      reasons: ["counter_decreased"],
    },
  });
  assert.equal(
    transmissionLossLabel(partial.transmissionLoss),
    "최근 7일 보고된 전송 손실 10건 · 일부 집계",
  );
  const unavailable = ingestStatusSchema.parse({
    ...response,
    transmissionLoss: {
      ...loss,
      payloadCount: null,
      affectedInstallationCount: null,
      availability: "unavailable",
      reasons: ["query_failed"],
    },
  });
  assert.equal(
    transmissionLossLabel(unavailable.transmissionLoss),
    "최근 7일 전송 손실 집계 불가",
  );
  for (const invalid of [
    { ...loss, payloadCount: null },
    { ...loss, availability: "unavailable" },
    { ...loss, payloadCount: -1 },
  ])
    assert.equal(
      ingestStatusSchema.safeParse({ ...response, transmissionLoss: invalid })
        .success,
      false,
    );
});

test("손실 기기는 헤더 시각과 조직·snapshot을 고정하고 분석 필터를 보내지 않는다", async () => {
  const original = global.fetch;
  const controller = new AbortController();
  const page = {
    meta: {
      organizationId: "org-a",
      snapshotId: "snapshot",
      asOf: loss.windowEnd,
    },
    windowStart: loss.windowStart,
    windowEnd: loss.windowEnd,
    installations: {
      items: [
        {
          installationId: "i1",
          deviceName: "개발 기기",
          memberId: "m1",
          account: "member@example.test",
          payloadCount: 10,
          lastObservedAt: "2026-11-03T01:00:00Z",
          status: "revoked",
        },
      ],
      totalCount: 1,
      nextCursor: null,
    },
  };
  global.fetch = async (url, init) => {
    const query = new URL(String(url), "https://example.test").searchParams;
    assert.deepEqual([...query.keys()].sort(), [
      "cursor",
      "limit",
      "snapshotId",
      "windowEnd",
    ]);
    assert.equal(query.get("windowEnd"), loss.windowEnd);
    assert.equal(query.get("snapshotId"), "snapshot");
    assert.equal(init?.signal, controller.signal);
    return Response.json(page);
  };
  try {
    assert.deepEqual(
      await fetchLossInstallations(
        "org-a",
        loss.windowEnd,
        { cursor: "next", snapshotId: "snapshot" },
        controller.signal,
      ),
      page,
    );
    global.fetch = async () => Response.json(page);
    await assert.rejects(
      fetchLossInstallations("org-b", loss.windowEnd, null),
      ManagementError,
    );
    await assert.rejects(
      fetchLossInstallations("org-a", "2026-11-03T00:00:00Z", null),
      ManagementError,
    );
    await assert.rejects(
      fetchLossInstallations("org-a", loss.windowEnd, {
        cursor: "next",
        snapshotId: "different",
      }),
      ManagementError,
    );
    assert.notDeepEqual(
      lossInstallationsOptions("org-a", loss.windowEnd).queryKey,
      lossInstallationsOptions("org-b", loss.windowEnd).queryKey,
    );
    assert.notDeepEqual(
      lossInstallationsOptions("org-a", loss.windowEnd).queryKey,
      lossInstallationsOptions("org-a", loss.windowStart).queryKey,
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
    ],
  );
  assert.deepEqual(
    ingestDetails(
      {
        ...base,
        status: "down",
        reason: "installations_silent",
        lastReceivedAt: "2026-09-27T14:00:00Z",
        activeInstallations: 0,
      },
      true,
    ),
    ["마지막 수신 2026년 9월 27일 23:00"],
  );
  assert.deepEqual(
    ingestDetails({
      ...base,
      status: "healthy",
      reason: null,
      lastReceivedAt: null,
      activeInstallations: 0,
    }),
    [],
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
