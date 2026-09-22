import { DAY_MS, fromIso, TODAY, type DateRange } from "@/lib/date";
import { int, usd } from "@/lib/format";
import { aggregateActivity } from "./activity";
import { buildRoster, rosterOffsets } from "./roster";
import { ingestBadge, ingestDownCopy } from "./observation";
import { SAMPLE_END } from "@/mocks/activity";
import { INGEST, COVERAGE, MODEL_META } from "@/mocks/overview";
import { SEAT_TIERS, STD_SEAT_FEE } from "@/mocks/vendors";
import { SEED_TEAMS, teamLabel, type Team } from "@/lib/organization";
import { memberRoleSchema, type MemberRole } from "@/lib/schemas/member";

/**
 * P6 구성원.
 *
 * 명단은 P2 와 같은 buildRoster 를 씁니다 — 같은 계정이 페이지마다 다른 비용을
 * 보이면 어느 쪽도 못 믿습니다. 좌석 수는 P5 설정의 벤더 계약(SEAT_TIERS)이 원천입니다.
 *
 * 이 페이지의 세 패널은 한 명단을 세 각도로 자른 것입니다:
 *   회수 후보 = 오래 안 쓴 사람, 미배정 = 팀이 없는 사람, 구성원 = 전원.
 */

/** 설정 > 수집 정책의 좌석 회수 기준 */
export const IDLE_LIMIT_DAYS = 14;

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
  /** 회수 처리된 계정 */
  reclaimed: Record<string, boolean>;
  /** 팀이 배정된 계정 */
  assigned: Record<string, string>;
  /** 직접 변경한 역할. 좌석 회수 중에는 조회 전용으로 표시합니다. */
  roles?: Record<string, MemberRole>;
  /** 수락을 기다리는 초대 */
  invites: PendingInvite[];
};

