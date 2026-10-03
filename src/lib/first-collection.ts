/**
 * 첫 수집까지의 단계 — 실제로 있는 경로만 말한다(초대 → 초대 메일의 설치 명령 → CLI 등록). 설치 명령은 서버가 초대마다 메일에 담는다
 * (백엔드 초대 메일·부트스트랩 스크립트 — 내려받은 CLI 가 `enroll --invite` 로 등록하고 자동 실행을 켠다). MDM 일괄 배포나 화면에서 복사하는 명령은 없다.
 */
export const FIRST_COLLECTION_STEPS = [
  { n: "1", title: "구성원 초대", note: "초대 메일에 그 구성원의 CLI 설치 명령(macOS·Linux·Windows)이 담겨 갑니다", state: "지금 가능" },
  { n: "2", title: "구성원이 CLI 설치", note: "구성원이 초대 메일의 설치 명령을 터미널에 붙여넣으면 CLI를 내려받아 이 조직에 등록하고 자동 실행을 켭니다", state: "구성원 차례" },
  { n: "3", title: "첫 수집", note: "등록한 CLI가 AI 도구 사용량을 보내기 시작하면 이 화면이 대시보드로 바뀝니다", state: "신호 이후" },
] as const;

/** 구성원 화면의 초대 창을 바로 연다. */
export const INVITE_DEEP_LINK = "/members?invite=1";

/** 대기 문구는 자동 갱신 상태와 맞춘다 — 꺼져 있으면 화면이 스스로 바뀌지 않는다. 자동 갱신 주기는 5분이다. */
export function waitingText(autoRefresh: boolean) {
  return autoRefresh
    ? "첫 신호를 기다리는 중 · 자동 갱신이 켜져 있어 최대 5분마다 다시 확인합니다"
    : "첫 신호를 기다리는 중 · 자동 갱신이 꺼져 있습니다 — 설치 뒤 새로고침하거나 자동 갱신을 켜세요";
}
