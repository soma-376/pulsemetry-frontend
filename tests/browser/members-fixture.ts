import { test, type Page, type Route } from "@playwright/test";
import { mockOnboarding } from "./onboarding-fixture";

/** 구성원 화면 UI 테스트용 응답. 실제 서버 검증은 tests/e2e/members-read.spec.ts·members-write.spec.ts가 한다. */
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
export type FixtureDelivery = { status: string; reason: string | null; queuedAt: string | null; lastAttemptAt: string | null; sentAt: string | null; failureCode: string | null; attempts: number };
export const notSent = (reason: "mail_disabled" | "not_queued"): FixtureDelivery => ({ status: "not_sent", reason, queuedAt: null, lastAttemptAt: null, sentAt: null, failureCode: null, attempts: 0 });
export const queued = (): FixtureDelivery => ({ status: "queued", reason: null, queuedAt: new Date().toISOString(), lastAttemptAt: null, sentAt: null, failureCode: null, attempts: 0 });
export type FixtureInvitation = { invitationId: string; email: string; role: string; createdAt: string; expiresAt: string; installationUsedAt: string | null; signupUsedAt: string | null;
  revokedAt: string | null; status: string; memberId: string; memberStatus: string; team: { teamId: string; teamName: string } | null; memberVersion: number; delivery: FixtureDelivery };
export const fixtureInvitations: FixtureInvitation[] = [
  { invitationId: "invite-1", email: "waiting@codeworks.io", role: "member", createdAt: "2026-09-20T00:00:00Z", expiresAt: "2026-09-24T00:00:00Z", installationUsedAt: null, signupUsedAt: null, revokedAt: null,
    status: "pending", memberId: "member-waiting", memberStatus: "invited", team: { teamId: "team-platform", teamName: "플랫폼" }, memberVersion: 1,
    delivery: { status: "sent", reason: null, queuedAt: "2026-09-20T00:00:00Z", lastAttemptAt: "2026-09-20T00:00:05Z", sentAt: "2026-09-20T00:00:05Z", failureCode: null, attempts: 1 } },
  { invitationId: "invite-2", email: "expired@codeworks.io", role: "admin", createdAt: "2026-09-01T00:00:00Z", expiresAt: "2026-09-04T00:00:00Z", installationUsedAt: null, signupUsedAt: null, revokedAt: null,
    status: "expired", memberId: "member-expired", memberStatus: "invited", team: null, memberVersion: 1, delivery: notSent("not_queued") },
];

export type MembersFixture = Awaited<ReturnType<typeof mockMembers>>;

/**
 * 구성원·초대·팀의 조회와 변경 명령을 메모리 상태로 흉내 낸다. 돌려주는 상태를 직접 바꾸면 다른 곳에서의 변경이 된다.
 * 온보딩 fixture보다 나중에 등록해 팀 경로를 이쪽이 맡는다 — `openDashboard` 앞에서 부른다.
 */
