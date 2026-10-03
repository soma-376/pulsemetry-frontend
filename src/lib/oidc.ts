"use client";
import { z } from "zod";
import { clearBackendSession, enrollmentUrl, exchangeLogin, bffHeaders } from "./api/session";

const organizationsSchema = z.object({ organizations: z.array(z.object({ organizationId: z.uuid(), organizationName: z.string() })) });
export type LoginOrganization = z.infer<typeof organizationsSchema>["organizations"][number];
export const OIDC_PENDING_KEY = "pulsemetry.oidc.pending.v1";
const pendingSchema = z.object({ state: z.string().min(16), verifier: z.string().min(43).max(128),
  organizationId: z.uuid(), redirectUri: z.url(), createdAt: z.number() });
export type PendingLogin = z.infer<typeof pendingSchema>;
let callbackTask: { attempt: object; task: ReturnType<typeof finishCallback> } | null = null;

export async function discoverOrganizations(email: string): Promise<LoginOrganization[]> {
  const response = await fetch("/api/bff/auth/organizations", { method: "POST",
    headers: bffHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ email }), cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(response.status === 429
    ? "로그인 조회가 너무 많습니다. 잠시 후 다시 시도해 주세요."
    : "로그인 정보를 확인하지 못했습니다. 이메일과 서버 연결을 확인해 주세요.");
  return organizationsSchema.parse(await response.json()).organizations;
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function createLogin(organizationId: string, redirectUri: string, loginHint?: string, now = Date.now()) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const pending = pendingSchema.parse({ organizationId, redirectUri, verifier, state, createdAt: now });
  const url = new URL(`${enrollmentUrl()}/v1/auth/oidc/authorize`);
  url.search = new URLSearchParams({ tenant_id: organizationId, redirect_uri: redirectUri, state,
    code_challenge: challenge, code_challenge_method: "S256" }).toString();
  if (loginHint) url.searchParams.set("login_hint", loginHint.trim().toLowerCase());
  return { pending, url: url.toString() };
}

export async function startOidcLogin(organizationId: string, loginHint?: string) {
  const login = await createLogin(organizationId, `${window.location.origin}/auth/callback`, loginHint);
  clearBackendSession();
  callbackTask = null;
  sessionStorage.setItem(OIDC_PENDING_KEY, JSON.stringify(login.pending));
  // 회사 인증 화면에서 뒤로 돌아올 수 있도록 로그인 방문 기록을 유지한다.
  window.location.assign(login.url);
}

export const loginErrors: Record<string, string> = {
  login_cancelled: "회사 계정 로그인이 취소되었습니다. 다시 시도해 주세요.",
  member_not_allowed: "인증한 계정이 이 회사의 활성 회원으로 등록되어 있지 않습니다. 조직 관리자에게 문의해 주세요.",
  invalid_credentials: "회사 계정 인증을 확인하지 못했습니다. 다시 로그인해 주세요.",
  auth_unavailable: "회사 인증 서버에 연결하지 못했습니다. 잠시 후 다시 로그인해 주세요.",
  login_expired: "로그인 요청이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.",
};

/** 서버가 보낸 오류도 state 검증 전에는 신뢰하지 않는다. 세션 유실은 일반 만료 안내만 한다. */
export function validateCallback(href: string, rawPending: string | null, now = Date.now()) {
  const url = new URL(href);
  let pending: PendingLogin;
  try { pending = pendingSchema.parse(JSON.parse(rawPending ?? "null")); }
  catch { throw new Error(loginErrors.login_expired); }
  const one = (key: string) => url.searchParams.getAll(key).length === 1 ? url.searchParams.get(key) : null;
  if (now - pending.createdAt > 600_000 || now < pending.createdAt ||
      pending.redirectUri !== `${url.origin}${url.pathname}` || one("state") !== pending.state)
    throw new Error(loginErrors.login_expired);
  const error = one("error");
  if (error && !url.searchParams.has("code")) throw new Error(loginErrors[error] ?? loginErrors.invalid_credentials);
  const code = one("code");
  if (url.searchParams.has("error") || !code || !/^uac_[A-Za-z0-9_-]{43}$/.test(code)) throw new Error(loginErrors.invalid_credentials);
  return { pending, code };
}

async function finishCallback() {
  const href = window.location.href;
  const rawPending = sessionStorage.getItem(OIDC_PENDING_KEY);
  sessionStorage.removeItem(OIDC_PENDING_KEY);
  window.history.replaceState(window.history.state, "", "/auth/callback");
  const { pending, code } = validateCallback(href, rawPending);
  return exchangeLogin(code, pending.redirectUri, pending.verifier, pending.organizationId);
}

/** StrictMode 재실행은 한 교환을 공유한다. 새로고침 시 소비된 임시 정보로 재교환하지 않는다. */
export function completeOidcCallback(attempt: object) {
  if (callbackTask?.attempt !== attempt) callbackTask = { attempt, task: finishCallback() };
  return callbackTask.task;
}
