import type { Operation } from "./api/operations";

/**
 * 설정의 좌석 회수 기준·집계 보존(백엔드 ADR 0046·0047).
 * 두 값은 수집 정책 저장(`PUT O/collection-policy`)의 선택 필드로 저장하고, 설정의 판(`settingsVersion`)으로 충돌을 막는다.
 * 집계 보존을 줄이면 서버가 보존 정리 작업을 만들고, 진행은 작업 상태 조회로 본다 — 화면이 시간으로 완료를 짐작하지 않는다.
 */

/** 줄였는가(무기한 → 유한 포함). 줄이면 되돌릴 수 없는 삭제로 이어지므로 저장 전에 확인한다. */
export const isShortening = (current: number | null, next: number | null) => next !== null && (current === null || next < current);

/**
 * 삭제 경계 — 기준 날짜(KST)에서 [months] 개월 전 같은 날(그 날이 없는 달이면 말일)의 KST 자정. 이 날짜 **이전**의 분석 원본을 지운다.
 * 서버의 보존 작업과 같은 규칙이다(백엔드 명세 §13.2). 기준은 저장하는 날이다.
 */
export function retentionBoundary(todayKst: string, months: number): string {
  const [year, month, day] = todayKst.split("-").map(Number);
  const total = year * 12 + (month - 1) - months;
  const targetYear = Math.floor(total / 12), targetMonth = total % 12;
  const last = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** 오늘의 서울 날짜(YYYY-MM-DD). */
export const seoulToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

export const retentionLabel = (months: number | null) => months === null ? "무기한" : `${months}개월`;

type Retention = NonNullable<Operation["retention"]>;
const seoulDate = (instant: string) => new Date(instant).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

/**
 * 보존 정리 작업의 상태 문구. 작업 상태와 가장 최근 삭제 실행(`retention`)을 그대로 옮긴다 — 완료는 서버가 `succeeded` 라고 할 때뿐이고,
 * 그것도 논리 삭제 완료다(물리 제거 완료가 아니다).
 */
export function cleanupView(operation: Operation): { tone: "pending" | "running" | "done" | "failed"; text: string } {
  const run: Retention | null | undefined = operation.retention;
  const reason = operation.results[0]?.reason ?? null;
  switch (operation.status) {
    case "pending":
      return { tone: "pending", text: "정리 대기 · 보존 작업이 실행되면 시작합니다" };
    case "succeeded":
      return { tone: "done", text: run?.deletedBefore
        ? `정리 완료 · ${seoulDate(run.deletedBefore)} 이전 분석 원본을 지웠습니다(논리 삭제)`
        : "정리 완료" };
    case "failed":
    case "partially_failed":
      return { tone: "failed", text: reason === "superseded" ? "새 설정으로 대체되어 실행하지 않았습니다"
        : reason === "retention_incomplete" ? "정리하지 못했습니다 · 정해진 횟수 안에 끝나지 않았습니다"
        : reason === "retention_failed" ? "정리하지 못했습니다 · 삭제 실행이 실패했습니다" : `정리하지 못했습니다${reason ? ` · ${reason}` : ""}` };
    default:
      if (run?.status === "incomplete") return { tone: "running", text: "정리 미완 · 진행 중인 수집이 끝나면 다음 실행에서 이어서 지웁니다" };
      if (run?.status === "failed") return { tone: "running", text: "정리 재시도 대기 · 이번 실행이 실패해 다음 실행에서 다시 시도합니다" };
      return { tone: "running", text: "정리 진행 중" };
  }
}
