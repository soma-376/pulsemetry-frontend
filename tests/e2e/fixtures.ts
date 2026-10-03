import { test as base, expect } from "@playwright/test";
import { oidcOrigin } from "./oidc-environment";

export const seedOrganizations = [
  { seed: "a", id: "1b59ab21-1788-35e0-bfd7-23baa88a35b4", name: "시드 A · 정상 사용" },
  { seed: "b", id: "db1c8c6b-6970-38c6-821a-eb5e61b7a180", name: "시드 B · 신규 조직" },
  { seed: "c", id: "4769355c-a20e-327f-89fc-fef69e94dfb6", name: "시드 C · 예외 데이터" },
] as const;

function localBase(value: string) {
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) throw new Error("시드 E2E는 로컬 백엔드 주소를 사용해야 합니다.");
  return value.replace(/\/$/, "");
}
export const enrollmentBase = () => localBase(process.env.NEXT_PUBLIC_ENROLLMENT_API_URL ?? "http://localhost:8080");
export const dashboardBase = () => localBase(process.env.DASHBOARD_API_URL ?? "http://localhost:8081");

/** 서버가 없거나 구버전일 때 목 응답으로 대체하지 않고 선행 조건 실패로 표시한다. */
async function checkBackend() {
  oidcOrigin();
  const request = async (url: string, init: RequestInit = {}) => {
    let response: Response;
    try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }); }
    catch { throw new Error(`E2E 선행 조건 실패: ${new URL(url).origin}에 연결하지 못했습니다. 백엔드 서버와 .env.local의 포트를 확인하세요.`); }
    if (!response.ok) throw new Error(`E2E 선행 조건 실패: ${new URL(url).pathname} → HTTP ${response.status}. 최신 서버·인증 설정·시드 적재를 확인하세요.`);
    return response;
  };
  const response = await request(`${enrollmentBase()}/v1/auth/organizations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "owner@seed-a.example.test" }) });
  if (!(await response.json()).organizations.some((org: { organizationId: string }) => org.organizationId === seedOrganizations[0].id))
    throw new Error("A 시드의 OIDC 식별자와 서버 회사 설정을 확인하세요. 테스트는 시드를 초기화하지 않습니다.");
}

export const test = base.extend<{ browserErrors: void; authPacing: void }, { backendReady: void }>({
  // Playwright requires destructuring even when a fixture has no dependencies.
  backendReady: [async ({}, use) => { await checkBackend(); await use(); }, { scope: "worker", auto: true }],
  // 실제 IP 30회/분 제한을 끄거나 DB에서 지우지 않는다. 인증 왕복이 여러 요청을 쓰므로 간격을 둔다.
  authPacing: [async ({}, use) => { await use(); await new Promise(resolve => setTimeout(resolve, 20_000)); }, { auto: true }],
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await use();
    expect(errors, "브라우저 런타임 오류").toEqual([]);
  }, { auto: true }],
});
export { expect };
