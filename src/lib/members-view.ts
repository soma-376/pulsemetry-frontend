import type { Delivery, Invitation, InvitationResult } from "./api/invitations";
import type { Member, MembersView } from "./api/members";
import { DAY_MS } from "./date";
import { int, usd } from "./format";

/** 서버의 역할 어휘. 모르는 값은 원문을 그대로 보여 준다. */
export const ROLE_LABEL: Record<string, string> = { owner: "소유자", admin: "관리자", member: "구성원" };
/** 초대와 편집에서 지정할 수 있는 역할. owner는 표시만 한다. */
export const ASSIGNABLE_ROLES = ["member", "admin"] as const;
export const ROLE_HINT: Record<string, string> = {
  admin: "관리자는 계약·수집 정책·팀·구성원을 변경할 수 있습니다",
  member: "구성원은 조회만 할 수 있습니다",
};
const MEMBER_STATE_LABEL: Record<string, string> = { active: "활성 계정", invited: "초대 대기", suspended: "정지" };
const SEAT_STATE_LABEL: Record<string, string> = { assigned: "배정됨", unassigned: "배정 해제", reclaimed: "회수됨", unknown: "확인 불가" };
// 좌석 원장의 가용성 사유(서버 대시보드 명세 "좌석 원장 조회"). 제품 단위로 낮춘 사유는 "그런 제품이 있다"로 읽는다.
const SECTION_REASON: Record<string, string> = {
  not_applicable: "등록한 제품이 없어 좌석 원장이 없습니다",
  source_not_available: "좌석 원천을 조회할 수 없습니다",
  observation_incomplete: "관측이 부족한 좌석은 판정하지 않았습니다",
  seat_source_not_recorded: "좌석을 기록하지 않은 제품이 있습니다",
  seat_source_provisional: "연결 전 임시 기록을 쓰는 제품이 있습니다",
  seat_sync_pending: "좌석 동기화를 기다리는 제품이 있습니다",
  seat_sync_failing: "좌석 동기화가 실패한 제품이 있습니다",
  seat_sync_outdated: "좌석 동기화가 오래된 제품이 있습니다",
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

const DELIVERY_FAILURE: Record<string, string> = {
  recipient_rejected: "받는 메일 서버가 주소를 거부했습니다",
  message_rejected: "받는 메일 서버가 메일을 거부했습니다",
  invalid_address: "이메일 주소 형식이 올바르지 않습니다",
  recipient_deferred: "받는 메일 서버가 잠시 받지 않습니다",
  smtp_deferred: "메일 서버가 잠시 받지 않습니다",
  smtp_auth_failed: "메일 서버 인증에 실패했습니다",
  smtp_unavailable: "메일 서버에 연결하지 못했습니다",
  send_error: "발송 중 오류가 났습니다",
  outcome_unknown: "발송 결과를 확인하지 못했습니다",
};

/**
 * 초대 메일의 발송 상태를 화면 문구로 옮긴다. 발급은 발송이 아니다 —
 * "발송됨"은 서버가 `sent`라고 말할 때만 쓰고, 메일이 없으면 없다고 말한다.
 */
export function deliveryView(delivery: Delivery) {
  const reason = delivery.failureCode ? DELIVERY_FAILURE[delivery.failureCode] ?? delivery.failureCode : null;
  const mailed = delivery.status !== "not_sent";
  switch (delivery.status) {
    case "sent": return { mailed, state: "sent" as const, label: "메일 발송됨", detail: formatKst(delivery.sentAt), color: "var(--text2)" };
    case "queued": return reason
      ? { mailed, state: "retrying" as const, label: "발송 재시도 대기", detail: reason, color: "var(--orange-ink)" }
      : { mailed, state: "queued" as const, label: "메일 발송 대기", detail: null, color: "var(--text3)" };
    case "sending": return { mailed, state: "queued" as const, label: "메일 발송 중", detail: null, color: "var(--text3)" };
    case "failed": return { mailed, state: "failed" as const, label: "메일 발송 실패", detail: reason, color: "var(--red)" };
    case "cancelled": return { mailed, state: "cancelled" as const, label: "메일 발송 취소됨", detail: null, color: "var(--text3)" };
    case "not_sent": return delivery.reason === "mail_disabled"
      ? { mailed, state: "disabled" as const, label: "메일 발송 꺼짐", detail: "코드를 직접 전달하세요", color: "var(--text3)" }
      : { mailed, state: "none" as const, label: "보낸 메일 없음", detail: null, color: "var(--text3)" };
    // 모르는 상태를 발송됨으로 읽지 않는다.
    default: return { mailed, state: "none" as const, label: `메일 상태 ${delivery.status}`, detail: reason, color: "var(--text3)" };
  }
}
export type DeliveryView = ReturnType<typeof deliveryView>;

function inviteRow(invitation: Invitation, now: number) {
  const expired = invitation.status === "expired";
  const daysLeft = Math.ceil((Date.parse(invitation.expiresAt) - now) / DAY_MS);
  return {
    invitationId: invitation.invitationId,
    memberId: invitation.memberId,
    memberVersion: invitation.memberVersion,
    email: invitation.email,
    expired,
    teamId: invitation.team?.teamId ?? null,
    teamLabel: invitation.team?.teamName ?? "팀 미배정",
    role: invitation.role,
    roleLabel: ROLE_LABEL[invitation.role] ?? invitation.role,
    issuedText: `${formatKst(invitation.createdAt).slice(0, 10)} 발급`,
    delivery: deliveryView(invitation.delivery),
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
        caption: seatsUnavailable ? reasonText(summary.seats.reason)
          : summary.seats.availability === "partial" ? `${policy.idleDays}일 기준 · ${reasonText(summary.seats.reason)}` : `${policy.idleDays}일 이상 사용 미관측`,
        tone: !seatsUnavailable && seats.reclaimCandidates ? "var(--orange-ink)" : "var(--text)" },
      { label: "초대 대기", value: countText(liveInvites), unit: "명", caption: `만료 ${countText(expiredInvites)}명 별도 · 벤더 좌석 배정과 무관`, tone: "var(--text)" },
      { label: "팀 미배정", value: int(summary.unassignedMembers), unit: "명", caption: `기간 미배분 비용 ${moneyText(unassignedCost)}${share}`,
        tone: summary.unassignedMembers ? "var(--orange-ink)" : "var(--text)" },
    ],
    reclaim: reclaimUnavailable
      // 후보를 계산하지 못해도 조직의 회수 기준(설정에서 저장한 값)은 보여 준다.
      ? { available: false as const, message: reasonText(reclaim.reason), note: `후보 계산 안 함 · 회수 기준 ${policy.idleDays}일` }
      : { available: true as const, rows: candidateItems.map((candidate) => ({ ...candidate, lastSeen: formatKst(candidate.lastUsedAt) })),
          // partial 은 판정하지 못한 좌석을 뺀 목록이다 — 빈 목록을 "후보 없음"으로 읽지 않게 사유를 함께 낸다.
          partial: reclaim.availability === "partial" ? reasonText(reclaim.reason) : null,
          // 다음 페이지는 같은 기준 시각의 cursor 로 잇는다(`GET O/seat-reclaim-candidates`).
          nextCursor: reclaim.data!.nextCursor, totalCount: reclaim.data!.totalCount, policyNote: `회수 기준 ${policy.idleDays}일`,
          note: `${int(candidateItems.length)}석 표시 · 전체 ${int(reclaim.data!.totalCount)}석 · 회수 기준 ${policy.idleDays}일` },
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

const REJECTED_REASON: Record<string, string> = {
  invalid_email: "이메일 형식을 확인하세요",
  duplicate_email: "같은 이메일이 두 번 들어 있습니다",
  role_not_assignable: "지정할 수 없는 역할입니다",
  team_not_found: "선택한 팀을 찾을 수 없습니다",
  ambiguous_email: "같은 이메일의 계정이 여럿입니다",
};

/**
 * 초대 코드 발급 결과. 발급은 발송이 아니다 — 메일 상태는 서버가 준 `delivery`로 따로 보여 준다.
 * 코드는 발급된 항목에만 있고, 나머지는 발급하지 않은 이유를 보여 준다.
 */
export function inviteResults(results: readonly InvitationResult[]) {
  const rows = results.map((result) => {
    const issued = result.status === "issued" && !!result.code;
    return {
      email: result.email,
      issued,
      code: issued ? result.code : null,
      delivery: issued && result.delivery ? deliveryView(result.delivery) : null,
      text: issued ? `코드 발급 · ${formatKst(result.expiresAt)} 만료`
        : result.status === "already_member" ? "이미 구성원입니다"
          : result.status === "already_invited" ? "이미 초대한 이메일입니다 · 초대 대기 목록에서 코드를 재발급하세요"
            : REJECTED_REASON[result.reason ?? ""] ?? "발급하지 않았습니다",
    };
  });
  const issued = rows.filter((row) => row.issued).length;
  const skipped = rows.length - issued;
  // 메일을 적재한 항목과 그렇지 않은 항목을 나눠 안내한다.
  const mailed = rows.filter((row) => row.delivery?.mailed).length;
  return {
    rows, issued, skipped, mailed, manual: issued - mailed,
    guidance: !issued ? null
      : mailed === issued ? "초대 메일을 발송 대기열에 넣었습니다. 발송 결과는 초대 대기 목록에서 확인하세요."
        : mailed === 0 ? "메일을 발송하지 않습니다. 코드는 지금만 볼 수 있으니 대상자에게 직접 전달하세요."
          : `초대 메일 ${int(mailed)}건을 발송 대기열에 넣었습니다. 나머지 ${int(issued - mailed)}건은 코드를 직접 전달하세요.`,
    summary: issued
      ? `초대 코드 ${int(issued)}건을 발급했습니다${skipped ? ` · 발급하지 않음 ${int(skipped)}건` : ""}`
      : `발급한 초대 코드가 없습니다 · 발급하지 않음 ${int(skipped)}건`,
  };
}
export type InviteResults = ReturnType<typeof inviteResults>;
