import { retryAfterMs } from "./overview";

/** `retryAfterSeconds`는 요청 한도에 걸렸을 때 서버가 알려 준 대기 시간이다. */
export class SignupError extends Error {
  constructor(public code: string, public status: number, message: string, public retryAfterSeconds: number | null = null) {
    super(message);
  }
}

/**
 * 초대 코드로 계정을 만든다. 로그인 전의 공개 경로라 세션을 붙이지 않는다.
 * 서버는 코드가 어떤 이유로 쓸 수 없는지 가르지 않는다(만료·취소·이미 가입·다른 이메일 모두 409).
 */
export async function acceptInvitation(input: { code: string; email: string; password: string }, signal?: AbortSignal): Promise<void> {
  const base = (process.env.NEXT_PUBLIC_ENROLLMENT_API_URL ?? "http://localhost:8080").replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/v1/auth/signup`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: input.code, email: input.email, password: input.password }),
      credentials: "omit", cache: "no-store", signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new SignupError("network", 0, "서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
  }
  if (response.status === 201) return;
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  const code = typeof body?.error === "string" ? body.error : "unavailable";
  if (response.status === 409) throw new SignupError(code, 409, "이 초대 코드로는 가입할 수 없습니다. 코드가 만료·취소됐거나 이미 가입했거나, 초대받은 이메일과 다릅니다. 관리자에게 초대를 다시 요청하세요.");
  if (response.status === 400) throw new SignupError(code, 400, "입력한 내용을 확인해 주세요. 비밀번호는 12글자 이상이어야 합니다.");
  if (response.status === 429) {
    const seconds = Math.ceil(retryAfterMs(response.headers.get("Retry-After")) / 1000);
    throw new SignupError(code, 429, seconds > 0 ? `요청이 너무 많습니다. ${seconds}초 뒤에 다시 시도해 주세요.` : "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", seconds > 0 ? seconds : null);
  }
  if (response.status === 404) throw new SignupError(code, 404, "지금은 가입을 받지 않습니다. 관리자에게 문의해 주세요.");
  throw new SignupError(code, response.status, "계정을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
