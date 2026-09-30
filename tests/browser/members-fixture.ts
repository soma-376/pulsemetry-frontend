import { test, type Page } from "@playwright/test";

/** 구성원 화면 UI 테스트용 응답. 실제 서버 검증은 tests/e2e/members-read.spec.ts가 한다. */
export const fixtureTeams = [
  { teamId: "team-platform", teamName: "플랫폼", version: 1 },
  { teamId: "team-product", teamName: "제품", version: 1 },
  { teamId: "team-data", teamName: "데이터", version: 1 },
];
const pad = (value: number) => String(value).padStart(2, "0");
const usage = (cost: number, sessions: number) => ({ activeUsers: 1, sessionCount: sessions, equivalentCostUsd: cost.toFixed(2),
  tokens: { inputUncached: null, output: null, cacheRead: null, cacheWrite: null, total: null } });

export type FixtureMember = ReturnType<typeof fixtureMembers>[number];
/** 45명. 다섯 명마다 사용 기록이 없고, 네 명마다 기간 내 사용이 없고, 아홉 명마다 팀이 없다. 서버처럼 비용 내림차순이다. */
export function fixtureMembers(count = 45) {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const team = n % 9 === 0 ? { teamId: null, teamName: "미배정" } : { teamId: fixtureTeams[n % 3].teamId, teamName: fixtureTeams[n % 3].teamName };
    const kind = n % 5 === 0 ? "unobserved" : n % 4 === 0 ? "idle" : "active";
    return {
      memberId: `member-${pad(n)}`, account: `user${pad(n)}@codeworks.io`, displayName: `사용자 ${pad(n)}`, team,
      role: n <= 2 ? "admin" : "member", status: "active", version: 1000 + n,
      periodUsage: kind === "active" ? usage((n * 7) % 50 + n / 100, n) : null,
      lastUsedAt: kind === "unobserved" ? null : `2026-09-${pad((n % 20) + 1)}T0${n % 10}:00:00Z`,
      observation: "partial", seatState: "unknown",
    };
  }).sort((a, b) => Number(b.periodUsage?.equivalentCostUsd ?? -1) - Number(a.periodUsage?.equivalentCostUsd ?? -1) || a.memberId.localeCompare(b.memberId));
}
/** 서버가 후보로 준 구성원 — 기간 내 사용이 없는 앞의 셋. */
export const fixtureCandidates = (members: FixtureMember[]) => members.filter((member) => !member.periodUsage && member.lastUsedAt).slice(0, 3);
export const fixtureInvitations = [
  { invitationId: "invite-1", email: "waiting@codeworks.io", role: "member", createdAt: "2026-09-20T00:00:00Z", expiresAt: "2026-09-24T00:00:00Z", installationUsedAt: null, signupUsedAt: null, revokedAt: null,
    status: "pending", memberId: "member-waiting", memberStatus: "invited", team: { teamId: "team-platform", teamName: "플랫폼" }, memberVersion: 1 },
  { invitationId: "invite-2", email: "expired@codeworks.io", role: "admin", createdAt: "2026-09-01T00:00:00Z", expiresAt: "2026-09-04T00:00:00Z", installationUsedAt: null, signupUsedAt: null, revokedAt: null,
    status: "expired", memberId: "member-expired", memberStatus: "invited", team: null, memberVersion: 1 },
];

export async function mockMembers(page: Page, options: { members?: FixtureMember[]; candidates?: boolean } = {}) {
  const members = options.members ?? fixtureMembers();
  const candidates = options.candidates === false ? [] : fixtureCandidates(members);
  const unassigned = members.filter((member) => member.team.teamId === null);
  const cors = { "access-control-allow-origin": new URL(test.info().project.use.baseURL!).origin, "access-control-allow-headers": "content-type,authorization,idempotency-key,if-match", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };
  const meta = (url: URL) => ({ organizationId: url.pathname.split("/")[4], startDate: url.searchParams.get("startDate"), endDate: url.searchParams.get("endDate"), snapshotId: "fixture-members" });
  const pageOf = (items: FixtureMember[], url: URL, first: number) => {
    const offset = Number(url.searchParams.get("cursor") ?? 0);
    const limit = url.searchParams.has("cursor") ? Number(url.searchParams.get("limit") ?? 20) : first;
    return { items: items.slice(offset, offset + limit), totalCount: items.length, nextCursor: offset + limit < items.length ? String(offset + limit) : null };
  };
  await page.route((url) => /\/api\/v1\/organizations\/[^/]+\/(members(\/dashboard|\/unassigned)?|invitations)$/.test(url.pathname), (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/invitations")) {
      return route.fulfill({ headers: cors, json: { items: fixtureInvitations.filter((item) => item.status === url.searchParams.get("status") && item.memberStatus === url.searchParams.get("memberStatus")), nextCursor: null } });
    }
    if (url.pathname.endsWith("/members/dashboard")) {
      return route.fulfill({ headers: cors, json: {
        meta: meta(url), asOf: "2026-09-22T00:00:00Z",
        summary: { rosterMembers: members.length, activeUsers: members.filter((member) => member.periodUsage).length, unassignedMembers: unassigned.length,
          periodUnassignedEquivalentCostUsd: null, periodTotalEquivalentCostUsd: null,
          seats: candidates.length ? { availability: "available", reason: null, data: { contracted: 50, assigned: 45, unallocated: 5, activeInPeriod: null, inactiveAssigned: null, reclaimCandidates: candidates.length, estimatedMonthlySavingsUsd: null } }
            : { availability: "unavailable", reason: "not_applicable", data: null } },
        policy: { idleDays: 14, version: 0 }, capabilities: { invite: true, assignTeam: true, reclaimSeats: false, restoreSeats: false },
        members: pageOf(members, url, 20), unassigned: pageOf(unassigned, url, 20),
        reclaimCandidates: candidates.length ? { availability: "available", reason: null, data: { totalCount: candidates.length, nextCursor: null, items: candidates.map((member, index) => ({
          seatAssignmentId: `seat-${index + 1}`, memberId: member.memberId, account: member.account, team: member.team, vendorId: "vendor-1", tierId: "tier-1", version: 1,
          lastUsedAt: member.lastUsedAt, idleDays: 20 + index, estimatedMonthlySavingsUsd: null, canReclaim: false, reason: null })) } }
          : { availability: "unavailable", reason: "not_applicable", data: null },
      } });
    }
    return route.fulfill({ headers: cors, json: { meta: meta(url), members: pageOf(url.pathname.endsWith("/unassigned") ? unassigned : members, url, 20) } });
  });
  // 팀 목록 조회만 바꾼다. 온보딩 fixture의 팀 생성·삭제는 그대로 둔다.
  await page.route((url) => /\/api\/v1\/organizations\/[^/]+\/teams$/.test(url.pathname), (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    return route.fulfill({ headers: cors, json: { meta: { organizationId: url.pathname.split("/")[4], snapshotId: "fixture-teams" }, teams: { items: fixtureTeams, nextCursor: null } } });
  });
}
