import { retryAfterMs } from "./retry-after";

/** 인증 경로(로그인·갱신·로그아웃)의 실패. 서버의 `error` 코드와 `Retry-After`(밀리초)를 보존한다. */
export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = "",
    public retryAfterMs = 0,
  ) {
    super(message);
  }
}

/** 남은 대기 시간(초). 0 이면 기다릴 필요가 없다. */
export function remainingSeconds(until: number | null, now: number) {
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/** 요청 제한 안내. 서버가 대기 시간을 주지 않았으면 시간을 지어내지 않는다. */
export function rateLimitMessage(waitMs: number) {
  const seconds = remainingSeconds(waitMs, 0);
  return seconds > 0
    ? `요청이 많아 잠시 제한되었습니다. ${seconds}초 뒤에 다시 시도해 주세요.`
    : "요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.";
}

/**
 * 실패 응답을 [AuthError]로 바꾼다. 429 는 인증 정보·서버 설정 오류가 아니라 요청 제한이므로 대기 시간을 담은 제한 안내다.
 * 그 밖에는 `message`(호출자가 정한 문장)가 있으면 그것을, 없으면 응답의 `message`, 그것도 없으면 `fallback`을 쓴다.
 */
export async function authErrorFrom(response: Response, fallback: string, message?: string): Promise<AuthError> {
  const body = (await response.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
  const error = body?.error;
  const code = typeof error === "string" ? error : error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "";
  const wait = retryAfterMs(response.headers.get("Retry-After"));
  if (response.status === 429) return new AuthError(rateLimitMessage(wait), 429, code || "rate_limited", wait);
  const serverMessage = typeof body?.message === "string" && body.message ? body.message : undefined;
  return new AuthError(message ?? serverMessage ?? fallback, response.status, code, wait);
}