export function buildMembers(
  dates: DateRange = { start: "2026-09-07", end: SAMPLE_END },
  state: MemberState = { reclaimed: {}, assigned: {}, invites: [] },
  teams: Team[] = SEED_TEAMS,
) {
  const current = aggregateActivity(dates);
  const ingest = ingestBadge(INGEST);
  const isEmpty = ingest.status === "empty" || current.days.length === 0;

  const seats = SEAT_TIERS.reduce((n, t) => n + t.seats, 0);
  const seatSummary = SEAT_TIERS.map((t) => `${t.label} ${t.seats}석`).join(" + ");

  /* ── 한 명단 ───────────────────────────────────────── */
  // MODEL_META 의 키 이름은 v 라서 명단 생성기가 기대하는 key 로 맞춰 줍니다
  const models = MODEL_META.map((m) => ({ key: m.v, name: m.name }));

  const offsets = rosterOffsets(current.teams);

  const people = current.teams
    .flatMap((team) => buildRoster(team, models, offsets[team.team]))
    .map((u, i) => {
      const assignedTeam = state.assigned[u.account];
      const teamSource = assignedTeam ?? (u.team === "미배정" ? "" : u.team);
      // 미배정 팀에 있던 사람은 배정되면 그 팀으로 옮겨갑니다
      const team = teamLabel(teams, teamSource);
      return {
        ...u,
        team,
        teamId: teams.find((item) => item.id === teamSource || item.sourceName === teamSource)?.id ?? "",
        role: state.roles?.[u.account] ?? roleOf(u.account, i),
        reclaimed: !!state.reclaimed[u.account],
        idle: u.idleDays > IDLE_LIMIT_DAYS,
      };
    });

  const pending = people.filter((p) => !p.team && !p.reclaimed);
  const unassignedCost = pending.reduce((n, p) => n + p.costValue, 0);
  const totalCost = people.reduce((n, p) => n + p.costValue, 0);
  const reclaimedCount = people.filter((p) => p.reclaimed).length;
  const activeUsers = people.length - reclaimedCount;
  const idleSeats = seats - activeUsers;
  const candidates = isEmpty ? [] : people.filter((p) => p.idle && !p.reclaimed);

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

  // 수락하면 그때 좌석을 차지합니다 — 남은 좌석보다 많이 초대했는지 미리 알려 줍니다
  const seatShortfall = Math.max(0, liveInvites.length - idleSeats);

  /* ── 좌석 지표 4장 ─────────────────────────────────── */
  const contractCard = {
    label: "계약 좌석",
    value: int(seats),
    unit: "석",
    caption: `${seatSummary} · 설정 > 벤더 연동에서 변경`,
    tone: "var(--text)",
  };

  const seatCards = isEmpty
    ? [
        contractCard,
        {
          label: "활성 사용자",
          value: "—",
          unit: "",
          caption: "사용량 미수집 · 활성 여부는 신호로만 판정합니다",
          tone: "var(--text3)",
        },
        {
          label: "미사용 좌석",
          value: "—",
          unit: "",
          caption: "측정 없음 · 미사용과 미측정은 다릅니다",
          tone: "var(--text3)",
        },
        {
          label: "구성원 명단",
          value: int(people.length),
          unit: "명",
          caption: "데모 명단 · 사용량 수집 전에도 팀 배정이 가능합니다",
          tone: "var(--text)",
        },
      ]
    : [
        contractCard,
        {
          label: "활성 사용자",
          value: int(activeUsers),
          unit: "명",
          caption: `팀 배정 ${int(activeUsers - pending.length)}명 + 미배정 ${int(pending.length)}명`,
          tone: "var(--text)",
        },
        {
          label: "미사용 좌석",
          value: int(idleSeats),
          unit: "석",
          // 초대는 아직 좌석을 차지하지 않으므로 값이 아니라 전망으로만 적습니다
          caption: liveInvites.length
            ? seatShortfall
              ? `초대 ${liveInvites.length}명이 모두 수락하면 ${int(seatShortfall)}석 모자랍니다`
              : `초대 ${liveInvites.length}명 수락 시 ${int(idleSeats - liveInvites.length)}석`
            : `${IDLE_LIMIT_DAYS}일 이상 미사용 ${int(candidates.length)}석은 회수 후보`,
          tone: seatShortfall
            ? "var(--red)"
            : idleSeats > 20
              ? "var(--orange)"
              : "var(--text)",
        },
        {
          label: "팀 미배정",
          value: int(pending.length),
          unit: "명",
          caption: `미배분 비용 ${usd(unassignedCost)} (${((unassignedCost / (totalCost || 1)) * 100).toFixed(1)}%) · 배정 필요`,
          tone: pending.length ? "var(--red)" : "var(--text)",
        },
      ];

  /* ── 좌석 회수 후보 ────────────────────────────────── */
  const reclaimRows = candidates.map((r) => ({
    account: r.account,
    meta: `${r.team || "팀 미배정"} · 마지막 사용 이후 미활동`,
    idleText: `${r.idleDays}일`,
    idleDays: r.idleDays,
    team: r.team || "팀 미배정",
  }));

  const reclaimNote = isEmpty
    ? "아직 사용량이 수집되지 않아 회수 판정을 할 수 없습니다 · 미사용과 미측정은 다릅니다"
    : candidates.length
      ? `${candidates.length}석 · ${IDLE_LIMIT_DAYS}일 이상 미사용 · 월 ${usd(candidates.length * STD_SEAT_FEE)} 절감 가능`
      : "회수 후보 없음";

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
      role: m.reclaimed ? "viewer" : m.role,
      reclaimed: m.reclaimed,
      team: m.team || "미배정",
      teamColor: m.team ? "var(--text2)" : "var(--orange-ink)",
      roleLabel: m.reclaimed ? "조회 전용" : ROLE_LABEL[m.role],
      costText: isEmpty ? "—" : m.costValue ? usd(m.costValue) : "—",
      costValue: isEmpty || !m.costValue ? null : m.costValue,
      idleDays: isEmpty ? null : m.idleDays,
      lastSeen: isEmpty
        ? "기록 없음"
        : m.idleDays === 0
          ? "오늘"
          : m.idleDays === 1
            ? "어제"
            : `${m.idleDays}일 전`,
      stateLabel: isEmpty
        ? "신호 대기"
        : m.idle && !m.reclaimed
            ? "회수 후보"
            : "활성",
      stateColor: m.idle && !m.reclaimed && !isEmpty ? "var(--orange-ink)" : "var(--text3)",
      opacity: isEmpty ? 1 : m.reclaimed ? 0.5 : m.idle ? 0.75 : 1,
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
      role: invite.role, reclaimed: false,
      teamColor: invite.team ? "var(--text2)" : "var(--orange-ink)", roleLabel: invite.roleLabel,
      costText: "—", lastSeen: "기록 없음", stateLabel: "신호 대기", stateColor: "var(--text3)", opacity: 1,
      costValue: null, idleDays: null,
    });
  }
  memberRows.unshift(...waitingRows.values());

  return {
    isEmpty,
    seats,
    seatCards,
    reclaimRows,
    reclaimNote,
    unassignedRows,
    unassignedNote,
    memberRows,
    activeUsers,
    idleSeats,
    candidateCount: candidates.length,
    seatPrice: STD_SEAT_FEE,

    inviteRows: invites,
    inviteNote: !invites.length
      ? "보낸 초대가 없습니다"
      : seatShortfall
        ? `${liveInvites.length}명 대기 · 모두 수락하면 좌석 ${int(seatShortfall)}석 부족`
        : expiredInvites.length
          ? `${liveInvites.length}명 대기 · 만료 ${expiredInvites.length}명 · 수락 전에는 좌석을 차지하지 않습니다`
          : `${liveInvites.length}명 대기 · 수락 전에는 좌석을 차지하지 않습니다`,

    pageSub:
      `좌석 · 팀 매핑 · 역할 관리 · 계약 좌석 ${int(seats)}석` +
      (isEmpty ? " · 사용량 미수집" : ""),
    seatStatus: isEmpty
      ? "좌석 여유는 측정 이후 계산됩니다"
      : `좌석 ${int(seats - activeUsers)}석 여유`,

    // 초대는 구성원 수에 더하지 않고 따로 셉니다 — 아직 계정이 아니기 때문입니다
    memberNote: (shown: number, query: string) => {
      const invited = invites.length ? ` · 초대 대기 ${invites.length}명` : "";
      const members = people.length;
      if (query) return `검색 결과 ${shown}명 · 전체 ${members}명${invited} 내 검색`;
      if (isEmpty)
        return `구성원 ${int(members)}명${invited} · 사용량 미수집이라 정렬 기준이 없습니다`;
      return `${shown}명 표시 · 구성원 ${int(members)}명 · 신호 대기 ${waitingRows.size}명 · 회수 후보 ${int(candidates.length)}명`;
    },

    /** 회수 확인 모달 문구 — 되돌리기 어려운 동작이라 결과를 미리 적습니다 */
    reclaimPreview: (count: number) => ({
      title: `좌석 ${count}석을 회수합니다`,
      seatText: `회수 후: 좌석 ${int(idleSeats)} → ${int(idleSeats + count)}석 여유 · 월 ${usd(count * STD_SEAT_FEE)} 절감`,
    }),

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
