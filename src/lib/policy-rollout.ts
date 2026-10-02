/**
 * 정책 적용 판정의 근거를 말하는 문구(대시보드 명세 "정책 적용 현황과 업데이트 안내"). 판정 값은 서버의 것이다 — 여기서는 근거만 구분해 말한다.
 * `heartbeat`는 마지막 설치 보고, `applied_confirmation`은 보고가 없어 쓴 과거의 적용 확인 기록(그 판을 적용한 적이 있다는 이력), `none`은 근거 없음.
 */
export type AppliedEvidence = "heartbeat" | "applied_confirmation" | "none";
export type RolloutEvidence = { heartbeat: number; appliedConfirmation: number; none: number };

const count = (value: number) => value.toLocaleString("ko-KR");

export const EVIDENCE_LABEL: Record<AppliedEvidence, string> = {
  heartbeat: "최근 설치 보고",
  applied_confirmation: "적용 확인 기록 · 보고 없음",
  none: "근거 없음",
};

/** 요약의 근거 설명. 0대인 근거는 빼고, 보고를 받은 설치가 없으면 그 사실을 말한다. 서버가 근거를 주지 않았으면 그렇다고 말한다. */
export function rolloutEvidenceText(evidence: RolloutEvidence | undefined) {
  if (!evidence) return "판정 근거를 받지 못했습니다";
  const parts = [
    evidence.heartbeat ? `설치 보고 ${count(evidence.heartbeat)}대` : "",
    evidence.appliedConfirmation ? `적용 확인 기록 ${count(evidence.appliedConfirmation)}대` : "",
    evidence.none ? `근거 없음 ${count(evidence.none)}대` : "",
  ].filter(Boolean);
  if (!parts.length) return "판정할 설치가 없습니다";
  return `근거: ${parts.join(" · ")}${evidence.heartbeat ? "" : " — 설치 보고를 받은 설치가 없습니다"}`;
}

/** 행의 근거 시각 — 보고면 마지막 보고, 적용 확인 기록이면 그 판의 확인 시각, 근거가 없으면 null. */
export function evidenceTime(row: { appliedEvidence: AppliedEvidence; lastHeartbeatAt: string | null; appliedConfirmedAt: string | null }) {
  return row.appliedEvidence === "heartbeat" ? row.lastHeartbeatAt : row.appliedEvidence === "applied_confirmation" ? row.appliedConfirmedAt : null;
}
