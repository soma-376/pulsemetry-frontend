import { resolveSeedAccount, tokensSchema, userSchema } from "@/lib/server/seed-auth";

const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
/** 백엔드의 인증 요청 제한(429)은 계정·서버 설정 오류가 아니다. 상태와 `Retry-After`를 그대로 넘긴다. */
const rateLimited = (response: Response) => {
  const retryAfter = response.headers.get("Retry-After");
  return json({ error: "rate_limited", message: "로그인 요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요." }, 429, retryAfter ? { "Retry-After": retryAfter } : {});
};
/** 로컬 시드 전용 인증 어댑터. 운영 SSO나 일반 계정의 인증 경로로 사용하지 않는다. */
export async function POST(request: Request) {
  if (process.env.DEV_SEED_AUTH_ENABLED !== "true" || process.env.VERCEL) return json({ error: "seed_auth_disabled", message: "시드 로그인 연결이 설정되지 않았습니다." }, 404);
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || origin !== url.origin) return json({ error: "forbidden" }, 403);
  const account = resolveSeedAccount(await request.json().catch(() => null));
  if (!account) return json({ error: "unknown_account", message: "등록된 시드 관리자 이메일을 확인해 주세요." }, 400);
  const password = process.env.DEV_SEED_AUTH_PASSWORD;
  const base = process.env.ENROLLMENT_API_URL ?? "http://localhost:8080";
  if (!password || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) return json({ error: "seed_auth_unconfigured", message: "시드 인증 서버 설정을 확인해 주세요." }, 503);
  try {
    const response = await fetch(`${base}/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: account.organizationId, email: account.email, password }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (response.status === 429) return rateLimited(response);
    if (!response.ok) return json({ error: "seed_login_failed", message: "백엔드 시드 계정 인증에 실패했습니다. 시드 적재와 서버 설정을 확인해 주세요." }, response.status === 401 ? 401 : 502);
    const tokens = tokensSchema.parse(await response.json());
    const meResponse = await fetch(`${base}/v1/auth/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (meResponse.status === 429) return rateLimited(meResponse);
    if (!meResponse.ok) return json({ error: "user_lookup_failed", message: "로그인한 계정 정보를 확인하지 못했습니다." }, 502);
    const user = userSchema.parse(await meResponse.json());
    if (user.organizationId !== account.organizationId || user.email !== account.email || user.role !== "admin") return json({ error: "forbidden", message: "조직 관리자 계정을 확인해 주세요." }, 403);
    return json({ tokens, user });
  } catch { return json({ error: "auth_unavailable", message: "인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503); }
}
