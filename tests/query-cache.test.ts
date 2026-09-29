import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { clearBackendSession, seedLogin, sessionFetch, subscribeBackendIdentityChange } from "../src/lib/api/session";
import { organizationKey } from "../src/lib/api/query-keys";
import { onboardingOptions, vendorsOptions, teamsOptions } from "../src/lib/api/management";
import { overviewQueryOptions } from "../src/lib/api/overview";
import { overviewSettingsOptions } from "../src/lib/api/overview-vendors";
import { catalogOptions, plansOptions } from "../src/lib/api/vendor-catalog";

const org = "11111111-1111-4111-8111-111111111111";
test("조직 무효화는 페이지에 관계없이 적용되고 다른 조직 캐시는 유지한다", async () => {
  const client = new QueryClient();
  const keys: QueryKey[] = [onboardingOptions(org).queryKey, vendorsOptions(org).queryKey, teamsOptions(org).queryKey,
    overviewSettingsOptions(org).queryKey, catalogOptions(org).queryKey, plansOptions(org, "claude_team", "1").queryKey,
    overviewQueryOptions({ organizationId: org, startDate: "2026-09-01", endDate: "2026-09-28", timeZone: "Asia/Seoul", compare: "none" }).queryKey];
  keys.forEach(key => client.setQueryData(key, { saved: true }));
  const other: QueryKey = overviewSettingsOptions("other-org").queryKey;
  client.setQueryData(other, { saved: true });
  await client.invalidateQueries({ queryKey: organizationKey(org), refetchType: "none" });
  keys.forEach(key => assert.equal(client.getQueryState(key)?.isInvalidated, true));
  assert.equal(client.getQueryState(other)?.isInvalidated, false);
  client.clear();
});

test("토큰 갱신은 캐시를 유지하고 로그아웃·같은 조직의 계정 전환은 캐시와 요청을 정리한다", async context => {
  clearBackendSession();
  const client = new QueryClient();
  let changes = 0;
  const unsubscribe = subscribeBackendIdentityChange(() => { changes++; client.clear(); });
  let user = "first", token = "initial", expired = false;
  const tokens = () => ({ access_token: token, refresh_token: "refresh", token_type: "Bearer", expires_in: 300 });
  context.mock.method(globalThis, "fetch", async (input: string) => {
    if (input === "/api/dev/seed-login") return Response.json({ tokens: tokens(), user: { memberId: user, organizationId: org, organizationName: "테스트", email: `${user}@example.test`, displayName: user, role: "admin" } });
    if (input.endsWith("/v1/auth/refresh")) {
      if (expired) return Response.json({}, { status: 401 });
      token = "renewed"; return Response.json(tokens());
    }
    return token === "initial" || expired ? Response.json({}, { status: 401 }) : Response.json({ ok: true });
  });
  try {
    await seedLogin("first@example.test");
    client.setQueryData(["private"], "first-user-data");
    assert.equal((await sessionFetch("http://localhost/api/data")).status, 200);
    assert.equal(changes, 1);
    assert.equal(client.getQueryData(["private"]), "first-user-data");
    let aborted = false;
    const pending = client.fetchQuery({ queryKey: ["pending"], queryFn: ({ signal }) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("cancelled", "AbortError")); });
    }) }).catch(() => undefined);
    clearBackendSession();
    await pending;
    assert.equal(aborted, true);
    assert.equal(client.getQueryCache().getAll().length, 0);
    user = "second";
    await seedLogin("second@example.test");
    assert.equal(client.getQueryData(["private"]), undefined);
    client.setQueryData(["private"], "second-user-data");
    user = "first";
    await seedLogin("first@example.test");
    assert.equal(client.getQueryData(["private"]), undefined);
    client.setQueryData(["private"], "first-user-data");
    expired = true;
    await assert.rejects(sessionFetch("http://localhost/api/data"));
    assert.equal(client.getQueryCache().getAll().length, 0);
  } finally { unsubscribe(); clearBackendSession(); client.clear(); }
});
