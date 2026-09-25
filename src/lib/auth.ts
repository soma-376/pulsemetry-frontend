import { loginSchema } from "./schemas/auth";
import { AUTH_SEED } from "@/mocks/auth";

export type LoginView = "form" | "unknown" | "redirect" | "denied" | "error";
export type DemoLoginResult = "success" | "cancelled" | "configuration" | "denied" | "network";
export const ownerMailto = `mailto:${AUTH_SEED.admins[0].email}?subject=${encodeURIComponent("Pulsemetry 로그인 문의")}`;

/** 조직 조회 목. 실제 이메일 확인과 조직 권한 검증은 서버·IdP 연동 시 대체합니다. */
export function resolveDemoLogin(input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid" as const };
  const email = parsed.data.email;
  if (!AUTH_SEED.domains.includes(email.split("@")[1])) return { kind: "unknown" as const, email };
  return { kind: "sso" as const, email, provider: AUTH_SEED.connection.provider };
}

export function resolveDemoAdmin(email: string) {
  const admin = AUTH_SEED.admins.find((entry) => entry.email === email);
  return admin ? { ...admin, organizationId: AUTH_SEED.organizationId } : null;
}
