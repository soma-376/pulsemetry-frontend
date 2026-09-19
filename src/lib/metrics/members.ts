import { type DateRange } from "@/lib/date";
import { int, usd } from "@/lib/format";
import { aggregateActivity } from "./activity";
import { buildRoster, rosterOffsets } from "./roster";
import { ingestBadge, ingestDownCopy } from "./observation";
import { SAMPLE_END } from "@/mocks/activity";
import { INGEST, COVERAGE, MODEL_META } from "@/mocks/overview";
import { SEAT_TIERS, STD_SEAT_FEE } from "@/mocks/vendors";

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

export const TEAM_OPTIONS = ["플랫폼", "데이터", "결제", "프론트엔드", "모바일"];

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

/** 역할은 텔레메트리가 아니라 IdP 가 주는 값이라 계정에서 결정적으로 만듭니다 */
function roleOf(account: string, index: number) {
  if (index === 0) return "admin";
  if (index === 1) return "lead";
  return account.includes("@vendor.dev") || index % 11 === 0 ? "viewer" : "member";
}

export type MembersModel = ReturnType<typeof buildMembers>;

export type MemberState = {
  /** 회수 처리된 계정 */
  reclaimed: Record<string, boolean>;
  /** 팀이 배정된 계정 */
  assigned: Record<string, string>;
};

export function buildMembers(
  dates: DateRange = { start: "2026-09-07", end: SAMPLE_END },
  state: MemberState = { reclaimed: {}, assigned: {} },
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
      // 미배정 팀에 있던 사람은 배정되면 그 팀으로 옮겨갑니다
      const team = assignedTeam ?? (u.team === "미배정" ? "" : u.team);
      return {
        ...u,
        team,
        role: roleOf(u.account, i),
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
          label: "IdP 로스터",
          value: int(people.length),
          unit: "명",
          caption: "SSO에서 가져온 목록 · 팀 배정은 지금도 가능합니다",
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
          caption: `${IDLE_LIMIT_DAYS}일 이상 미사용 ${int(candidates.length)}석은 회수 후보`,
          tone: idleSeats > 20 ? "var(--orange)" : "var(--text)",
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
      ? "SSO 로스터 · 사용 기록 없음"
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
      team: m.team || "미배정",
      teamColor: m.team ? "var(--text2)" : "var(--orange-ink)",
      roleLabel: m.reclaimed ? "조회 전용" : ROLE_LABEL[m.role],
      costText: isEmpty ? "—" : m.costValue ? usd(m.costValue) : "—",
      lastSeen: isEmpty
        ? "기록 없음"
        : m.idleDays === 0
          ? "오늘"
          : m.idleDays === 1
            ? "어제"
            : `${m.idleDays}일 전`,
      stateLabel: isEmpty
        ? "측정 없음"
        : m.reclaimed
          ? "좌석 회수됨"
          : m.idle
            ? "회수 후보"
            : "활성",
      stateColor: m.idle && !m.reclaimed && !isEmpty ? "var(--orange-ink)" : "var(--text3)",
      opacity: isEmpty ? 1 : m.reclaimed ? 0.5 : m.idle ? 0.75 : 1,
    }));

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

    pageSub:
      `좌석 · 팀 매핑 · 역할 관리 · 계약 좌석 ${int(seats)}석` +
      (isEmpty ? " · 사용량 미수집" : ""),
    seatStatus: isEmpty
      ? "SSO 자동 생성 켜짐 · 좌석 여유는 측정 이후 계산됩니다"
      : `좌석 ${int(seats - activeUsers)}석 여유 · SSO 자동 생성 켜짐`,

    memberNote: (shown: number, query: string) =>
      query
        ? `검색 결과 ${shown}명 · 전체 ${people.length}명 내 검색`
        : isEmpty
          ? `IdP 로스터 ${int(people.length)}명 · 사용량 미수집이라 정렬 기준이 없습니다`
          : `비용 상위 ${shown}명 표시 · 전체 ${int(activeUsers)}명 · 회수 후보 ${int(candidates.length)}명`,

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
