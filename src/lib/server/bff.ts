// Node 전용 모듈. 브라우저 모듈에서 가져오지 않는다.
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { authUserSchema } from "../auth-user";
import {
  createSessionCookie,
  SessionCookieError,
  type Session,
} from "./session-cookie";

const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().positive().max(86400),
});
type Entry = {
  sessionId: string;
  task: Promise<Session>;
  expiresAt: number;
  invalidated: boolean;
};
export type BffConfig = {
  origin: string;
  enrollmentUrl: string;
  dashboardUrl: string;
  keys: string[];
  refreshGraceMs?: number;
  maxRefreshEntries?: number;
  timeoutMs?: number;
};
class BffError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfter?: string | null,
  ) {
    super(code);
  }
}
const fail = (
  status: number,
  code: string,
  retryAfter?: string | null,
): never => {
  throw new BffError(status, code, retryAfter);
};

export function createBff(
  config: BffConfig,
  fetcher: typeof fetch = fetch,
  now = Date.now,
) {
  const origin = new URL(config.origin).origin;
  const { read, write } = createSessionCookie(config, now);
  const bases = {
    enrollment: new URL(config.enrollmentUrl),
    dashboard: new URL(config.dashboardUrl),
  };
  for (const base of Object.values(bases)) {
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== "/"
    )
      throw new Error("BFF 업스트림에는 HTTP(S) origin만 설정하세요.");
  }
  const grace = config.refreshGraceMs ?? 5000,
    limit = config.maxRefreshEntries ?? 1000;
  const refreshes = new Map<string, Entry>();
  const cacheKey = (session: Session) =>
    createHash("sha256").update(session.refreshToken).digest("hex");
  function prune() {
    for (const [key, entry] of refreshes)
      if (entry.expiresAt <= now()) refreshes.delete(key);
  }
  function response(body: unknown, status = 200) {
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  function checkRequest(request: Request) {
    // GET도 사용자 정의 헤더를 요구한다. CORS를 열지 않으므로 다른 출처의 스크립트는 통과하지 못한다.
    if (request.headers.get("x-pulsemetry-request") !== "1")
      fail(403, "forbidden");
    const requestOrigin = request.headers.get("origin");
    if (
      (requestOrigin && requestOrigin !== origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      fail(403, "forbidden");
    if (!["GET", "HEAD"].includes(request.method) && requestOrigin !== origin)
      fail(403, "forbidden");
  }
  async function upstream(
    service: keyof typeof bases,
    path: string,
    init: RequestInit = {},
  ) {
    try {
      return await fetcher(new URL(path, bases[service]), {
        ...init,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(config.timeoutMs ?? 10000),
      });
    } catch {
      return fail(503, "unavailable");
    }
  }
  async function json<T>(r: Response, schema: z.ZodType<T>) {
    if (!r.ok)
      fail(
        [400, 401, 403, 429].includes(r.status) ? r.status : 502,
        r.status === 429
          ? "rate_limited"
          : r.status >= 500
            ? "unavailable"
            : "unauthenticated",
        r.headers.get("Retry-After"),
      );
    try {
      return schema.parse(await r.json());
    } catch {
      return fail(502, "invalid_response");
    }
  }
  function tokenSession(
    tokens: z.infer<typeof tokensSchema>,
    previous: Pick<Session, "id" | "organizationId" | "sessionExpiresAt">,
    issuedAt: number,
  ): Session {
    return {
      ...previous,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: issuedAt + tokens.expires_in * 1000,
    };
  }
  const post = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  async function revoke(session: Session) {
    const r = await upstream(
      "enrollment",
      "/v1/auth/logout",
      post({ refresh_token: session.refreshToken }),
    );
    if (!r.ok && r.status !== 401)
      fail(
        r.status === 429 ? 429 : 503,
        r.status === 429 ? "rate_limited" : "unavailable",
        r.headers.get("Retry-After"),
      );
  }
  function invalidate(id: string) {
    for (const [key, entry] of refreshes)
      if (entry.sessionId === id) {
        entry.invalidated = true;
        refreshes.delete(key);
      }
  }
  function refresh(session: Session): Promise<Session> {
    prune();
    const key = cacheKey(session),
      existing = refreshes.get(key);
    if (existing) return existing.task;
    if (refreshes.size >= limit)
      return Promise.reject(new BffError(503, "refresh_busy"));
    const entry: Entry = {
      sessionId: session.id,
      task: undefined as unknown as Promise<Session>,
      expiresAt: Infinity,
      invalidated: false,
    };
    // microtask에서 시작하므로 Map 등록이 실제 갱신보다 먼저 완료된다.
    entry.task = Promise.resolve()
      .then(async () => {
        const issuedAt = now();
        const tokens = await json(
          await upstream(
            "enrollment",
            "/v1/auth/refresh",
            post({ refresh_token: session.refreshToken }),
          ),
          tokensSchema,
        );
        const next = tokenSession(tokens, session, issuedAt);
        if (entry.invalidated) {
          await revoke(next);
          fail(401, "unauthenticated");
        }
        entry.expiresAt = now() + grace;
        const timer = setTimeout(() => {
          if (refreshes.get(key) === entry) refreshes.delete(key);
        }, grace);
        timer.unref();
        return next;
      })
      .catch((error) => {
        if (refreshes.get(key) === entry) refreshes.delete(key);
        throw error;
      });
    refreshes.set(key, entry);
    return entry.task;
  }
  async function authorized(
    session: Session,
    service: keyof typeof bases,
    path: string,
    init: RequestInit = {},
  ) {
    let active = session;
    prune();
    const recent = refreshes.get(cacheKey(session));
    if (recent) active = await recent.task;
    else if (active.accessTokenExpiresAt <= now() + 5000)
      active = await refresh(active);
    const send = (s: Session) => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${s.accessToken}`);
      return upstream(service, path, { ...init, headers });
    };
    let result = await send(active);
    if (result.status === 401 && active === session) {
      await result.body?.cancel();
      active = await refresh(session);
      result = await send(active);
    }
    if (result.status === 401) {
      invalidate(session.id);
      fail(401, "unauthenticated");
    }
    if (result.status >= 300 && result.status < 400)
      fail(502, "invalid_response");
    return { result, session: active, renewed: active !== session };
  }
  async function requestBytes(
    request: Request,
  ): Promise<ArrayBuffer | undefined> {
    const reader = request.body?.getReader();
    if (!reader) return undefined;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        fail(413, "invalid_request");
      }
      chunks.push(value);
    }
    return size ? new Uint8Array(Buffer.concat(chunks)).buffer : undefined;
  }
  async function requestJson(request: Request) {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      fail(415, "invalid_request");
    const bytes = await requestBytes(request);
    if (!bytes) fail(400, "invalid_request");
    try {
      return JSON.parse(Buffer.from(bytes!).toString());
    } catch {
      return fail(400, "invalid_request");
    }
  }
  async function handle(request: Request): Promise<Response> {
    let renewedSession: Session | null = null;
    try {
      checkRequest(request);
      const url = new URL(request.url),
        route = url.pathname.replace(/^\/api\/bff\//, "");
      const session = read(request);
      if (route === "auth/organizations" && request.method === "POST") {
        const body = z
          .object({ email: z.email() })
          .parse(await requestJson(request));
        const schema = z.object({
          organizations: z.array(
            z.object({
              organizationId: z.uuid(),
              organizationName: z.string(),
            }),
          ),
        });
        return response(
          await json(
            await upstream("enrollment", "/v1/auth/organizations", post(body)),
            schema,
          ),
        );
      }
      if (route === "auth/token" && request.method === "POST") {
        const input = z
          .object({
            code: z.string().regex(/^uac_[A-Za-z0-9_-]{43}$/),
            redirect_uri: z.literal(`${origin}/auth/callback`),
            code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
            organizationId: z.uuid(),
          })
          .parse(await requestJson(request));
        const issuedAt = now();
        const tokens = await json(
          await upstream(
            "enrollment",
            "/v1/auth/token",
            post({
              code: input.code,
              redirect_uri: input.redirect_uri,
              code_verifier: input.code_verifier,
            }),
          ),
          tokensSchema,
        );
        const next = tokenSession(
          tokens,
          {
            id: randomUUID(),
            organizationId: input.organizationId,
            sessionExpiresAt: issuedAt + 30 * 86400000,
          },
          issuedAt,
        );
        try {
          const user = await json(
            await upstream("enrollment", "/v1/auth/me", {
              headers: { Authorization: `Bearer ${next.accessToken}` },
            }),
            authUserSchema,
          );
          if (
            user.organizationId !== input.organizationId ||
            user.role !== "admin"
          )
            fail(403, "forbidden");
          const result = write(response({ user }), next);
          if (session) {
            await revoke(session);
            invalidate(session.id);
          }
          return result;
        } catch (error) {
          await revoke(next).catch(() => undefined);
          throw error;
        }
      }
      if (route === "auth/logout" && request.method === "POST") {
        if (session) {
          await revoke(session);
          invalidate(session.id);
        }
        return write(response(null, 204), null);
      }
      if (route === "auth/session" && request.method === "GET") {
        if (!session) return response({ user: null });
        const auth = await authorized(session, "enrollment", "/v1/auth/me");
        if (auth.renewed) renewedSession = auth.session;
        const user = await json(auth.result, authUserSchema);
        if (
          user.organizationId !== session.organizationId ||
          user.role !== "admin"
        )
          fail(403, "forbidden");
        const result = response({ user });
        return auth.renewed ? write(result, auth.session) : result;
      }
      // 임의 URL·인증 경로는 받지 않는다. 조직의 최종 인가는 backend가 수행한다.
      const match =
        /^(enrollment|dashboard)(\/api\/v1\/(?:organizations\/[^/]+\/[^?]+|vendor-catalog(?:\/[^?]+)?))$/.exec(
          route,
        );
      if (
        !match ||
        !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(request.method)
      )
        fail(404, "not_found");
      const service = match![1] as keyof typeof bases,
        path = match![2];
      for (const segment of path.split("/"))
        if (segment && !/^[A-Za-z0-9_-]+$/.test(segment))
          fail(400, "invalid_request");
      if (!session) fail(401, "unauthenticated");
      const org = /^\/api\/v1\/organizations\/([^/]+)\//.exec(path)?.[1];
      if (org && org !== session!.organizationId) fail(403, "forbidden");
      if (service === "dashboard" && request.method !== "GET")
        fail(405, "method_not_allowed");
      const headers = new Headers({ Accept: "application/json" });
      for (const name of ["idempotency-key", "if-match"]) {
        const v = request.headers.get(name);
        if (v) headers.set(name, v);
      }
      // 업무 DTO의 숫자 정밀도·원문·검증 오류를 보존한다. 인증 DTO만 BFF에서 파싱한다.
      const contentType = request.headers.get("content-type");
      if (contentType) headers.set("Content-Type", contentType);
      const body = await requestBytes(request);
      const auth = await authorized(session!, service, path + url.search, {
        method: request.method,
        headers,
        body,
      });
      const result = new Response(auth.result.body, {
        status: auth.result.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
      for (const name of ["retry-after", "etag", "location"]) {
        const v = auth.result.headers.get(name);
        if (v) result.headers.set(name, v);
      }
      return auth.renewed ? write(result, auth.session) : result;
    } catch (error) {
      const status =
        error instanceof BffError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : error instanceof SessionCookieError
              ? 502
              : 503;
      const code =
        error instanceof BffError
          ? error.code
          : error instanceof z.ZodError
            ? "invalid_request"
            : error instanceof SessionCookieError
              ? "session_too_large"
              : "unavailable";
      // 늦은 실패 응답으로 새 로그인 쿠키를 지우지 않는다. 세션 폐기는 backend가 판정한다.
      const result = response(
        {
          error: {
            code,
            message:
              status >= 500
                ? "서버에 연결하지 못했습니다. 다시 시도해 주세요."
                : "인증 또는 요청을 확인해 주세요.",
          },
        },
        status,
      );
      if (error instanceof BffError && error.retryAfter)
        result.headers.set("Retry-After", error.retryAfter);
      // RT 회전 성공 후 권한 거부·일시 조회 실패가 와도 새 RT를 잃지 않는다.
      return renewedSession && status !== 401
        ? write(result, renewedSession)
        : result;
    }
  }
  return { handle };
}

const runtime = globalThis as typeof globalThis & {
  __pulsemetryBff?: ReturnType<typeof createBff>;
};
export function getBff() {
  if (!runtime.__pulsemetryBff) {
    const origin = process.env.BFF_ORIGIN;
    if (!origin || !process.env.BFF_SESSION_KEYS)
      throw new Error("BFF_ORIGIN과 BFF_SESSION_KEYS를 설정하세요.");
    runtime.__pulsemetryBff = createBff({
      origin,
      keys: process.env.BFF_SESSION_KEYS.split(",").map((v) => v.trim()),
      enrollmentUrl: process.env.ENROLLMENT_API_URL ?? "http://localhost:8080",
      dashboardUrl: process.env.DASHBOARD_API_URL ?? "http://localhost:8081",
    });
  }
  return runtime.__pulsemetryBff;
}
