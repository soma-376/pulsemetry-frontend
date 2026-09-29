import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchIngestStatus, ingestStatusOptions } from "../src/lib/api/ingest-status";
import { ManagementError } from "../src/lib/api/management";

const response = { organizationId: "org-a", status: "unknown", reason: "source_not_available", asOf: "2026-09-29T00:00:00Z", lastReceivedAt: null };
test("header query is scoped to organization and does not invent healthy status or a receipt time", async () => {
  const original = global.fetch;
  const controller = new AbortController();
  global.fetch = async (url, init) => {
    assert.match(String(url), /organizations\/org-a\/ingest-status$/);
    assert.equal(init?.signal, controller.signal);
    return Response.json(response);
  };
  try {
    assert.deepEqual(await fetchIngestStatus("org-a", controller.signal), response);
    assert.notDeepEqual(ingestStatusOptions("org-a").queryKey, ingestStatusOptions("org-b").queryKey);
    global.fetch = async () => Response.json(response);
    await assert.rejects(fetchIngestStatus("org-b"), e => e instanceof ManagementError && e.code === "invalid_response");
    global.fetch = async () => Response.json({ error: { code: "forbidden" } }, { status: 403 });
    await assert.rejects(fetchIngestStatus("org-a"), e => e instanceof ManagementError && e.status === 403);
  } finally { global.fetch = original; }
});
