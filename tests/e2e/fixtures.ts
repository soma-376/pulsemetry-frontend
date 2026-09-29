import { test as base, expect } from "@playwright/test";

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
export const dashboardBase = () => localBase(process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? "http://localhost:8081");

/** 서버가 없거나 구버전일 때 목 응답으로 대체하지 않고 선행 조건 실패로 표시한다. */
async function checkBackend() {
  const password = process.env.DEV_SEED_AUTH_PASSWORD;
  if (process.env.DEV_SEED_AUTH_ENABLED !== "true" || !password) throw new Error(".env.local에 DEV_SEED_AUTH_ENABLED=true와 개발용 DEV_SEED_AUTH_PASSWORD를 설정하세요. 백엔드 tools/dev-seed/README.md를 참고하세요.");
  const request = async (url: string, init: RequestInit = {}) => {
    let response: Response;
    try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }); }
    catch { throw new Error(`E2E 선행 조건 실패: ${new URL(url).origin}에 연결하지 못했습니다. 백엔드 서버와 .env.local의 포트를 확인하세요.`); }
    if (!response.ok) throw new Error(`E2E 선행 조건 실패: ${new URL(url).pathname} → HTTP ${response.status}. 최신 서버·인증 설정·시드 적재를 확인하세요.`);
    return response;
  };
  const enrollment = enrollmentBase(), dashboard = dashboardBase();
  const response = await request(`${enrollment}/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: seedOrganizations[0].id, email: "owner@seed-a.example.test", password }) });
  const tokens = await response.json();
  try {
    const headers = { Authorization: `Bearer ${tokens.access_token}` };
    await Promise.all([
      request(`${dashboard}/api/v1/vendor-catalog?limit=1`, { headers }),
      request(`${enrollment}/api/v1/organizations/${seedOrganizations[0].id}/onboarding`, { headers }),
    ]);
  } finally {
    await request(`${enrollment}/v1/auth/logout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: tokens.refresh_token }) });
  }
}

export const test = base.extend<{ browserErrors: void }, { backendReady: void }>({
  // Playwright requires destructuring even when a fixture has no dependencies.
  backendReady: [async ({}, use) => { await checkBackend(); await use(); }, { scope: "worker", auto: true }],
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await use();
    expect(errors, "브라우저 런타임 오류").toEqual([]);
  }, { auto: true }],
});
export { expect };
