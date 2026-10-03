import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchSettings } from "../src/lib/api/settings";
import { ManagementError } from "../src/lib/api/management";
import { settingsFixture } from "../.storybook/fixtures/settings";
import { settingsVendorDraft, settingsVendorRow } from "../src/lib/settings-vendors";

test("settings read every page from one snapshot and preserve unknown totals", async () => {
  const fixture = settingsFixture(), original = global.fetch, paths: URL[] = [];
  global.fetch = async input => {
    const url = new URL(String(input), "http://localhost"); paths.push(url);
    return Response.json(paths.length === 1 ? { ...fixture, vendors: { ...fixture.vendors, items: [fixture.vendors.items[0]], nextCursor: "page2" } }
      : { meta: fixture.meta, vendors: { ...fixture.vendors, items: [fixture.vendors.items[1]], nextCursor: null } });
  };
  try {
    const result = await fetchSettings(fixture.meta.organizationId);
    assert.equal(result.vendors.items.length, 2);
    assert.equal(paths[1].searchParams.get("snapshotId"), fixture.meta.snapshotId);
    assert.equal(result.summary.monthlySeatFeeUsd, "360");
    assert.equal(settingsVendorRow(result.vendors.items[1]).spendText, "-");
    assert.equal(settingsVendorDraft(result.vendors.items[0]).tiers?.[0].fee, fixture.vendors.items[0].contract!.tiers[0].monthlyFeePerSeatUsd);
  } finally { global.fetch = original; }
});
test("an expired settings snapshot restarts once; organization and snapshot mixing are rejected", async () => {
  const fixture = settingsFixture(), original = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    if (calls === 2) return Response.json({ error: { code: "snapshot_expired", message: "expired" } }, { status: 409 });
    return Response.json({ ...fixture, vendors: { ...fixture.vendors, nextCursor: calls === 1 ? "next" : null } });
  };
  try {
    await fetchSettings(fixture.meta.organizationId);
    assert.equal(calls, 3);
    global.fetch = async () => Response.json({ ...fixture, meta: { ...fixture.meta, organizationId: "another-org" } });
    await assert.rejects(fetchSettings(fixture.meta.organizationId), e => e instanceof ManagementError && e.code === "invalid_response");
    calls = 0;
    global.fetch = async () => Response.json(++calls === 1 ? { ...fixture, vendors: { ...fixture.vendors, nextCursor: "next" } }
      : { meta: { ...fixture.meta, snapshotId: "another-snapshot" }, vendors: fixture.vendors });
    await assert.rejects(fetchSettings(fixture.meta.organizationId), e => e instanceof ManagementError && e.code === "invalid_response");
  } finally { global.fetch = original; }
});
