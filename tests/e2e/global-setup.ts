import { enrollmentBase, seedOrganizations } from "./fixtures";
import { PreparationError } from "./harness";
import { oidcOrigin } from "./oidc-environment";

/** 실제 SSO 서버가 없으면 준비 실패다. 비밀번호 로그인이나 인증 우회로 대체하지 않는다. */
export default async function globalSetup() {
  oidcOrigin();
  const response = await fetch(`${enrollmentBase()}/v1/auth/organizations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "owner@seed-a.example.test" }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new PreparationError(`회사 탐색 HTTP ${response.status}`);
  const body = await response.json();
  if (!body.organizations.some((org: { organizationId: string }) => org.organizationId === seedOrganizations[0].id)) throw new PreparationError("A 조직의 SSO 연결과 사전 등록 회원을 준비하세요.");
}
