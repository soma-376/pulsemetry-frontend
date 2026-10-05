import { paceLogin, ANNOTATION, PreparationError, probeRequests } from "./harness";
import { expect, test, type Page } from "@playwright/test";
import { dashboardBase, enrollmentBase } from "./fixtures";
import { oidcOrigin, oidcPassword } from "./oidc-environment";

export async function expectIdentityProvider(page: Page) {
  const origin = oidcOrigin();
  await expect(page).toHaveURL(url => url.origin === origin);
}

export async function submitIdentityProvider(page: Page, email: string, wrongPassword = false) {
  // 주소 검증 이후에만 자격 증명을 입력한다. IdP 테마가 다르면 테스트 선택자를 명시한다.
  await expectIdentityProvider(page);
  await page.locator(process.env.E2E_OIDC_USERNAME_SELECTOR ?? 'input[name="username"]:visible').fill(email);
  await page.locator(process.env.E2E_OIDC_PASSWORD_SELECTOR ?? 'input[name="password"]:visible')
    .fill(wrongPassword ? "intentionally-wrong-for-test" : oidcPassword(email));
  await page.locator(process.env.E2E_OIDC_SUBMIT_SELECTOR ?? 'button[type="submit"]:visible').click();
}

export async function signIn(page: Page, email: string) {
  await paceSignIn(email);
  let exchanges = 0;
  const exchanged = (request: import("@playwright/test").Request) => {
    if (request.url().endsWith("/api/bff/auth/token") && request.method() === "POST") exchanges++;
  };
  page.on("request", exchanged);
  await page.goto("/login");
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("조직 ID", { exact: true })).toHaveCount(0);
  await page.getByLabel("회사 이메일", { exact: true }).fill(email);
  await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
  await submitIdentityProvider(page, email);
  await expect(page).toHaveURL(/\/(onboarding|overview)(?:\?.*)?$/);
  expect(exchanges, "StrictMode를 포함하여 코드 교환은 한 번만 실행").toBe(1);
  page.off("request", exchanged);
}

export async function signOut(page: Page) {
  const response = page.waitForResponse(response => response.url().endsWith("/api/bff/auth/logout") && response.request().method() === "POST");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  expect((await response).status()).toBe(204);
  await expect(page).toHaveURL(/\/login$/);
}

/** 브라우저의 실제 세션으로 API 결과를 보조 검증한다. 토큰은 Node/로그로 반환하지 않는다. */
export function authenticatedRequest(page: Page, origin: string, path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  const service = new URL(origin).origin === new URL(dashboardBase()).origin ? "dashboard"
    : new URL(origin).origin === new URL(enrollmentBase()).origin ? "enrollment" : null;
  if (!service) throw new Error("알 수 없는 테스트 API origin");
  const probes = probeRequests.get(page) ?? new Set<string>();
  probes.add(`${method} ${new URL(`/api/bff/${service}${path}`, test.info().project.use.baseURL!).href}`);
  probeRequests.set(page, probes);
  return page.evaluate(async ({ service, path, method, body, headers }) => {
    const response = await fetch(`/api/bff/${service}${path}`, { method, credentials: "same-origin", headers: { "X-Pulsemetry-Request": "1", ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }, { service, path, method, body, headers });
}

export async function selectPeriod(page: Page, start: string, end: string) {
  await page.getByRole("button", { name: /^\d{4}\.\d{2}\.\d{2} ~ / }).click();
  const picker = page.getByRole("dialog", { name: "기간 선택" });
  for (const day of [start, end]) {
    // 달력의 실제 버튼을 찾아 월을 이동한다. 시계를 바꾸거나 URL에 기간을 주입하지 않는다.
    const targetMonth = Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7));
    for (let step = 0; step < 120; step++) {
      const button = picker.getByTitle(day, { exact: true });
      if (await button.count()) { await button.click(); break; }
      const text = await picker.getByText(/^\d{4}년 \d{1,2}월$/).innerText();
      const [year, month] = text.match(/\d+/g)!.map(Number);
      await picker.getByRole("button", { name: year * 12 + month > targetMonth ? "이전 달" : "다음 달", exact: true }).click();
      if (step === 119) throw new Error("시드 기준일이 달력 탐색 범위를 벗어났습니다. E2E_SEED_DATE를 확인하세요.");
    }
  }
  await picker.getByRole("button", { name: "적용", exact: true }).click();
}

/** 시드의 조회 구간 — 기준일 직전 28일, 종료일 포함. */
export function seedPeriod() {
  const value = process.env.E2E_SEED_DATE ?? "";
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new PreparationError(".env.local의 E2E_SEED_DATE를 현재 DB 시드의 생성 기준일(YYYY-MM-DD)로 설정하세요. 시드를 초기화할 필요는 없습니다.");
  }
  const offset = (days: number) => new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return { start: offset(-28), end: offset(-1) };
}

