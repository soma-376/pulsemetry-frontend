import type { Page } from "@playwright/test";
import { allowHttpErrors, dashboardBase, enrollmentBase, expect, test, seedOrganizations } from "./fixtures";
import { apiSession, injectSession, seedPeriod, seedSession, type StoredSession } from "./helpers";
import { PreparationError } from "./harness";

// 권한 경계 — 대시보드는 owner·admin 만(서버 enrollment 명세 §12, 대시보드 명세 §1). 구성원(member)의 조회·관리는 403 이고, 다른 조직의 대시보드 경로도 403 이다.
// 역할이 바뀐 사람의 기존 AT 는 다음 요청에서 401 이고 갱신한 AT 가 새 역할을 싣는다(서버 ADR 0036). 화면은 서버 응답대로 안내한다.
// 시험 계정은 fresh 조직 E 에 관리자 API 로 초대하고 실제 IdP 인증으로 연결한다 — 가입 UI 는 쓰지 않는다(V-D5). 시드 A·B·C 의 명단을 바꾸지 않는다.
const E = { seed: "e", id: "bd6fe5c2-6fdd-3433-b77e-5d5334b0bb8e" };
const O = `/api/v1/organizations/${E.id}`;
const MEMBER = "perm-member@seed-e.example.test";
const ADMIN = "perm-admin@seed-e.example.test";
const FORBIDDEN = [
  { status: 403, path: /^\/api\/bff\/auth\/session$/, reason: "BFF가 관리자 화면 접근을 거부한다" },
  { status: 403, path: /^\/api\/v1\/organizations\//, reason: "구성원·다른 조직의 대시보드·관리 조회는 403 이다 — 화면이 권한 안내를 하는지 시험한다" },
  { status: 403, path: /^\/api\/v1\/vendor-catalog/, reason: "공통 카탈로그도 관리자 조회다 — 구성원은 403" },
];

/** 시험 코드가 Node 에서 보내는 관리 요청(앱의 요청이 아니다). */
async function api(session: StoredSession, origin: string, path: string, method = "GET", body?: unknown) {
  const response = await fetch(origin + path, { method, signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${session.tokens.access_token}`, ...(body === undefined ? {} : { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

/** 조직 E 에 [email] 계정을 [role] 로 둔다 — 없으면 초대하고 IdP 인증으로 연결한다. 있으면 역할만 맞춘다. 구성원 ID 를 돌려준다. */
async function ensureAccount(owner: StoredSession, email: string, role: "admin" | "member") {
  const invited = await api(owner, enrollmentBase(), `${O}/invitations/batch`, "POST", { invitations: [{ email, teamId: null, role }] });
  const result = invited.body?.results?.[0];
  if (!["issued", "already_member"].includes(result?.status)) {
    throw new PreparationError(`${email} 초대 → ${invited.status} ${JSON.stringify(result ?? invited.body)}`);
  }
  if (result?.status === "issued") await apiSession(E.id, email);
  const member = await roster(owner, email);
  if (member.role !== role && !(role === "admin" && member.role === "owner")) await setRole(owner, email, role);
  return member.memberId;
}
async function roster(owner: StoredSession, email: string) {
  const { start, end } = seedPeriod();
  const members = await api(owner, dashboardBase(), `${O}/members?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul&limit=100&q=${encodeURIComponent(email)}`);
  const found = (members.body?.members?.items ?? []).find((item: { account: string }) => item.account === email) as { memberId: string; role: string; version: number } | undefined;
  if (!found) throw new PreparationError(`${email} 이 조직 E 의 명단에 없습니다(HTTP ${members.status}).`);
  return found;
}
async function setRole(owner: StoredSession, email: string, role: "admin" | "member") {
  const member = await roster(owner, email);
  const saved = await api(owner, enrollmentBase(), `${O}/members/${member.memberId}`, "PATCH", { expectedVersion: member.version, role });
  if (saved.status !== 200) throw new PreparationError(`${email} 역할 변경 → HTTP ${saved.status}`);
}
const main = (page: Page) => page.getByRole("main");

test("PERM-MEMBER-E @p1 @read 구성원 세션은 개요·팀·구성원·설정에서 권한 안내만 보고 데이터와 관리 버튼이 없다", async ({ page }) => {
  allowHttpErrors(...FORBIDDEN);
  const owner = await seedSession(`owner@seed-${E.seed}.example.test`);
  await ensureAccount(owner, MEMBER, "member");
  const session = await apiSession(E.id, MEMBER);
  expect(session.user.role).toBe("member");
  await injectSession(page, session, "/overview");
  for (const path of ["/overview", "/teams", "/members", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("alert").filter({ hasText: "이 화면에 접근할 권한이 없습니다" })).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "구성원 목록", exact: true })).toHaveCount(0);
  }
});

test("PERM-ROLE-E @p1 @write 다른 세션이 관리자를 구성원으로 내리면 그 사람의 다음 요청부터 권한 안내이고, 다시 올리면 다음 요청부터 조회된다", async ({ page }) => {
  allowHttpErrors(...FORBIDDEN, { status: 401, path: /^\/api\/v1\/organizations\//, reason: "역할이 바뀐 사람의 기존 AT 는 다음 요청에서 401 — 갱신으로 넘어간다(서버 ADR 0036)" });
  const owner = await seedSession(`owner@seed-${E.seed}.example.test`);
  await ensureAccount(owner, ADMIN, "admin");
  await injectSession(page, await apiSession(E.id, ADMIN), "/teams");
  await expect(main(page).getByRole("heading", { name: "팀 분석", exact: true })).toBeVisible();
  await expect(main(page)).not.toContainText("권한이 없습니다");
  await expect(page.getByRole("navigation")).toContainText("관리자");

  // 소유자가 다른 세션(Node)에서 이 사람을 구성원으로 내린다. 화면은 다시 로그인하지 않는다.
  await setRole(owner, ADMIN, "member");
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "이 화면에 접근할 권한이 없습니다" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);

  await setRole(owner, ADMIN, "admin");
  await page.reload();
  await expect(main(page).getByRole("heading", { name: "팀 분석", exact: true })).toBeVisible();
  await expect(main(page)).not.toContainText("권한이 없습니다");
  await expect(page.getByRole("navigation")).toContainText("관리자");
});

test("PERM-OTHER-ORG @p1 @read 저장된 세션의 조직이 토큰과 다르면(다른 조직 경로) 서버의 403 대로 권한 안내를 하고 그 조직의 데이터를 보이지 않는다", async ({ page }) => {
  allowHttpErrors(...FORBIDDEN);
  const [A, , C] = seedOrganizations;
  const session = await seedSession(`owner@seed-${A.seed}.example.test`);
  // 시드 A 의 토큰으로 시드 C 의 경로를 부르게 한다 — 대시보드는 토큰의 조직이 아닌 경로를 403 으로 거절한다.
  await injectSession(page, { ...session, user: { ...session.user, organizationId: C.id } }, "/overview");
  await expect(page.getByRole("alert").filter({ hasText: "이 화면에 접근할 권한이 없습니다" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.goto("/teams");
  await expect(page.getByRole("alert").filter({ hasText: "이 화면에 접근할 권한이 없습니다" })).toBeVisible();
});
