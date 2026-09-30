import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchInstallations, installationsOptions, notifyInstallations } from "../src/lib/api/installations";
import { failureText, fetchOperation } from "../src/lib/api/operations";
import { createCommands, ManagementError } from "../src/lib/api/management";

const org = "11111111-1111-4111-8111-111111111111";
const row = { installationId: "22222222-2222-4222-8222-222222222222", memberId: "m-1", account: "dev@example.test", team: { teamId: null, teamName: "미배정" },
  agentVersion: "0.2.0", appliedPolicyVersion: 1, lastHeartbeatAt: "2026-09-28T15:00:00Z", canNotify: true };
const page = (nextCursor: string | null, snapshotId = "snap-1") => ({ meta: { organizationId: org, snapshotId }, desiredPolicyVersion: 2,
  installations: { items: [row], totalCount: 101, nextCursor } });
const operation = (status: string, results: { status: string; reason: string | null }[]) => ({ operationId: "op-1", kind: "installation_notification", status,
  createdAt: "2026-09-29T00:00:00Z", completedAt: status === "running" ? null : "2026-09-29T00:00:05Z",
  results: results.map((result, index) => ({ targetId: `t-${index}`, action: null, ...result })), canRestore: false, restoreUntil: null, retention: null });

test("설치 목록은 적용 상태로 거르고 다음 페이지를 같은 snapshot으로 읽는다", async () => {
  const original = global.fetch, urls: URL[] = [];
  global.fetch = async input => { urls.push(new URL(String(input))); return Response.json(urls.length === 1 ? page("c1") : page(null)); };
  try {
    const first = await fetchInstallations(org, "unknown", null);
    assert.equal(urls[0].pathname, `/api/v1/organizations/${org}/installations`);
    assert.deepEqual(Object.fromEntries(urls[0].searchParams), { policyStatus: "unknown", limit: "100" });
    const options = installationsOptions(org, "unknown");
    const next = options.getNextPageParam!(first, [first], null, [null]);
    assert.deepEqual(next, { cursor: "c1", snapshotId: "snap-1" });
    await fetchInstallations(org, "unknown", next!);
    assert.deepEqual(Object.fromEntries(urls[1].searchParams), { policyStatus: "unknown", limit: "100", cursor: "c1", snapshotId: "snap-1" });
    assert.equal(options.getNextPageParam!(page(null), [page(null)], null, [null]), null);
    // 필터마다 캐시가 다르다.
    assert.notDeepEqual(installationsOptions(org, "unknown").queryKey, installationsOptions(org, "outdated").queryKey);
    // 다른 조직·다른 snapshot의 응답은 버린다.
    global.fetch = async () => Response.json(page(null, "snap-2"));
    await assert.rejects(fetchInstallations(org, "unknown", { cursor: "c1", snapshotId: "snap-1" }), e => e instanceof ManagementError && e.code === "invalid_response");
    global.fetch = async () => Response.json({ ...page(null), meta: { organizationId: "other", snapshotId: "snap-1" } });
    await assert.rejects(fetchInstallations(org, "outdated", null), e => e instanceof ManagementError && e.code === "invalid_response");
  } finally { global.fetch = original; }
});

test("안내는 enrollment로 멱등 키와 함께 보내고 실패 재시도는 같은 키를 쓴다", async () => {
  const original = global.fetch, calls: { url: string; init: RequestInit }[] = [];
  let fail = true;
  global.fetch = async (input, init) => {
    calls.push({ url: String(input), init: init! });
    if (fail) { fail = false; return Response.json({ error: { code: "unavailable", message: "x" } }, { status: 503 }); }
    return Response.json(operation("running", [{ status: "pending", reason: null }]), { status: 202 });
  };
  try {
    const post = createCommands();
    await assert.rejects(notifyInstallations(post, org, [row.installationId], 2), e => e instanceof ManagementError && e.status === 503);
    const accepted = await notifyInstallations(post, org, [row.installationId], 2);
    assert.equal(accepted.status, "running");
    assert.match(calls[0].url, new RegExp(`/api/v1/organizations/${org}/installation-update-notifications$`));
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { installationIds: [row.installationId], expectedPolicyVersion: 2 });
    const key = (call: { init: RequestInit }) => new Headers(call.init.headers).get("Idempotency-Key");
    assert.ok(key(calls[0]));
    assert.equal(key(calls[1]), key(calls[0]));
    // 채널이 없는 서버는 422 — 접수로 보이지 않는다.
    global.fetch = async () => Response.json({ error: { code: "notification_channel_unavailable", message: "x" } }, { status: 422 });
    await assert.rejects(notifyInstallations(post, org, ["x"], 2), e => e instanceof ManagementError && e.code === "notification_channel_unavailable" && /메일 발송이 설정되지 않아/.test(e.message));
  } finally { global.fetch = original; }
});

test("작업 상태는 Retry-After가 있는 동안만 다시 묻고 부분 실패를 대상별로 돌려준다", async () => {
  const original = global.fetch;
  try {
    global.fetch = async input => {
      assert.match(String(input), new RegExp(`/api/v1/organizations/${org}/operations/op-1$`));
      return Response.json(operation("running", [{ status: "pending", reason: null }]), { headers: { "Retry-After": "2" } });
    };
    assert.equal((await fetchOperation(org, "op-1")).retryAfterMs, 2000);
    global.fetch = async () => Response.json(operation("partially_failed", [{ status: "failed", reason: "recipient_rejected" }, { status: "succeeded", reason: null }]));
    const done = await fetchOperation(org, "op-1");
    assert.equal(done.retryAfterMs, null);
    assert.deepEqual(done.operation.results.map(result => [result.status, failureText(result.reason)]), [["failed", "수신 주소가 거부됨"], ["succeeded", "사유 없음"]]);
    assert.equal(failureText("brand_new_code"), "brand_new_code");
    global.fetch = async () => Response.json({ ...operation("succeeded", []), operationId: "op-2" });
    await assert.rejects(fetchOperation(org, "op-1"), e => e instanceof ManagementError && e.code === "invalid_response");
    global.fetch = async () => Response.json({ error: { code: "not_found", message: "x" } }, { status: 404 });
    await assert.rejects(fetchOperation(org, "op-1"), e => e instanceof ManagementError && e.status === 404);
  } finally { global.fetch = original; }
});
