import { DAY_MS, fromIso, TODAY, type DateRange } from "@/lib/date";
import { int, usd } from "@/lib/format";
import { aggregateActivity } from "./activity";
import { buildRoster, rosterOffsets } from "./roster";
import { ingestBadge, ingestDownCopy } from "./observation";
import { SAMPLE_END } from "@/mocks/activity";
import { INGEST, COVERAGE, MODEL_META } from "@/mocks/overview";
import { MEMBER_SEATS, SEAT_SNAPSHOT_DATE } from "@/mocks/member-seats";
import { buildMemberSeats, DEFAULT_SEAT_REVIEW_DAYS, memberSeatStatus } from "./member-seats";
import { SEED_TEAMS, teamLabel, type Team } from "@/lib/organization";
import { memberRoleSchema, type MemberRole } from "@/lib/schemas/member";

export const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  lead: "팀 리드",
  member: "구성원",
  viewer: "조회 전용",
};

export const ROLE_HINT: Record<string, string> = {
  admin: "관리자는 단가·알림 규칙·구성원을 변경할 수 있습니다",
  lead: "팀 리드는 자기 팀 데이터만 조회합니다",
  viewer: "조회 전용은 설정을 변경할 수 없습니다",
  member: "구성원은 조직 전체 집계만 조회합니다",
};

/** 데모 역할입니다. 실제 역할은 서버의 조직 멤버십에서 가져옵니다. */
function roleOf(account: string, index: number): MemberRole {
  if (index === 0) return "admin";
  if (index === 1) return "lead";
  return account.includes("@vendor.dev") || index % 11 === 0 ? "viewer" : "member";
}

export type MembersModel = ReturnType<typeof buildMembers>;

/** 초대 메일의 유효 기간 */
export const INVITE_TTL_DAYS = 7;

/**
 * 보낸 초대.
 *
 * 구성원도 아니고 텔레메트리도 아닌 제3의 상태입니다 — 계정이 아직 없어 신호가 없고,
 * 수락 전이라 좌석도 차지하지 않습니다. 그래서 활성 사용자·비용·좌석 계산
 * 어디에도 들어가지 않고, 목록과 전용 카드에만 나타납니다.
 */
export type PendingInvite = {
  email: string;
  /** 빈 문자열이면 팀 미배정으로 초대한 것 */
  team: string;
  role: string;
  /** 보낸 날짜 (YYYY-MM-DD) */
  invitedAt: string;
};

export type MemberState = {
  /** 팀이 배정된 계정 */
  assigned: Record<string, string>;
  /** 대시보드 역할은 벤더 좌석 배정과 독립적입니다. */
  roles?: Record<string, MemberRole>;
  /** 수락을 기다리는 초대 */
  invites: PendingInvite[];
};

