import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchVendorCatalog,
  plansOptions,
} from "../src/lib/api/vendor-catalog";
import { createCommands, ManagementError } from "../src/lib/api/management";
import { z } from "zod";
const product = {
  id: "server",
  provider: "server",
  displayName: "Server",
  product: "IDE",
  allowsSeatTiers: true,
};
test("catalog reads all cursors and restarts expired cursor from first page", async () => {
  const previous = global.fetch;
  const paths: URL[] = [];
  global.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    paths.push(url);
    if (paths.length === 2)
      return Response.json(
        { error: { code: "invalid_request", message: "expired" } },
        { status: 400 },
      );
    return Response.json({
      catalogVersion: "1",
      items: [product],
      totalCount: 2,
      nextCursor: paths.length === 1 || paths.length === 3 ? "next-page" : null,
    });
  };
  try {
    const result = await fetchVendorCatalog();
    assert.equal(result.items.length, 2);
    assert.deepEqual(
      paths.map((p) => p.searchParams.get("cursor")),
      [null, "next-page", null, "next-page"],
    );
  } finally {
    global.fetch = previous;
  }
});
test("plan cache separates organization, kind, and catalog version", () => {
  assert.notDeepEqual(
    plansOptions("a", "one", "1").queryKey,
    plansOptions("a", "two", "1").queryKey,
  );
  assert.notDeepEqual(
    plansOptions("a", "one", "1").queryKey,
    plansOptions("b", "one", "1").queryKey,
  );
  assert.notDeepEqual(
    plansOptions("a", "one", "1").queryKey,
    plansOptions("a", "one", "2").queryKey,
  );
});
test("uncertain POST retry reuses key, new completed action uses a new key", async () => {
  const previous = global.fetch,
    keys: string[] = [];
  global.fetch = async (_input, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
    if (keys.length === 1)
      return Response.json(
        { error: { code: "unavailable", message: "retry" } },
        { status: 503, headers: { "Retry-After": "2" } },
      );
    return Response.json({ ok: true });
  };
  try {
    const post = createCommands(),
      schema = z.object({ ok: z.boolean() });
    await assert.rejects(
      post("org", "/vendors", { kind: "server" }, schema),
      (e) => e instanceof ManagementError && e.retryAfter === 2000,
    );
    await post("org", "/vendors", { kind: "server" }, schema);
    await post("org", "/vendors", { kind: "server" }, schema);
    assert.equal(keys[0], keys[1]);
    assert.notEqual(keys[1], keys[2]);
  } finally {
    global.fetch = previous;
  }
});
