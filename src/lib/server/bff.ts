import { createBffOriginPolicy } from "./bff-origin";
// Node 전용 모듈. 브라우저 모듈에서 가져오지 않는다.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authUserSchema } from "../auth-user";
import { logger, type LogFields, type ServerLogger } from "./logger";
import {
  createSessionReferenceCookie,
  SessionCookieError,
  type Session,
} from "./session-cookie";

import {
  SessionStoreError,
  type SessionStore,
  createValkeySessionStore,
} from "./valkey-session-store";
import { createValkeyCommands } from "./valkey-connection";

const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().positive().max(86400),
});
export type BffConfig = {
  sessionStore: SessionStore;
  origin: string;
  enrollmentUrl: string;
  dashboardUrl: string;
  keys: string[];
  timeoutMs?: number;
  environment?: string;
  localOrigins?: string[];
};
class BffError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfter?: string | null,
    public upstream?: Pick<LogFields, "upstreamService" | "upstreamStatus">,
  ) {
    super(code);
  }
}
const fail = (
  status: number,
  code: string,
  retryAfter?: string | null,
  upstream?: Pick<LogFields, "upstreamService" | "upstreamStatus">,
): never => {
  throw new BffError(status, code, retryAfter, upstream);
};

export function createBff(
  config: BffConfig,
  fetcher: typeof fetch = fetch,
  now = Date.now,
  log: ServerLogger = logger,
) {
  const originPolicy = createBffOriginPolicy(config);
  const referenceCookie = createSessionReferenceCookie(config, now);
  const store = config.sessionStore;
  const write = referenceCookie.write;
  async function read(request: Request) {
    const reference = referenceCookie.read(request);
    if (!reference) return null;
    const session = await store.read(reference.id);
    if (!session) fail(401, "session_reauthentication_required");
    return session;
  }
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
  const upstreamResponses = new WeakMap<
    Response,
    Pick<LogFields, "upstreamService" | "upstreamStatus">
  >();
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
    // 실제 요청은 GET도 공통 헤더와 명시적인 출처 검증을 통과해야 한다.
    if (request.headers.get("x-pulsemetry-request") !== "1")
      fail(403, "forbidden");
    const requestOrigin = request.headers.get("origin");
    if (
      (requestOrigin && !originPolicy.allowed(requestOrigin)) ||
      (request.headers.get("sec-fetch-site") === "cross-site" &&
        !originPolicy.allowsCrossSite(requestOrigin))
    )
      fail(403, "forbidden");
    if (
      !["GET", "HEAD"].includes(request.method) &&
      !originPolicy.allowed(requestOrigin)
    )
      fail(403, "forbidden");
  }
  async function upstream(
    service: keyof typeof bases,
    path: string,
    init: RequestInit = {},
  ) {
    try {
      const result = await fetcher(new URL(path, bases[service]), {
        ...init,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(config.timeoutMs ?? 10000),
      });
      upstreamResponses.set(result, {
        upstreamService: service,
        upstreamStatus: result.status,
      });
      return result;
    } catch {
      return fail(503, "unavailable", undefined, { upstreamService: service });
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
        upstreamResponses.get(r),
      );
    try {
      return schema.parse(await r.json());
    } catch {
      return fail(502, "invalid_response", undefined, upstreamResponses.get(r));
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
      "/api/v1/auth/logout",
      post({ refresh_token: session.refreshToken }),
    );
    if (!r.ok && r.status !== 401)
      fail(
        r.status === 429 ? 429 : 503,
        r.status === 429 ? "rate_limited" : "unavailable",
        r.headers.get("Retry-After"),
        upstreamResponses.get(r),
      );
  }
  async function invalidate(id: string) {
    await store.remove(id);
  }
  function refresh(session: Session): Promise<Session> {
    return store.refresh(
      session,
      async () => {
        const issuedAt = now();
        const tokens = await json(
          await upstream(
            "enrollment",
            "/api/v1/auth/refresh",
            post({ refresh_token: session.refreshToken }),
          ),
          tokensSchema,
        );
        return tokenSession(tokens, session, issuedAt);
      },
      revoke,
    );
  }
  async function authorized(
    session: Session,
    service: keyof typeof bases,
    path: string,
    init: RequestInit,
  ) {
    // 요청 진입 시 읽은 세션을 사용한다. 갱신 시에는 저장소가 최신 상태를 확인한다.
    let active = session;
    if (active.accessTokenExpiresAt <= now() + 5000)
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
      await invalidate(session.id);
      fail(401, "unauthenticated");
    }
    if (result.status >= 300 && result.status < 400)
      fail(502, "invalid_response");
    return { result };
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
    const startedAt = now();
    // Never log raw paths: they can contain identifiers or attacker input.
    const pathname = new URL(request.url).pathname;
    const route =
      ["session", "token", "logout", "organizations"]
        .map((name) => `/api/bff/auth/${name}`)
        .find((path) => path === pathname) ??
      (pathname.startsWith("/api/bff/dashboard/")
        ? "/api/bff/dashboard/[...path]"
        : pathname.startsWith("/api/bff/enrollment/")
          ? "/api/bff/enrollment/[...path]"
          : "/api/bff/[...path]");
    function recordFailure(
      status: number,
      code: string,
      upstream?: BffError["upstream"],
    ) {
      const level = status >= 500 ? "error" : "warn";
      try {
        log[level]("bff.request.failed", {
          source: upstream ? "upstream" : "bff",
          route,
          method: request.method,
          status,
          code,
          ...upstream,
          durationMs: Math.max(0, now() - startedAt),
        });
      } catch {
        /* A failed log transport must not change auth behavior. */
      }
    }
    try {
      checkRequest(request);
      const url = new URL(request.url),
        route = url.pathname.replace(/^\/api\/bff\//, "");
      // 로그인 경로는 기존 세션 유실로 막지 않는다. 새 세션을 저장할 수 없으면 실패한다.
      const reference = referenceCookie.read(request);
      const session =
        route === "auth/token" ||
        route === "auth/organizations" ||
        route === "auth/logout"
          ? null
          : await read(request);
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
            await upstream(
              "enrollment",
              "/api/v1/auth/organizations",
              post(body),
            ),
            schema,
          ),
        );
      }
      if (route === "auth/token" && request.method === "POST") {
        const input = z
          .object({
            code: z.string().regex(/^uac_[A-Za-z0-9_-]{43}$/),
            redirect_uri: z
              .string()
              .refine((value) =>
                originPolicy.allowsCallback(
                  value,
                  request.headers.get("origin"),
                ),
              ),
            code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
            organizationId: z.uuid(),
          })
          .parse(await requestJson(request));
        const issuedAt = now();
        const tokens = await json(
          await upstream(
            "enrollment",
            "/api/v1/auth/token",
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
            await upstream("enrollment", "/api/v1/auth/me", {
              headers: { Authorization: `Bearer ${next.accessToken}` },
            }),
            authUserSchema,
          );
          if (
            user.organizationId !== input.organizationId ||
            user.role !== "admin"
          )
            fail(403, "forbidden");
          await store.create(next);
          if (reference) {
            const old = await store.remove(reference.id);
            if (old) await revoke(old).catch(() => undefined);
          }
          return write(response({ user }), next);
        } catch (error) {
          await store.remove(next.id).catch(() => undefined);
          await revoke(next).catch(() => undefined);
          throw error;
        }
      }
      if (route === "auth/logout" && request.method === "POST") {
        if (reference) {
          const removed = await store.remove(reference.id);
          if (removed) await revoke(removed);
        }
        return write(response(null, 204), null);
      }
      if (route === "auth/session" && request.method === "GET") {
        if (!session) return response({ user: null });
        const auth = await authorized(
          session,
          "enrollment",
          "/api/v1/auth/me",
          {},
        );
        const user = await json(auth.result, authUserSchema);
        if (
          user.organizationId !== session.organizationId ||
          user.role !== "admin"
        )
          fail(403, "forbidden");
        const result = response({ user });
        return result;
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
      if (result.status >= 400)
        recordFailure(
          result.status,
          "upstream_http_error",
          upstreamResponses.get(auth.result),
        );
      return result;
    } catch (error) {
      const status =
        error instanceof BffError || error instanceof SessionStoreError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : error instanceof SessionCookieError
              ? 502
              : 503;
      const code =
        error instanceof BffError || error instanceof SessionStoreError
          ? error.code
          : error instanceof z.ZodError
            ? "invalid_request"
            : error instanceof SessionCookieError
              ? "session_too_large"
              : "unavailable";
      recordFailure(
        status,
        code,
        error instanceof BffError ? error.upstream : undefined,
      );
      // 늦은 실패 응답으로 새 로그인 쿠키를 지우지 않는다. 웹 세션 폐기는 Valkey에 반영한다.
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
      return result;
    }
  }
  return {
    handle: async (request: Request) => {
      if (request.method === "OPTIONS") return originPolicy.preflight(request);
      return originPolicy.cors(request, await handle(request));
    },
  };
}