export function buildMembers(
  dates: DateRange = { start: "2026-09-07", end: SAMPLE_END },
  state: MemberState = { assigned: {}, invites: [] },
  teams: Team[] = SEED_TEAMS,
  seatReviewDays = DEFAULT_SEAT_REVIEW_DAYS,
) {
  const current = aggregateActivity(dates);
  const ingest = ingestBadge(INGEST);
  const isEmpty = ingest.status === "empty" || current.days.length === 0;

  // This snapshot is independent of the selected usage period and contract totals.
  const vendorSeats = buildMemberSeats(MEMBER_SEATS, SEAT_SNAPSHOT_DATE, seatReviewDays);
  const seatsFor = (account: string) => vendorSeats.filter((seat) => seat.account.toLowerCase() === account.toLowerCase());
  const candidates = vendorSeats.filter((seat) => seat.review === "candidate");

  /* ── 한 명단 ───────────────────────────────────────── */
  // MODEL_META 의 키 이름은 v 라서 명단 생성기가 기대하는 key 로 맞춰 줍니다
  const models = MODEL_META.map((m) => ({ key: m.v, name: m.name }));

  const rosterTeams = aggregateActivity({ start: "2026-09-07", end: SAMPLE_END }).teams;
  const offsets = rosterOffsets(rosterTeams);
  const periodTeams = rosterTeams.map((team) => ({ ...current.teams.find((row) => row.team === team.team)!, users: team.users }));

  const people = periodTeams
    .flatMap((team) => buildRoster(team, models, offsets[team.team]))
    .map((u, i) => {
      const knownSeats = seatsFor(u.account);
      const observedDays = knownSeats.flatMap((seat) => seat.lastObservedAt ? [Math.floor((fromIso(SEAT_SNAPSHOT_DATE).getTime() - fromIso(seat.lastObservedAt.slice(0, 10)).getTime()) / DAY_MS)] : []);
      const observedIdleDays = knownSeats.length ? (observedDays.length ? Math.min(...observedDays) : null) : isEmpty ? null : u.idleDays;
      const assignedTeam = state.assigned[u.account];
      const teamSource = assignedTeam ?? (u.team === "미배정" ? "" : u.team);
      // 미배정 팀에 있던 사람은 배정되면 그 팀으로 옮겨갑니다
      const team = teamLabel(teams, teamSource);
      return {
        ...u,
        observedIdleDays,
        team,
        teamId: teams.find((item) => item.id === teamSource || item.sourceName === teamSource)?.id ?? "",
        role: state.roles?.[u.account] ?? roleOf(u.account, i),
      };
    });

  const pending = people.filter((p) => !p.team);
  const unassignedCost = pending.reduce((n, p) => n + p.costValue, 0);
  const totalCost = people.reduce((n, p) => n + p.costValue, 0);
  const activeUsers = people.length;

  /* ── 대기 중인 초대 ────────────────────────────────────
     좌석 계산 위에 있는 게 아니라 옆에 있습니다 — 위 수치 어디에도 더하지 않습니다. */
  const invites = state.invites.map((invite) => {
    const daysLeft =
      INVITE_TTL_DAYS -
      Math.floor((TODAY.getTime() - fromIso(invite.invitedAt).getTime()) / DAY_MS);
    const expired = daysLeft <= 0;
    return {
      ...invite,
      role: memberRoleSchema.parse(invite.role),
      daysLeft,
      expired,
      teamLabel: teamLabel(teams, invite.team) || "팀 미배정",
      roleLabel: ROLE_LABEL[invite.role] ?? invite.role,
      // 만료된 초대는 링크가 죽어 있어 다시 보내야 합니다 — 기다린다고 들어오지 않습니다
      expiryText: expired ? "만료됨" : daysLeft === 1 ? "내일 만료" : `${daysLeft}일 남음`,
      expiryColor: expired
        ? "var(--red)"
        : daysLeft <= 2
          ? "var(--orange-ink)"
          : "var(--text3)",
    };
  });

  const liveInvites = invites.filter((i) => !i.expired);
  const expiredInvites = invites.filter((i) => i.expired);

  const memberCards = [
    { label: "구성원", value: int(people.length), unit: "명", caption: "벤더 중복 없이 집계 · 초대 대기 제외", tone: "var(--text)" },
    { label: "좌석 회수 후보", value: int(candidates.length), unit: "석", caption: `벤더별 개별 좌석 · ${seatReviewDays}일 이상 사용 미관측`, tone: candidates.length ? "var(--orange-ink)" : "var(--text)" },
    { label: "초대 대기", value: int(liveInvites.length), unit: "명", caption: `만료 ${expiredInvites.length}명 별도 · 벤더 좌석 배정과 무관`, tone: "var(--text)" },
    { label: "팀 미배정", value: int(pending.length), unit: "명", caption: isEmpty ? "사용량 수집 전에도 팀 배정 가능" : `미배분 비용 ${usd(unassignedCost)} (${((unassignedCost / (totalCost || 1)) * 100).toFixed(1)}%)`, tone: pending.length ? "var(--orange-ink)" : "var(--text)" },
  ];
  const reclaimRows = candidates;
  const reclaimNote = `${candidates.length}석 · ${new Set(candidates.map((seat) => seat.account)).size}명 · ${seatReviewDays}일 기준 · 회수 전 검토 필요`;

  /* ── 팀 미배정 ─────────────────────────────────────── */
  const unassignedRows = pending.map((u) => ({
    account: u.account,
    meta: isEmpty
      ? "구성원 명단 · 사용 기록 없음"
      : `세션 ${int(u.sessionCount)} · 마지막 사용 ${u.idleDays === 0 ? "오늘" : `${u.idleDays}일 전`}`,
    costText: isEmpty ? "—" : usd(u.costValue),
    // 미배분 비용의 4분의 1을 한 사람이 쥐고 있으면 그 계정부터 배정해야 합니다
    costColor: isEmpty
      ? "var(--text3)"
      : u.costValue >= unassignedCost * 0.25
        ? "var(--red)"
        : "var(--text)",
  }));

  const unassignedNote = isEmpty
    ? `${pending.length}명 · 사용량이 없어 미배분 비용은 계산되지 않습니다`
    : pending.length
      ? `${pending.length}명 · 미배분 비용 ${usd(unassignedCost)} · 규칙 임계 10%`
      : "모두 배정됨";

  /* ── 구성원 목록 ───────────────────────────────────── */
  const memberRows = [...people]
    .sort((a, b) => b.costValue - a.costValue)
    .map((m) => ({
      account: m.account,
      invited: false,
      teamId: m.teamId,
      role: m.role,
      vendorSeats: seatsFor(m.account),
      seatStatus: memberSeatStatus(seatsFor(m.account), m.observedIdleDays, seatReviewDays),
      team: m.team || "미배정",
      teamColor: m.team ? "var(--text2)" : "var(--orange-ink)",
      roleLabel: ROLE_LABEL[m.role],
      costText: isEmpty ? "—" : m.costValue ? usd(m.costValue) : "—",
      costValue: isEmpty || !m.costValue ? null : m.costValue,
      idleDays: m.observedIdleDays,
      lastSeen: m.observedIdleDays === null
        ? "기록 없음"
        : m.observedIdleDays === 0
          ? "오늘"
          : m.observedIdleDays === 1
            ? "어제"
            : `${m.observedIdleDays}일 전`,
    }));

  // 초대만 있고 아직 신호가 없는 사람은 같은 테이블에 표시합니다.
  // 신호 명단에 같은 이메일이 생기면 측정 행을 사용해 중복을 만들지 않습니다.
  const measuredEmails = new Set(people.map((person) => person.account.toLowerCase()));
  const waitingRows = new Map<string, (typeof memberRows)[number]>();
  for (const invite of invites) {
    const email = invite.email.toLowerCase();
    if (measuredEmails.has(email) || waitingRows.has(email)) continue;
    waitingRows.set(email, {
      account: invite.email, invited: true, team: invite.teamLabel,
      teamId: teams.find((item) => item.id === invite.team || item.sourceName === invite.team)?.id ?? "",
      role: invite.role, vendorSeats: seatsFor(invite.email),
      seatStatus: memberSeatStatus(seatsFor(invite.email), null, seatReviewDays),
      teamColor: invite.team ? "var(--text2)" : "var(--orange-ink)", roleLabel: invite.roleLabel,
      costText: "—", lastSeen: "기록 없음",
      costValue: null, idleDays: null,
    });
  }
  memberRows.unshift(...waitingRows.values());

  return {
    isEmpty,
    memberCards,
    seatSnapshotDate: SEAT_SNAPSHOT_DATE,
    reclaimRows,
    reclaimNote,
    unassignedRows,
    unassignedNote,
    memberRows,
    activeUsers,
    candidateCount: candidates.length,

    inviteRows: invites,
    inviteNote: !invites.length
      ? "보낸 초대가 없습니다"
      : `${liveInvites.length}명 대기${expiredInvites.length ? ` · 만료 ${expiredInvites.length}명` : ""} · 벤더 좌석은 별도 배정`,
    pageSub: "전체 구성원 · 팀·역할 및 벤더 좌석 관리",
    seatStatus: "초대 수락은 벤더 좌석을 자동 배정하지 않습니다",

    // 초대는 구성원 수에 더하지 않고 따로 셉니다 — 아직 계정이 아니기 때문입니다
    memberNote: (shown: number, query: string) => {
      const invited = invites.length ? ` · 초대 대기 ${invites.length}명` : "";
      const members = people.length;
      if (query) return `검색 결과 ${shown}명 · 전체 ${members}명${invited} 내 검색`;
      if (isEmpty)
        return `구성원 ${int(members)}명${invited} · 사용량 미수집이라 정렬 기준이 없습니다`;
      return `${shown}명 표시 · 구성원 ${int(members)}명${invited} · 행을 눌러 상세 확인`;
    },

    ingest: {
      ...ingest,
      isDown: ingest.status === "down" && !isEmpty,
      down: ingestDownCopy(INGEST),
      liveInstalls: isEmpty ? "0" : int(COVERAGE.activeInstalls),
      liveMembers: int(COVERAGE.activeMembers),
      liveCoverage: isEmpty ? "0%" : COVERAGE.coverageText,
    },
  };
}
