import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchInstallationCodes } from "../src/lib/api/invitations";

test("설치 코드 메타데이터는 만료된 미사용 코드도 읽고 다른 구성원 및 이미 사용한 코드를 제외한다", async () => {
  const requested: string[] = [];
  const item = (id: string, status: string, memberId = "member-a") => ({
    invitationId: id,
    email: `${memberId}@example.test`,
    role: "member",
    createdAt: "2026-10-01T00:00:00Z",
    expiresAt: "2026-10-04T00:00:00Z",
    installationUsedAt: null,
    signupUsedAt: "2026-10-01T00:00:00Z",
    revokedAt: null,
    status,
    memberId,
    memberStatus: "active",
    team: null,
    memberVersion: 1,
    delivery: {
      status: "sent",
      reason: null,
      queuedAt: "2026-10-01T00:00:00Z",
      lastAttemptAt: "2026-10-01T00:00:01Z",
      sentAt: "2026-10-01T00:00:01Z",
      failureCode: null,
      attempts: 1,
    },
  });
  const rows = await fetchInstallationCodes(
    "org-a",
    "member-a",
    undefined,
    async (path, schema) => {
      requested.push(path);
      const query = new URL(path, "http://localhost").searchParams;
      assert.equal(query.get("memberStatus"), "active");
      if (query.get("status") === "pending")
        return schema.parse({ items: [], nextCursor: null });
      if (!query.has("cursor"))
        return schema.parse({
          items: [item("another-member", "expired", "member-b")],
          nextCursor: "expired-next",
        });
      return schema.parse({
        items: [
          item("expired-unused", "expired"),
          {
            ...item("expired-used", "expired"),
            installationUsedAt: "2026-10-02T00:00:00Z",
          },
        ],
        nextCursor: null,
      });
    },
  );
  assert.deepEqual(
    rows.map((row) => [row.invitationId, row.status]),
    [["expired-unused", "expired"]],
  );
  assert.equal(requested.length, 3);
  assert.ok(requested.at(-1)?.includes("status=expired"));
  assert.ok(requested.at(-1)?.includes("cursor=expired-next"));
});
