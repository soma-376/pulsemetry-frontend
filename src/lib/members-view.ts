import type { Invitation } from "./api/invitations";
import type { Member, MembersView } from "./api/members";
import { DAY_MS } from "./date";
import { int, usd } from "./format";

/** 서버의 화면 역할 어휘. 모르는 값은 원문을 그대로 보여 준다. */
export const ROLE_LABEL: Record<string, string> = { admin: "관리자", member: "구성원" };
const MEMBER_STATE_LABEL: Record<string, string> = { active: "활성 계정", invited: "초대 대기", suspended: "정지" };
const SEAT_STATE_LABEL: Record<string, string> = { assigned: "배정됨", unassigned: "배정 해제", reclaimed: "회수됨", unknown: "확인 불가" };
const SECTION_REASON: Record<string, string> = {
  not_applicable: "벤더 좌석 원장이 연결되지 않았습니다",
  source_not_available: "좌석 원천을 조회할 수 없습니다",
};

/**
 * 구성원의 사용 관측 상태. 좌석 배정 상태(seatState)와 섞지 않는다.
 * 회수 후보는 서버가 후보로 준 구성원에게만 붙인다 — 사용 기록이 없다는 것만으로 후보로 만들지 않는다.
 */
export const MEMBER_STATUS_LABELS = {
  active: "활성",
  candidate: "회수 후보",
  idle: "기간 내 미관측",
  unobserved: "신호 대기",
} as const;
export type MemberActivity = keyof typeof MEMBER_STATUS_LABELS;

export function memberActivity(member: Pick<Member, "memberId" | "periodUsage" | "lastUsedAt">, candidates: ReadonlySet<string>): MemberActivity {
  if (candidates.has(member.memberId)) return "candidate";
  if (member.periodUsage) return "active";
  return member.lastUsedAt ? "idle" : "unobserved";
}

/** 서울 시간의 절대 시각. 상대 표현은 자동 갱신을 꺼 두면 낡는다. */
export function formatKst(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date(value)).replaceAll("-", ".");
}
const moneyValue = (value: string | null | undefined) => value == null ? null : Number(value);
const moneyText = (value: number | null) => value === null ? "-" : usd(value);
const countText = (value: number | null | undefined) => value == null ? "-" : int(value);

export function memberRow(member: Member, candidates: ReadonlySet<string>) {
  const costValue = moneyValue(member.periodUsage?.equivalentCostUsd);
  return {
    memberId: member.memberId,
    account: member.account,
    displayName: member.displayName,
    teamId: member.team.teamId,
    team: member.team.teamName,
    teamColor: member.team.teamId ? "var(--text2)" : "var(--orange-ink)",
    role: member.role,
    roleLabel: ROLE_LABEL[member.role] ?? member.role,
    stateLabel: MEMBER_STATE_LABEL[member.status] ?? member.status,
    version: member.version,
    seatStateLabel: SEAT_STATE_LABEL[member.seatState] ?? member.seatState,
    costValue,
    costText: moneyText(costValue),
    sessionCount: member.periodUsage?.sessionCount ?? null,
    sessionText: countText(member.periodUsage?.sessionCount),
    lastUsedAt: member.lastUsedAt,
    lastUsedTime: member.lastUsedAt ? Date.parse(member.lastUsedAt) : null,
    lastSeen: formatKst(member.lastUsedAt),
    activity: memberActivity(member, candidates),
  };
}
export type MemberRow = ReturnType<typeof memberRow>;

function inviteRow(invitation: Invitation, now: number) {
  const expired = invitation.status === "expired";
  const daysLeft = Math.ceil((Date.parse(invitation.expiresAt) - now) / DAY_MS);
  return {
    invitationId: invitation.invitationId,
    memberId: invitation.memberId,
    memberVersion: invitation.memberVersion,
    email: invitation.email,
    expired,
    teamLabel: invitation.team?.teamName ?? "팀 미배정",
    roleLabel: ROLE_LABEL[invitation.role] ?? invitation.role,
    issuedText: `${formatKst(invitation.createdAt).slice(0, 10)} 발급`,
    // 만료된 초대는 코드가 죽어 있어 기다린다고 들어오지 않는다.
    expiryText: expired ? "만료됨" : daysLeft <= 1 ? "24시간 내 만료" : `${daysLeft}일 남음`,
    expiryColor: expired ? "var(--red)" : daysLeft <= 2 ? "var(--orange-ink)" : "var(--text3)",
  };
}
export type InviteRow = ReturnType<typeof inviteRow>;

