import { dashboardBase, enrollmentBase, seedOrganizations } from "./fixtures";
import { paceLogin, PreparationError } from "./harness";

/**
 * 실행 전에 한 번만 서버·인증 설정·시드를 확인한다(worker 마다 다시 로그인하지 않는다). 서버가 없거나 구버전이면
 * 목 응답으로 대체하지 않고 준비 실패로 끝낸다. 로그인은 pacer 를 거친다.
 */
export default async function globalSetup() {
  const password = process.env.DEV_SEED_AUTH_PASSWORD;
  if (process.env.DEV_SEED_AUTH_ENABLED !== "true" || !password)
    throw new PreparationError(".env.local에 DEV_SEED_AUTH_ENABLED=true와 개발용 DEV_SEED_AUTH_PASSWORD를 설정하세요. 백엔드 tools/dev-seed/README.md를 참고하세요.");
  const request = async (url: string, init: RequestInit = {}) => {
    let response: Response;
    try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }); }
    catch { throw new PreparationError(`${new URL(url).origin}에 연결하지 못했습니다. 백엔드 서버와 .env.local의 포트를 확인하세요.`); }
    if (!response.ok) throw new PreparationError(`${new URL(url).pathname} → HTTP ${response.status}. 최신 서버·인증 설정·시드 적재를 확인하세요.`);
    return response;
  };
  const enrollment = enrollmentBase(), dashboard = dashboardBase();
  await paceLogin("globalSetup owner@seed-a.example.test");
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
