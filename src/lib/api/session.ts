"use client";
import { useSyncExternalStore } from "react";
import { z } from "zod";

const tokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number(),
});
const userSchema = z.object({
  memberId: z.string(),
  organizationId: z.uuid(),
  organizationName: z.string(),
  email: z.email(),
  displayName: z.string().nullable(),
  role: z.enum(["admin", "member"]),
});
const sessionSchema = z.object({ tokens: tokensSchema, user: userSchema });
export type BackendSession = z.infer<typeof sessionSchema>;
const storageKey = "pulsemetry.seed-session.v1";
let current: BackendSession | null = null;
let restored = false;
let generation = 0;
let refreshTask: Promise<BackendSession> | null = null;
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
const notify = () => listeners.forEach((listener) => listener());
function snapshot() {
  if (!restored && typeof window !== "undefined") {
    restored = true;
    try {
      const saved = sessionSchema.safeParse(
        JSON.parse(sessionStorage.getItem(storageKey) ?? "null"),
      );
      current = saved.success ? saved.data : null;
    } catch {
      current = null;
    }
  }
  return current;
}
function save(value: BackendSession | null) {
  const identityChanged = identity(snapshot()) !== identity(value);
  current = value;
  restored = true;
  if (typeof window !== "undefined") {
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  }
  if (identityChanged) identityListeners.forEach((listener) => listener());
  notify();
}
export function clearBackendSession() {
  generation++;
  refreshTask = null;
  save(null);
}
export function useBackendSession() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot,
    () => null,
  );
}
export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const enrollmentUrl = () =>
  (
    process.env.NEXT_PUBLIC_ENROLLMENT_API_URL ?? "http://localhost:8080"
  ).replace(/\/$/, "");
export async function seedLogin(email: string, signal?: AbortSignal) {
  clearBackendSession();
  const epoch = generation;
  const response = await fetch("/api/dev/seed-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    signal,
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw new AuthError(
      body.message ?? "로그인에 실패했습니다.",
      response.status,
    );
  const session = sessionSchema.parse(body);
  signal?.throwIfAborted();
  if (generation !== epoch)
    throw new DOMException("로그인이 취소되었습니다.", "AbortError");
  save(session);
  return session.user;
}
async function refreshSession() {
  if (refreshTask) return refreshTask;
  const previous = snapshot();
  const epoch = generation;
  if (!previous) throw new AuthError("로그인이 필요합니다.", 401);
  const task = (async () => {
    const response = await fetch(`${enrollmentUrl()}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: previous.tokens.refresh_token }),
      cache: "no-store",
    });
    if (!response.ok) {
      if (generation === epoch && [400, 401, 403].includes(response.status))
        clearBackendSession();
      throw new AuthError(
        response.status >= 500
          ? "인증 서버에 연결하지 못했습니다."
          : "세션이 만료되었습니다. 다시 로그인해 주세요.",
        response.status,
      );
    }
    const tokens = tokensSchema.parse(await response.json());
    if (generation !== epoch || current !== previous)
      throw new AuthError("로그인이 변경되었습니다.", 401);
    const next = { ...previous, tokens };
    save(next);
    return next;
  })();
  refreshTask = task;
  try {
    return await task;
  } finally {
    if (refreshTask === task) refreshTask = null;
  }
}
/** 익명 데모 화면 접근은 유지한다. 로그인 후에는 실제 Bearer 인증을 사용한다. */
export async function sessionFetch(url: string, init: RequestInit = {}) {
  const before = snapshot();
  const epoch = generation;
  const send = (session: BackendSession | null) => {
    const headers = new Headers(init.headers);
    if (session)
      headers.set("Authorization", `Bearer ${session.tokens.access_token}`);
    return fetch(url, { ...init, headers });
  };
  const response = await send(before);
  if (epoch !== generation)
    throw new DOMException("계정이 변경되었습니다.", "AbortError");
  if (response.status !== 401 || !before) return response;
  const renewed =
    current && current.tokens.access_token !== before.tokens.access_token
      ? current
      : await refreshSession();
  init.signal?.throwIfAborted();
  const retry = await send(renewed);
  if (epoch !== generation)
    throw new DOMException("계정이 변경되었습니다.", "AbortError");
  if (retry.status === 401) clearBackendSession();
  return retry;
}
export async function backendLogout() {
  const session = snapshot();
  if (session) {
    const response = await fetch(`${enrollmentUrl()}/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.tokens.refresh_token }),
      cache: "no-store",
    });
    if (!response.ok && response.status !== 401)
      throw new AuthError(
        "로그아웃에 실패했습니다. 다시 시도해 주세요.",
        response.status,
      );
  }
  clearBackendSession();
}