export async function mockMembers(page: Page, options: { members?: FixtureMember[]; candidates?: boolean; invitations?: FixtureInvitation[]; mail?: boolean;
  /** 관리 기능이 켜진 서버 — 후보 좌석을 관리자 조치로 회수할 수 있다. [seatControls] 의 좌석 ID → 작업 ID 가 그 좌석의 최근 작업이다. */
  reclaimable?: boolean } = {}) {
  // 메일을 보내는 서버가 기본이다. 새 초대의 메일은 적재됨(queued)에서 시작하고, 발송 결과는 테스트가 상태를 바꿔 흉내 낸다.
  const mail = options.mail !== false;
  await mockOnboarding(page);
  const state = {
    members: structuredClone(options.members ?? fixtureMembers()),
    teams: structuredClone(fixtureTeams),
    invitations: structuredClone(options.invitations ?? fixtureInvitations),
    /** 받은 변경 명령 — 본문과 조건 헤더를 검증한다 */
    commands: [] as { method: string; path: string; body: unknown; idempotencyKey: string | null; ifMatch: string | null }[],
    sequence: 0,
    /** 좌석 ID → 최근 회수·복원 작업(종류) */
    seatControls: new Map<string, { operationId: string; kind: "seat_reclaim" | "seat_restore" }>(),
    /** 좌석 ID → 원장 상태 */
    seatStates: new Map<string, string>(),
  };
  const candidateIds = options.candidates === false ? [] : fixtureCandidates(state.members).map((member) => member.memberId);
  const cors = { "access-control-allow-origin": new URL(test.info().project.use.baseURL!).origin, "access-control-allow-headers": "content-type,authorization,idempotency-key,if-match", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };
  const meta = (url: URL) => ({ organizationId: url.pathname.split("/")[4], startDate: url.searchParams.get("startDate"), endDate: url.searchParams.get("endDate"), snapshotId: "fixture-members" });
  const pageOf = (items: FixtureMember[], url: URL, first: number) => {
    const offset = Number(url.searchParams.get("cursor") ?? 0);
    const limit = url.searchParams.has("cursor") ? Number(url.searchParams.get("limit") ?? 20) : first;
    return { items: items.slice(offset, offset + limit), totalCount: items.length, nextCursor: offset + limit < items.length ? String(offset + limit) : null };
  };
  const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status, headers: cors, json: value });
  const empty = (route: Route) => route.fulfill({ status: 204, headers: cors });
  const fail = (route: Route, status: number, code: string, field?: string) =>
    json(route, { error: { code, message: "fixture", fieldErrors: field ? [{ field, code }] : [] }, requestId: "fixture" }, status);
  const teamRef = (teamId: string | null) => state.teams.find((team) => team.teamId === teamId) ?? null;
  const waiting = (memberId: string) => state.invitations.find((item) => item.memberId === memberId && item.status !== "revoked");
  /** 팀을 옮기고 version을 올린다. 명단의 구성원과 초대 대기자 모두 같은 규칙이다. */
  const move = (memberId: string, teamId: string | null | undefined, role: string | undefined) => {
    const team = teamId === undefined ? undefined : teamRef(teamId);
    const member = state.members.find((item) => item.memberId === memberId), invitation = waiting(memberId);
    if (member) {
      if (team !== undefined) member.team = team ? { teamId: team.teamId, teamName: team.teamName } : { teamId: null, teamName: "미배정" };
      if (role) member.role = role;
      member.version += 1;
      return { memberId, team: member.team.teamId ? member.team : null, role: member.role, status: "active", version: member.version };
    }
    if (team !== undefined) invitation!.team = team ? { teamId: team.teamId, teamName: team.teamName } : null;
    if (role) invitation!.role = role;
    invitation!.memberVersion += 1;
    return { memberId, team: invitation!.team, role: invitation!.role, status: "invited", version: invitation!.memberVersion };
  };
  const versionOf = (memberId: string) => state.members.find((item) => item.memberId === memberId)?.version ?? waiting(memberId)?.memberVersion;

  await page.route((url) => /\/api\/v1\/organizations\/[^/]+\/(members|invitations|teams|member-team-assignments)(\/|$)/.test(url.pathname), (route) => {
    const request = route.request(), method = request.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    const path = url.pathname.split("/").slice(5).join("/");
    const body = ["POST", "PATCH"].includes(method) ? request.postDataJSON() : null;
    const headers = request.headers();
    if (method !== "GET") state.commands.push({ method, path, body, idempotencyKey: headers["idempotency-key"] ?? null, ifMatch: headers["if-match"] ?? null });
    if (method === "POST" && !/^[A-Za-z0-9_-]{8,128}$/.test(headers["idempotency-key"] ?? "")) return fail(route, 400, "invalid_request", "Idempotency-Key");
    const unassigned = state.members.filter((member) => member.team.teamId === null);
    const candidates = state.members.filter((member) => candidateIds.includes(member.memberId));

    if (method === "GET" && path === "invitations") {
      // 보내지 않은 필터는 거르지 않는다(서버와 같다).
      const status = url.searchParams.get("status"), memberStatus = url.searchParams.get("memberStatus");
      return json(route, { items: state.invitations.filter((item) => (!status || item.status === status) && (!memberStatus || item.memberStatus === memberStatus)), nextCursor: null });
    }
    if (method === "GET" && path === "members/dashboard") {
      return json(route, {
        meta: meta(url), asOf: "2026-09-22T00:00:00Z",
        summary: { rosterMembers: state.members.length, activeUsers: state.members.filter((member) => member.periodUsage).length, unassignedMembers: unassigned.length,
          periodUnassignedEquivalentCostUsd: null, periodTotalEquivalentCostUsd: null,
          seats: candidates.length ? { availability: "available", reason: null, data: { contracted: 50, assigned: 45, unallocated: 5, activeInPeriod: null, inactiveAssigned: null, reclaimCandidates: candidates.length, estimatedMonthlySavingsUsd: null } }
            : { availability: "unavailable", reason: "not_applicable", data: null } },
        policy: { idleDays: 14, version: 0 }, capabilities: { invite: true, assignTeam: true, reclaimSeats: !!options.reclaimable, restoreSeats: !!options.reclaimable },
        members: pageOf(state.members, url, 20), unassigned: pageOf(unassigned, url, 20),
        reclaimCandidates: candidates.length ? { availability: "available", reason: null, data: { totalCount: candidates.length, nextCursor: null, items: candidates.map((member, index) => ({
          seatAssignmentId: `seat-${index + 1}`, memberId: member.memberId, account: member.account, team: member.team, vendorId: "vendor-1", tierId: "tier-1", version: 1,
          lastUsedAt: member.lastUsedAt, idleDays: 20 + index, estimatedMonthlySavingsUsd: null, canReclaim: false, reason: null })) } }
          : { availability: "unavailable", reason: "not_applicable", data: null },
      });
    }
    if (method === "GET" && (path === "members" || path === "members/unassigned")) return json(route, { meta: meta(url), members: pageOf(path === "members" ? state.members : unassigned, url, 20) });
    const seatsOf = /^members\/([^/]+)\/seats$/.exec(path);
    if (method === "GET" && seatsOf) {
      // 후보인 구성원에게만 좌석 하나(관리 기능이 꺼진 서버 — 회수할 수 없음). 나머지는 좌석 없음.
      const index = candidates.findIndex((member) => member.memberId === seatsOf[1]);
      const member = state.members.find((item) => item.memberId === seatsOf[1]);
      if (!member) return fail(route, 404, "not_found");
      return json(route, { meta: { organizationId: url.pathname.split("/")[4], asOf: "2026-09-22T00:00:00Z", snapshotId: "fixture-seats" }, memberId: member.memberId,
        policy: { idleDays: 14, version: 0 }, seats: index < 0 ? [] : [{ seatAssignmentId: `seat-${index + 1}`, version: 1, vendorId: "vendor-1", vendorName: "Claude", kind: "claude_team",
          contractVersion: 1, tierId: "tier-1", tierLabel: "Standard", vendorTier: null, account: member.account, accountKind: "email", state: "assigned", source: "manual",
          memberLink: "email_match", assignedAt: "2026-08-01T00:00:00Z", releaseEffectiveOn: null, releasedAt: null, ledgerAvailability: "available", ledgerReason: null,
          lastUsedAt: member.lastUsedAt, idleDays: 20 + index, reviewReason: null, reclaimCandidate: true,
          ...(state.seatStates.get(`seat-${index + 1}`) ? { state: state.seatStates.get(`seat-${index + 1}`), reclaimCandidate: false } : {}),
          ...(options.reclaimable && !state.seatControls.has(`seat-${index + 1}`) ? { canReclaim: true, reclaimReason: null, reclaimMethod: "admin_action" }
            : { canReclaim: false, reclaimReason: options.reclaimable ? "control_in_progress" : "management_disabled", reclaimMethod: null }),
          lastControl: state.seatControls.get(`seat-${index + 1}`) ?? null }] });
    }
    if (method === "GET" && path === "teams") return json(route, { meta: { organizationId: url.pathname.split("/")[4], snapshotId: "fixture-teams" }, teams: { items: state.teams, nextCursor: null } });

    if (method === "PATCH" && path.startsWith("members/")) {
      const memberId = path.split("/")[1], version = versionOf(memberId);
      if (version === undefined) return fail(route, 404, "not_found", "memberId");
      if (body.expectedVersion !== version) return fail(route, 409, "version_conflict");
      if (!("teamId" in body) && !("role" in body)) return fail(route, 400, "invalid_request");
      if (body.teamId && !teamRef(body.teamId)) return fail(route, 404, "not_found", "teamId");
      if ("role" in body && !["admin", "member"].includes(body.role)) return fail(route, 422, "role_not_assignable", "role");
      return json(route, move(memberId, "teamId" in body ? body.teamId : undefined, body.role));
    }
    if (method === "POST" && path === "member-team-assignments") {
      const items = body.assignments as { memberId: string; teamId: string | null; expectedVersion: number }[];
      for (const item of items) {
        if (versionOf(item.memberId) === undefined) return fail(route, 404, "not_found", "memberId");
        if (item.teamId && !teamRef(item.teamId)) return fail(route, 404, "not_found", "teamId");
        if (item.expectedVersion !== versionOf(item.memberId)) return fail(route, 409, "version_conflict");
      }
      return json(route, { effectiveAt: new Date().toISOString(), members: items.map((item) => { const saved = move(item.memberId, item.teamId, undefined); return { memberId: item.memberId, teamId: saved.team?.teamId ?? null, version: saved.version }; }) });
    }
    // 가짜 코드다. 실제 초대 코드의 형식이나 값이 아니다.
    const issue = (email: string, role: string, team: FixtureInvitation["team"], memberId: string, memberVersion: number) => {
      const sequence = ++state.sequence, now = Date.now();
      const invitation: FixtureInvitation = { invitationId: `invite-new-${sequence}`, email, role, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 72 * 3_600_000).toISOString(),
        installationUsedAt: null, signupUsedAt: null, revokedAt: null, status: "pending", memberId, memberStatus: "invited", team, memberVersion,
        delivery: mail ? queued() : notSent("mail_disabled") };
      state.invitations.push(invitation);
      return { invitation, code: `FAKE-CODE-${String(sequence).padStart(4, "0")}` };
    };
    if (method === "POST" && path === "invitations/batch") {
      const results = (body.invitations as { email: string; teamId: string | null; role: string }[]).map((item) => {
        const email = item.email.toLowerCase(), team = teamRef(item.teamId);
        const skipped = (status: string, reason: string | null = null) => ({ email, invitationId: null, status, reason, expiresAt: null, code: null, delivery: null });
        if (item.teamId && !team) return skipped("rejected", "team_not_found");
        if (!["admin", "member"].includes(item.role)) return skipped("rejected", "role_not_assignable");
        if (state.members.some((member) => member.account === email)) return skipped("already_member");
        if (state.invitations.some((invitation) => invitation.email === email)) return skipped("already_invited");
        const { invitation, code } = issue(email, item.role, team ? { teamId: team.teamId, teamName: team.teamName } : null, `member-invited-${state.sequence + 1}`, 1);
        return { email, invitationId: invitation.invitationId, status: "issued", reason: null, expiresAt: invitation.expiresAt, code, delivery: invitation.delivery };
      });
      return json(route, { results });
    }
    // 활성 구성원의 설치 전용 코드(서버 ADR 0055) — 가입 소비를 발급 시각으로 기록하고, 그 구성원의 남은 설치 코드는 폐기한다.
    const installationCode = /^members\/([^/]+)\/installation-invitations$/.exec(path);
    if (method === "POST" && installationCode) {
      const member = state.members.find((item) => item.memberId === installationCode[1]);
      if (!member) return fail(route, 404, "not_found", "memberId");
      if (member.status === "suspended") return fail(route, 409, "member_suspended");
      if (member.status !== "active") return fail(route, 409, "member_not_active");
      if (body.expectedVersion !== member.version) return fail(route, 409, "version_conflict");
      const replaced = state.invitations.filter((item) => item.memberId === member.memberId && item.status !== "revoked" && !item.installationUsedAt && item.signupUsedAt);
      for (const old of replaced) {
        old.status = "revoked"; old.revokedAt = new Date().toISOString();
        if (old.delivery.status === "queued") old.delivery = { ...old.delivery, status: "cancelled" };
      }
      const { invitation, code } = issue(member.account, member.role, member.team.teamId ? { teamId: member.team.teamId, teamName: member.team.teamName } : null, member.memberId, member.version);
      invitation.memberStatus = "active"; invitation.signupUsedAt = invitation.createdAt;
      return json(route, { invitationId: invitation.invitationId, memberId: member.memberId, replacesInvitationIds: replaced.map((item) => item.invitationId),
        code: code.replace("FAKE-CODE", "FAKE-INST"), expiresAt: invitation.expiresAt, delivery: invitation.delivery });
    }
    const invitationCommand = path.match(/^invitations\/([^/]+)\/(reissue|revoke)$/);
    if (method === "POST" && invitationCommand) {
      const old = state.invitations.find((item) => item.invitationId === invitationCommand[1] && item.status !== "revoked");
      if (!old) return fail(route, 409, "invitation_unavailable");
      old.status = "revoked"; old.revokedAt = new Date().toISOString();
      // 폐기한 초대의 아직 나가지 않은 메일은 취소된다.
      if (old.delivery.status === "queued") old.delivery = { ...old.delivery, status: "cancelled" };
      if (invitationCommand[2] === "revoke") return empty(route);
      const { invitation, code } = issue(old.email, old.role, old.team, old.memberId, old.memberVersion);
      return json(route, { invitationId: invitation.invitationId, replacesInvitationId: old.invitationId, code, expiresAt: invitation.expiresAt, delivery: invitation.delivery });
    }

    const sameName = (name: string, except?: string) => state.teams.some((team) => team.teamId !== except && team.teamName.normalize("NFKC").toLowerCase() === name.normalize("NFKC").toLowerCase());
    if (method === "POST" && path === "teams") {
      if (sameName(body.teamName)) return fail(route, 409, "team_name_conflict", "teamName");
      const team = { teamId: `team-new-${++state.sequence}`, teamName: body.teamName as string, version: 1 };
      state.teams.push(team);
      return json(route, team, 201);
    }
    if (["PATCH", "DELETE"].includes(method) && path.startsWith("teams/")) {
      const team = state.teams.find((item) => item.teamId === path.split("/")[1]);
      if (!team) return fail(route, 404, "not_found", "teamId");
      if (method === "PATCH") {
        if (body.expectedVersion !== team.version) return fail(route, 409, "version_conflict");
        if (sameName(body.teamName, team.teamId)) return fail(route, 409, "team_name_conflict", "teamName");
        team.teamName = body.teamName; team.version += 1;
        for (const member of state.members) if (member.team.teamId === team.teamId) member.team.teamName = team.teamName;
        for (const invitation of state.invitations) if (invitation.team?.teamId === team.teamId) invitation.team.teamName = team.teamName;
        return json(route, team);
      }
      if (headers["if-match"] !== `"team-${team.version}"`) return fail(route, 409, "version_conflict");
      state.teams.splice(state.teams.indexOf(team), 1);
      for (const member of state.members) if (member.team.teamId === team.teamId) { member.team = { teamId: null, teamName: "미배정" }; member.version += 1; }
      for (const invitation of state.invitations) if (invitation.team?.teamId === team.teamId) { invitation.team = null; invitation.memberVersion += 1; }
      return empty(route);
    }
    return fail(route, 404, "not_found");
  });
  return state;
}
