"use client";
import { useSyncExternalStore } from "react";
import { AuthError, authErrorFrom } from "./auth-error";
import { LEGACY_SESSION_STORAGE_KEY } from "./session-key";
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
// 확인 결과의 무효화와 실제 신원 변경을 구분한다. 같은 계정의 탭 복귀는
// 진행 중 명령을 취소하지 않지만, A→B→A나 로그아웃은 이전 응답을 폐기한다.
let identityGeneration = 0;
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
      sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
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
    identityGeneration++;
    identityListeners.forEach((listener) => listener());
  }
  listeners.forEach((listener) => listener());
}
export function clearBackendSession() {
  generation++;
  identityGeneration++;
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
async function fetchWithCurrentCookie(
  url: string,
  init: RequestInit,
  mayRetry: () => boolean | Promise<boolean>,
) {
  const response = await fetch(url, init);
  if (
    response.status !== 409 ||
    response.headers.get("X-Pulsemetry-Session-Retry") !== "1" ||
    // 소비한 스트림을 재전송하지 않는다. 현재 업무 명령은 재사용 가능한 JSON 문자열이다.
    init.body instanceof ReadableStream ||
    !(await mayRetry())
  )
    return response;
  await response.body?.cancel();
  // BFF가 업무 upstream을 호출하기 전에 거절한 경우에만 한 번 재시도한다.
  // HttpOnly 쿠키는 읽지 않고 브라우저가 현재 쿠키를 다시 붙이게 한다.
  return fetch(url, init);
}
export async function restoreBackendSession(force = false) {
  if (restoreTask) return restoreTask;
  if (restored && !force) return;
  removeLegacyTokens();
  const epoch = generation;
  sessionState = { status: "checking" };
  listeners.forEach((listener) => listener());
  const task = (async () => {
    const response = await fetchWithCurrentCookie(
      "/api/bff/auth/session",
      {
        headers: bffHeaders(),
        credentials: "same-origin",
        cache: "no-store",
      },
      () => epoch === generation,
    );
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
/** 계정 변경·로그아웃·화면 숨김으로 무효화된 확인 결과를 구분한다. */
export function getBackendSessionGeneration() {
  return generation;
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
  const epoch = identityGeneration;
  let checkedGeneration = generation;
  const changedIdentity = () =>
    new DOMException("계정이 변경되었습니다.", "AbortError");
  const confirmIdentity = async () => {
    for (;;) {
      if (epoch !== identityGeneration) throw changedIdentity();
      if (sessionState.status === "error") throw sessionState.error;
      if (
        checkedGeneration === generation &&
        (sessionState.status !== "checking" || (!current && !restoreTask))
      )
        return;
      const checkingGeneration = generation;
      let unsubscribe = () => {};
      try {
        // 숨김/복귀 사이 응답은 현재 확인에 합류한다. 확인이 무효화되면
        // 이전 요청을 기다리지 않고 최신 확인에 합류하거나 신원 변경을 폐기한다.
        const invalidated = new Promise<void>((resolve) => {
          unsubscribe = subscribe(() => {
            if (checkingGeneration !== generation) resolve();
          });
        });
        await Promise.race([restoreBackendSession(), invalidated]);
      } catch (error) {
        if (epoch !== identityGeneration) throw changedIdentity();
        if (checkingGeneration !== generation) continue;
        throw error;
      } finally {
        unsubscribe();
      }
      if (epoch !== identityGeneration) throw changedIdentity();
      if (checkingGeneration !== generation) continue;
      const latest = getSessionState();
      if (latest.status === "checking") continue;
      if (latest.status === "error") throw latest.error;
      if (latest.status !== "authenticated") throw changedIdentity();
      checkedGeneration = generation;
    }
  };
  const response = await fetchWithCurrentCookie(
    url,
    {
      ...init,
      credentials: "same-origin",
      headers: bffHeaders(init.headers),
    },
    async () => {
      await confirmIdentity();
      if (epoch !== identityGeneration) throw changedIdentity();
      return true;
    },
  );
  await confirmIdentity();
  if (epoch !== identityGeneration) throw changedIdentity();
  if (response.status === 401) {
    // 업무 서비스의 인증 실패가 세션 전체의 만료를 뜻하지는 않는다.
    // 유효한 세션을 익명으로 바꾸면 로그인 가드가 다시 복원하면서 왕복한다.
    await restoreBackendSession(true);
    // 업무 401을 확인하다 실제 익명이 된 경우에는 기존 로그인 흐름을 따른다.
    if (getSessionState().status !== "anonymous") await confirmIdentity();
  }
  if (
    epoch !== identityGeneration &&
    !(response.status === 401 && getSessionState().status === "anonymous")
  )
    throw changedIdentity();
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