/** 로그인 한 번을 pacer 에 맡긴다. 기다린 만큼 테스트 제한 시간을 늘린다 — 대기는 실패가 아니다. */
export async function paceSignIn(email: string) {
  const info = test.info();
  const waited = await paceLogin(email, (ms) => info.setTimeout(info.timeout + ms));
  if (waited > 0) info.annotations.push({ type: ANNOTATION.pacerWait, description: String(waited) });
}


/** E2E Node 런타임에서만 쿠키를 해독한다. 브라우저 JS에는 토큰을 주입하지 않는다. */
export type StoredSession = { tokens: { access_token: string; refresh_token: string }; user: { organizationId: string; organizationName: string; email: string; role: string } };
async function cookieSession(page: Page) {
  const { createSessionCookie } = await import("../../src/lib/server/session-cookie");
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const keys = process.env.BFF_SESSION_KEYS?.split(",").map(key => key.trim());
  if (!keys?.length) throw new PreparationError("쿠키 검증 E2E에는 검증 서버와 동일한 BFF_SESSION_KEYS가 필요합니다.");
  const codec = createSessionCookie({ origin, keys });
  const cookie = (await page.context().cookies(origin)).find(cookie => cookie.name === codec.cookieName);
  const session = cookie ? codec.read(new Request(origin, { headers: { Cookie: `${cookie.name}=${cookie.value}` } })) : null;
  return { codec, session, origin };
}
export async function storedSession(page: Page): Promise<StoredSession | null> {
  const { session } = await cookieSession(page);
  if (!session) return null;
  const me = await fetch(`${enrollmentBase()}/v1/auth/me`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
  if (!me.ok) return null;
  return { tokens: { access_token: session.accessToken, refresh_token: session.refreshToken }, user: await me.json() };
}
export async function editStoredSession(page: Page, change: { access_token?: string; refresh_token?: string }) {
  const { codec, session, origin } = await cookieSession(page);
  if (!session) throw new PreparationError("변경할 E2E 쿠키 세션이 없습니다.");
  const value = codec.seal({ ...session, accessToken: change.access_token ?? session.accessToken, refreshToken: change.refresh_token ?? session.refreshToken });
  await page.context().addCookies([{ name: codec.cookieName, value, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
export async function injectSession(page: Page, stored: StoredSession, landing = "/overview") {
  const { codec, origin } = await cookieSession(page);
  const value = codec.seal({ id: crypto.randomUUID(), organizationId: stored.user.organizationId,
    accessToken: stored.tokens.access_token, refreshToken: stored.tokens.refresh_token,
    accessTokenExpiresAt: Date.now() + 300000, sessionExpiresAt: Date.now() + 86400000 });
  await page.context().addCookies([{ name: codec.cookieName, value, url: origin, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(landing);
}
/** 실제 IdP 왕복으로 서비스 토큰을 받는다. 테스트가 만든 계정도 IdP에 미리 준비해야 한다. */
export async function apiSession(organizationId: string, email: string): Promise<StoredSession> {
  await paceSignIn(email);
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {});
  try {
    const page = await browser.newPage({ baseURL: String(test.info().project.use.baseURL) });
    let resolve!: (value: StoredSession) => void, reject!: (error: Error) => void;
    const result = new Promise<StoredSession>((yes, no) => { resolve = yes; reject = no; });
    void result.catch(() => undefined);
    await page.route("**/api/bff/auth/token", async route => {
      try {
        const { code, redirect_uri, code_verifier } = route.request().postDataJSON();
        const response = await fetch(`${enrollmentBase()}/v1/auth/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, redirect_uri, code_verifier }) });
        if (!response.ok) throw new PreparationError(`OIDC 코드 교환 HTTP ${response.status}`);
        const tokens = await response.json();
        const me = await fetch(`${enrollmentBase()}/v1/auth/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        if (!me.ok) throw new PreparationError(`현재 사용자 조회 HTTP ${me.status}`);
        const user = await me.json();
        if (organizationId && user.organizationId !== organizationId) throw new PreparationError("IdP 계정의 조직이 테스트 대상과 다릅니다.");
        resolve({ tokens, user });
      } catch (error) { reject(error as Error); }
      await route.abort();
    });
    await page.goto("/login");
    await page.getByLabel("회사 이메일", { exact: true }).fill(email);
    await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
    await submitIdentityProvider(page, email);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([result, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PreparationError("OIDC 코드 교환 시간 초과")), 20000); })]); }
    finally { clearTimeout(timer); }
  } finally { await browser.close(); }
}
export const seedSession = (email: string) => apiSession("", email);
