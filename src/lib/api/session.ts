"use client";
import { useSyncExternalStore } from "react";
import { AuthError, authErrorFrom } from "./auth-error";
export { AuthError };
import { authUserSchema, type AuthUser } from "../auth-user";

export type BackendSession = { user: AuthUser };
let current: BackendSession | null = null;
export type SessionState =
  | { status: "checking" }
  | { status: "authenticated"; session: BackendSession }
  | { status: "anonymous" }
  | { status: "error"; error: AuthError };
const initialState: SessionState = { status: "checking" };
let sessionState: SessionState = initialState;
let restored = false;
let generation = 0;
let restoreTask: Promise<void> | null = null;
const listeners = new Set<() => void>();
const identityListeners = new Set<() => void>();
const identity = (session: BackendSession | null) =>
  session
    ? JSON.stringify([
        session.user.organizationId,
        session.user.memberId,
        session.user.role,
      ])
    : null;
export function subscribeBackendIdentityChange(listener: () => void) {
  identityListeners.add(listener);
  return () => {
    identityListeners.delete(listener);
  };
}
function removeLegacyTokens() {
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem("pulsemetry.seed-session.v1");
    } catch {
      /* 저장소 차단 환경도 지원한다. */
    }
  }
}
function save(value: BackendSession | null) {
  const changed = identity(current) !== identity(value);
  current = value;
  restored = true;
  sessionState = value
    ? { status: "authenticated", session: value }
    : { status: "anonymous" };
  removeLegacyTokens();
  if (changed) {
    generation++;
    identityListeners.forEach((listener) => listener());
  }
  listeners.forEach((listener) => listener());
}
export function clearBackendSession() {
  generation++;
  restoreTask = null;
  save(null);
}
/** 뒤로가기 캐시에 남은 확인 결과·진행 중 요청은 재사용하지 않는다. 사용자와 데이터 캐시는 유지한다. */
export function invalidateBackendSessionCheck() {
  generation++;
  restoreTask = null;
  restored = false;
  sessionState = { status: "checking" };
  listeners.forEach((listener) => listener());
}
export const bffHeaders = (headers?: HeadersInit) => {
  const result = new Headers(headers);
  result.delete("Authorization");
  result.set("X-Pulsemetry-Request", "1");
  return result;
};
export async function restoreBackendSession(force = false) {
  if (restoreTask) return restoreTask;
  if (restored && !force) return;
  removeLegacyTokens();
  const epoch = generation;
  sessionState = { status: "checking" };
  listeners.forEach((listener) => listener());
  const task = (async () => {
    const response = await fetch("/api/bff/auth/session", {
      headers: bffHeaders(),
      credentials: "same-origin",
      cache: "no-store",
    });
    if (epoch !== generation) return;
    if (response.status === 401) {
      save(null);
      return;
    }
    if (!response.ok)
      throw await authErrorFrom(
        response,
        response.status === 403
          ? "이 회사에 접근할 권한이 없습니다. 조직 관리자에게 문의해 주세요."
          : response.status === 429
            ? "인증 요청이 많습니다. 잠시 후 다시 시도해 주세요."
            : "세션을 확인하지 못했습니다. 다시 시도해 주세요.",
      );
    const body = await response.json();
    if (epoch !== generation) return;
    const user = authUserSchema.nullable().parse(body.user);
    save(user ? { user } : null);
  })().catch((error) => {
    if (epoch === generation) {
      sessionState = {
        status: "error",
        error:
          error instanceof AuthError
            ? error
            : new AuthError(
                "세션을 확인하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
                503,
              ),
      };
      listeners.forEach((listener) => listener());
    }
    throw error;
  });
  restoreTask = task;
  try {
    await task;
  } finally {
    if (restoreTask === task) restoreTask = null;
  }
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function getSessionState() {
  return sessionState;
}
export function useSessionState() {
  return useSyncExternalStore(subscribe, getSessionState, () => initialState);
}
/** 세션 확인은 공통 화면 가드가 소유한다. 각 소비자가 별도로 /me를 호출하지 않는다. */
export function useBackendSession() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
// OIDC 페이지 이동만 브라우저가 공개 enrollment 주소를 사용한다.
export const enrollmentUrl = () =>
  (
    process.env.NEXT_PUBLIC_ENROLLMENT_API_URL ?? "http://localhost:8080"
  ).replace(/\/$/, "");
export async function exchangeLogin(
  code: string,
  redirectUri: string,
  verifier: string,
  organizationId: string,
) {
  clearBackendSession();
  const epoch = generation;
  const response = await fetch("/api/bff/auth/token", {
    method: "POST",
    credentials: "same-origin",
    headers: bffHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      organizationId,
    }),
    cache: "no-store",
  });
  if (!response.ok)
    throw await authErrorFrom(
      response,
      response.status === 403
        ? "이 회사의 관리자 접근 권한이 없습니다. 조직 관리자에게 문의해 주세요."
        : response.status >= 500
          ? "인증 서버에 연결하지 못했습니다. 다시 로그인해 주세요."
          : "로그인 요청이 만료되었거나 이미 사용되었습니다. 다시 로그인해 주세요.",
    );
  const user = authUserSchema.parse((await response.json()).user);
  if (generation !== epoch)
    throw new DOMException("로그인이 취소되었습니다.", "AbortError");
  save({ user });
  return user;
}
/** 서비스 토큰은 BFF만 사용한다. 클라이언트는 동일 출처 쿠키 인증 요청만 보낸다. */
export async function sessionFetch(url: string, init: RequestInit = {}) {
  if (!url.startsWith("/api/bff/"))
    throw new Error("인증 요청은 동일 출처 BFF 경로를 사용해야 합니다.");
  const epoch = generation;
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: bffHeaders(init.headers),
  });
  if (epoch !== generation)
    throw new DOMException("계정이 변경되었습니다.", "AbortError");
  if (response.status === 401) clearBackendSession();
  return response;
}
export async function backendLogout() {
  const response = await fetch("/api/bff/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: bffHeaders(),
    cache: "no-store",
  });
  if (!response.ok)
    throw await authErrorFrom(
      response,
      "로그아웃에 실패했습니다. 다시 시도해 주세요.",
    );
  clearBackendSession();
}

/** 화면 배지는 BFF가 검증하여 반환한 사용자 역할만 사용한다. */
export const sessionRole = (session: BackendSession) => session.user.role;