const runtime = globalThis as typeof globalThis & {
  __pulsemetryBff?: ReturnType<typeof createBff>;
};
export function getBff() {
  if (!runtime.__pulsemetryBff) {
    const origin = process.env.BFF_ORIGIN;
    if (!origin || !process.env.BFF_SESSION_KEYS)
      throw new Error("BFF_ORIGIN과 BFF_SESSION_KEYS를 설정하세요.");
    const keys = process.env.BFF_SESSION_KEYS.split(",").map((v) => v.trim());
    const environment = process.env.BFF_SESSION_ENV;
    const host = process.env.BFF_VALKEY_HOST;
    const cacheName = process.env.BFF_VALKEY_CACHE_NAME;
    const username = process.env.BFF_VALKEY_USERNAME;
    if (
      (environment !== "dev" && environment !== "prod") ||
      !host ||
      !cacheName ||
      username !== `pulsemetry-bff-${environment}`
    )
      throw new Error("Valkey 환경별 연결 설정을 확인하세요.");
    const sessionStore = createValkeySessionStore(
      createValkeyCommands({
        host,
        cacheName,
        username,
        region: process.env.AWS_REGION ?? "ap-northeast-2",
      }),
      { origin, keys, environment },
    );
    runtime.__pulsemetryBff = createBff({
      sessionStore,
      environment,
      localOrigins: process.env.BFF_LOCAL_ORIGINS?.split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      origin,
      keys,
      enrollmentUrl: process.env.ENROLLMENT_API_URL ?? "http://localhost:8080",
      dashboardUrl: process.env.DASHBOARD_API_URL ?? "http://localhost:8081",
    });
  }
  return runtime.__pulsemetryBff;
}
