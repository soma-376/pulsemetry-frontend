import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchSettings } from "../src/lib/api/settings";
import { ManagementError } from "../src/lib/api/management";
import { settingsFixture } from "../.storybook/fixtures/settings";
import { settingsVendorRow } from "../src/lib/settings-vendors";

test("settings read every page from one snapshot and preserve unknown totals", async () => {
  const fixture = settingsFixture(),
    original = global.fetch,
    paths: URL[] = [];
  // 둘째 페이지는 계약을 입력하지 않은 제품이다(시드 A의 Cursor).
  const missing = fixture.vendors.items.find(
    (vendor) => vendor.contract === null,
  )!;
  global.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    paths.push(url);
    return Response.json(
      paths.length === 1
        ? {
            ...fixture,
            vendors: {
              ...fixture.vendors,
              items: [fixture.vendors.items[0]],
              nextCursor: "page2",
            },
          }
        : {
            meta: fixture.meta,
            vendors: { ...fixture.vendors, items: [missing], nextCursor: null },
          },
    );
  };
  try {
    const result = await fetchSettings(fixture.meta.organizationId);
    assert.equal(result.vendors.items.length, 2);
    assert.equal(
      paths[1].searchParams.get("snapshotId"),
      fixture.meta.snapshotId,
    );
    assert.equal(result.summary.monthlySeatFeeUsd.value, "760");
    assert.equal(settingsVendorRow(result.vendors.items[1]).spendText, "-");
    assert.equal("contract" in result.vendors.items[0], false);
    assert.equal("seatSource" in result.vendors.items[0], false);
    assert.equal("ingest" in result, false);
    assert.equal(
      result.vendors.items[0].contractSeats.value,
      fixture.vendors.items[0].contractSeats.value,
    );
  } finally {
    global.fetch = original;
  }
});
test("an expired settings snapshot restarts once; organization and snapshot mixing are rejected", async () => {
  const fixture = settingsFixture(),
    original = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    if (calls === 2)
      return Response.json(
        { error: { code: "snapshot_expired", message: "expired" } },
        { status: 409 },
      );
    return Response.json({
      ...fixture,
      vendors: { ...fixture.vendors, nextCursor: calls === 1 ? "next" : null },
    });
  };
  try {
    await fetchSettings(fixture.meta.organizationId);
    assert.equal(calls, 3);
    global.fetch = async () =>
      Response.json({
        ...fixture,
        meta: { ...fixture.meta, organizationId: "another-org" },
      });
    await assert.rejects(
      fetchSettings(fixture.meta.organizationId),
      (e) => e instanceof ManagementError && e.code === "invalid_response",
    );
    calls = 0;
    global.fetch = async () =>
      Response.json(
        ++calls === 1
          ? { ...fixture, vendors: { ...fixture.vendors, nextCursor: "next" } }
          : {
              meta: { ...fixture.meta, snapshotId: "another-snapshot" },
              vendors: fixture.vendors,
            },
      );
    await assert.rejects(
      fetchSettings(fixture.meta.organizationId),
      (e) => e instanceof ManagementError && e.code === "invalid_response",
    );
  } finally {
    global.fetch = original;
  }
});

test("설정은 카드 값의 부분·불가 상태를 검증하고 0을 유효 값으로 보존한다", async () => {
  const { settingsSchema } = await import("../src/lib/api/settings");
  const { settingsValueStatus } =
    await import("../src/lib/metrics/settings-presentation");
  const fixture = settingsFixture();
  assert.deepEqual(fixture.summary.monthlySeatFeeUsd.reasons.sort(), [
    "contract_expired",
    "contract_missing",
  ]);
  assert.match(
    settingsValueStatus(fixture.summary.monthlySeatFeeUsd)!.reason,
    /만료 계약/,
  );
  fixture.summary.monthlySeatFeeUsd = {
    value: "0",
    status: "complete",
    reasons: [],
  };
  assert.equal(
    settingsSchema.parse(fixture).summary.monthlySeatFeeUsd.value,
    "0",
  );
  fixture.summary.activeSeats7d = {
    value: null,
    status: "complete",
    reasons: [],
  };
  assert.equal(settingsSchema.safeParse(fixture).success, false);
});

test("온보딩도 경량 벤더 목록의 등록 경로·판·계약 상태를 사용한다", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const { vendorsOptions } = await import("../src/lib/api/management");
  const { settingsSchema } = await import("../src/lib/api/settings");
  const data = settingsSchema.parse(settingsFixture());
  const original = global.fetch;
  global.fetch = async () =>
    Response.json({ meta: data.meta, vendors: data.vendors });
  const client = new QueryClient();
  try {
    const rows = await client.fetchQuery(
      vendorsOptions(data.meta.organizationId),
    );
    assert.equal(rows.length, data.vendors.items.length);
    assert.equal(rows[0].version, data.vendors.items[0].version);
    assert.equal(
      rows.find((row) => row.kind === "cursor")!.contractStatus,
      "missing",
    );
    assert.equal("contract" in rows[0], false);
  } finally {
    client.clear();
    global.fetch = original;
  }
});
