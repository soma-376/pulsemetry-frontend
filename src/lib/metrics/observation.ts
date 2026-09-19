import { lagText } from "@/lib/format";
import type { CompareKey, IngestState } from "@/types/domain";

/**
 * 관측·적재 규칙.
 *
 * 핵심 원칙 두 가지 — 둘 다 원본 디자인이 명시적으로 지키는 규칙입니다.
 *  1) 신호가 끊겨도 값을 0으로 내리지 않는다. 마지막 확정값 + 기준 시각을 유지한다.
 *     (사용량이 0이 된 것과 수집이 멈춘 것은 다르고, 좌석 회수 판단이 뒤집힌다)
 *  2) 데몬 설치 이전 구간은 백필이 불가하다. 비교 창이 관측 시작일보다 앞서면
 *     증감률은 거짓이 되므로 "비교 불가"로 대체한다.
 */

export type IngestStatus = "empty" | "healthy" | "delayed" | "down";

const DELAYED_AFTER_MIN = 5;
const DOWN_AFTER_MIN = 180;

export function ingestStatus(ingest: IngestState): IngestStatus {
  if (ingest.observedDays === 0) return "empty";
  if (ingest.lagMinutes > DOWN_AFTER_MIN) return "down";
  if (ingest.lagMinutes > DELAYED_AFTER_MIN) return "delayed";
  return "healthy";
}

export function ingestBadge(ingest: IngestState) {
  const status = ingestStatus(ingest);
  const lag = lagText(ingest.lagMinutes);

  const text =
    status === "empty"
      ? "적재 없음 · 설치 대기"
      : status === "down"
        ? `마지막 적재 ${lag} · 신호 끊김`
        : status === "delayed"
          ? `마지막 적재 ${lag} · 지연`
          : `마지막 적재 ${lag}`;

  const fg =
    status === "down"
      ? "var(--red)"
      : status === "delayed"
        ? "var(--orange-ink)"
        : "var(--text2)";

  const dot =
    status === "empty"
      ? "var(--gray)"
      : status === "down"
        ? "var(--red)"
        : status === "delayed"
          ? "var(--orange-ink)"
          : "var(--green)";

  return { status, text, fg, dot, lag };
}

/** 수집 중단 배너 문구 */
export function ingestDownCopy(ingest: IngestState) {
  return {
    title: `데몬 신호가 ${lagText(ingest.lagMinutes)}부터 들어오지 않습니다`,
    detail: `아래 수치는 ${ingest.lastIngestAt} 기준 마지막 확정값입니다 · 사용량이 0이 된 것이 아니라 수집이 멈춘 상태이므로 좌석 회수 판단에 쓰지 마세요`,
  };
}

/** 비교 창이 관측 범위 안에 들어오는지 */
export function compareability(
  ingest: IngestState,
  compare: CompareKey,
  rangeDays: number,
) {
  const status = ingestStatus(ingest);
  const compareDays =
    compare === "prev_week" ? 7 : compare === "prev_period" ? rangeDays : 0;

  const canCompare =
    compare !== "none" && ingest.observedDays >= rangeDays + compareDays;

  const reason =
    compare === "none"
      ? ""
      : status === "down"
        ? `수집 중단 · ${ingest.lastIngestAt} 기준`
        : `관측 ${ingest.observedDays}일 · ${ingest.observedFrom}부터`;

  return {
    showCompare: compare !== "none",
    canCompare,
    reason,
    label:
      compare === "prev_week"
        ? "전주 대비"
        : compare === "prev_period"
          ? "이전 기간 대비"
          : "",
  };
}

/**
 * 주간 차트에서 신호가 존재하지 않는 선행 구간을 계산합니다.
 * 이 구간은 선을 그리지 않고 해칭으로 남깁니다 — 0 으로 찍으면 거짓말이 됩니다.
 */
export function observationWindow(ingest: IngestState, weekCount: number) {
  const observedWeeks = Math.max(
    1,
    Math.min(weekCount, Math.ceil(ingest.observedDays / 7)),
  );
  const firstObservedIndex = weekCount - observedWeeks;
  const hasGap = firstObservedIndex > 0 && ingest.observedDays > 0;

  return {
    observedWeeks,
    firstObservedIndex,
    hasGap,
    /** 해칭 경계의 x 좌표 (0~100 뷰박스 기준) */
    boundaryX: (firstObservedIndex / (weekCount - 1)) * 100,
    rangeLabel: hasGap ? `관측 ${observedWeeks}주` : `최근 ${weekCount}주`,
    chartNote: hasGap
      ? `${ingest.observedFrom} 데몬 설치 · 이전 ${firstObservedIndex}주는 신호가 없습니다(백필 불가)`
      : "",
    coverageNote: hasGap
      ? `관측 ${ingest.observedDays}일(${ingest.observedFrom}부터)`
      : "",
  };
}
