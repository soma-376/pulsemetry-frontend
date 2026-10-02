import { appendFileSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * 실서버 E2E 하네스의 공통 부품. 서버의 인증 요청 제한(enrollment ADR 0052 — 토큰 없는 진입은 IP 단위 60초 30회)을
 * 지키며 돌고, 준비 실패·대기·429 를 기능 실패와 따로 보고한다(reporter.ts). 한도를 풀거나 제한 행을 지우지 않는다.
 */

/** 준비 실패의 표식. reporter 가 이 접두어로 기능 실패와 구분한다. */
export const PREPARATION = "[E2E 준비 실패]";
/** 로그인·자원 준비처럼 시험 대상이 아닌 단계의 실패. 건너뛰지 않고 실패로 남긴다. */
export class PreparationError extends Error {
  constructor(message: string) {
    super(`${PREPARATION} ${message}`);
    this.name = "PreparationError";
  }
}

/** reporter 가 읽는 테스트 주석. */
export const ANNOTATION = {
  pacerWait: "e2e-pacer-wait",
  /** 서버나 어댑터가 준 429. 의도한 시험(아래)이 아니면 실패 원인 후보다. */
  observed429: "e2e-429",
  /** 429 처리 자체를 시험하는 테스트가 단다 — 그 테스트의 429 는 따로 센다. */
  intended429: "e2e-intended-429",
} as const;

/** 로그인 pacer: 60초 이동 창에 20회. 서버 한도(30회)보다 낮게 두어 가입처럼 세지 않는 진입 요청의 여유를 남긴다. */
export const LOGIN_WINDOW_MS = 60_000;
export const LOGIN_LIMIT = 20;
const pacerDir = resolve(".e2e-artifacts/login-pacer");
const loginsDir = join(pacerDir, "logins");
/** 로그인마다 한 줄(`at`·`label`·`waitedMs`). reporter 가 이 실행의 로그인 수와 대기를 여기서 센다(globalSetup 포함). */
export const pacerLog = join(pacerDir, "logins.jsonl");

function recentLogins(now: number) {
  mkdirSync(loginsDir, { recursive: true });
  const recent: number[] = [];
  for (const name of readdirSync(loginsDir)) {
    const at = Number(name.split("-")[0]);
    if (Number.isFinite(at) && now - at < LOGIN_WINDOW_MS) recent.push(at);
    else {
      try { unlinkSync(join(loginsDir, name)); } catch { /* 다른 프로세스가 먼저 지웠다 */ }
    }
  }
  return recent.sort((a, b) => a - b);
}

/**
 * 로그인 한 번을 기록하기 전에 창이 찰 때까지 기다린다. 기록은 파일 타임스탬프라 worker 재시작·globalSetup·이전 실행을 넘어 이어진다.
 * 대기는 실패가 아니다 — `onWait`(테스트 제한 시간 연장 등)를 부르고 대기 기록을 남긴다. 기다린 밀리초를 돌려준다.
 */
export async function paceLogin(label: string, onWait: (ms: number) => void = () => {}) {
  let waited = 0;
  for (;;) {
    const now = Date.now();
    const recent = recentLogins(now);
    if (recent.length < LOGIN_LIMIT) break;
    const delay = recent[recent.length - LOGIN_LIMIT] + LOGIN_WINDOW_MS - now + 100;
    onWait(delay);
    await new Promise((done) => setTimeout(done, delay));
    waited += delay;
  }
  writeFileSync(join(loginsDir, `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}`), label);
  appendFileSync(pacerLog, JSON.stringify({ at: new Date().toISOString(), label, waitedMs: waited }) + "\n");
  return waited;
}