/** 서버 응답을 화면 모델로 옮긴다. 값을 지어내지 않는다 — null은 "-"로 남는다. */
export function buildMembersView(view: MembersView, invitations: Invitation[] | undefined, now = Date.now()) {
  const { summary, policy } = view;
  const reclaim = view.reclaimCandidates;
  const candidateItems = reclaim.data?.items ?? [];
  const candidates = new Set(candidateItems.map((candidate) => candidate.memberId));
  const memberRows = view.members.map((member) => memberRow(member, candidates));
  const unassigned = view.unassigned.map((member) => memberRow(member, candidates));
  const unassignedListCost = unassigned.reduce((sum, row) => sum + (row.costValue ?? 0), 0);
  const inviteRows = invitations?.map((invitation) => inviteRow(invitation, now));
  const liveInvites = inviteRows?.filter((row) => !row.expired).length;
  const expiredInvites = inviteRows?.filter((row) => row.expired).length;

  const seats = summary.seats.data;
  const seatsUnavailable = summary.seats.availability === "unavailable" || !seats;
  const reclaimUnavailable = reclaim.availability === "unavailable" || !reclaim.data;
  const reasonText = (reason: string | null) => SECTION_REASON[reason ?? ""] ?? "좌석 정보를 확인할 수 없습니다";
  const unassignedCost = moneyValue(summary.periodUnassignedEquivalentCostUsd);
  const totalCost = moneyValue(summary.periodTotalEquivalentCostUsd);
  const share = unassignedCost !== null && totalCost ? ` (${(unassignedCost / totalCost * 100).toFixed(1)}%)` : "";

  return {
    snapshotId: view.meta.snapshotId,
    period: { startDate: view.meta.startDate, endDate: view.meta.endDate },
    capabilities: view.capabilities,
    memberCards: [
      { label: "구성원", value: int(summary.rosterMembers), unit: "명", caption: `기간 활성 ${countText(summary.activeUsers)}명 · 초대 대기 제외`, tone: "var(--text)" },
      { label: "좌석 회수 후보", value: seatsUnavailable ? "-" : countText(seats.reclaimCandidates), unit: "석",
        caption: seatsUnavailable ? reasonText(summary.seats.reason) : `${policy.idleDays}일 이상 사용 미관측`,
        tone: !seatsUnavailable && seats.reclaimCandidates ? "var(--orange-ink)" : "var(--text)" },
      { label: "초대 대기", value: countText(liveInvites), unit: "명", caption: `만료 ${countText(expiredInvites)}명 별도 · 벤더 좌석 배정과 무관`, tone: "var(--text)" },
      { label: "팀 미배정", value: int(summary.unassignedMembers), unit: "명", caption: `기간 미배분 비용 ${moneyText(unassignedCost)}${share}`,
        tone: summary.unassignedMembers ? "var(--orange-ink)" : "var(--text)" },
    ],
    reclaim: reclaimUnavailable
      ? { available: false as const, message: reasonText(reclaim.reason), note: "후보 계산 안 함" }
      : { available: true as const, rows: candidateItems.map((candidate) => ({ ...candidate, lastSeen: formatKst(candidate.lastUsedAt) })),
          note: `${int(candidateItems.length)}석 표시 · 전체 ${int(reclaim.data!.totalCount)}석 · ${policy.idleDays}일 기준` },
    unassignedRows: unassigned.map((row) => ({
      memberId: row.memberId, account: row.account, version: row.version,
      meta: `세션 ${row.sessionText} · 마지막 사용 ${row.lastSeen}`,
      costText: row.costText,
      // 목록 비용의 4분의 1 이상을 쥔 계정부터 배정해야 팀별 수치가 빨리 맞는다.
      costColor: row.costValue === null ? "var(--text3)" : unassignedListCost > 0 && row.costValue >= unassignedListCost * 0.25 ? "var(--red)" : "var(--text)",
    })),
    unassignedNote: unassigned.length ? `${int(unassigned.length)}명 · 현재 팀 미배정` : "모두 배정됨",
    memberRows,
    inviteRows,
    inviteNote: !inviteRows ? "초대 목록을 확인할 수 없습니다"
      : !inviteRows.length ? "대기 중인 초대가 없습니다"
        : `${int(liveInvites!)}명 대기${expiredInvites ? ` · 만료 ${int(expiredInvites)}명` : ""} · 벤더 좌석은 별도 배정`,
    memberNote: (shown: number, query: string) => {
      const members = memberRows.length;
      if (query) return `검색 결과 ${int(shown)}명 · 전체 ${int(members)}명 내 검색`;
      return `${int(shown)}명 표시 · 구성원 ${int(members)}명 · 행을 눌러 상세 확인`;
    },
  };
}
export type MembersModel = ReturnType<typeof buildMembersView>;

const csvCell = (value: string | number | null) => {
  if (value === null) return "";
  // 스프레드시트가 수식으로 실행하지 않게 한다.
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** 같은 snapshot의 전체 명단. 미수집 값은 빈 칸이고 0으로 채우지 않는다. */
export function membersCsv(rows: readonly MemberRow[]) {
  const header = ["계정", "이름", "팀", "역할", "계정 상태", "사용 관측", "기간 환산 비용(USD)", "기간 세션", "마지막 사용(UTC)"];
  const lines = rows.map((row) => [row.account, row.displayName, row.team, row.roleLabel, row.stateLabel, MEMBER_STATUS_LABELS[row.activity],
    row.costValue, row.sessionCount, row.lastUsedAt].map(csvCell).join(","));
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}
