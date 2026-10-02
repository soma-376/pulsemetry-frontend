import { expect, test, type Page } from "@playwright/test";
import { enrollmentBase } from "./fixtures";
import { ANNOTATION, paceLogin, PreparationError } from "./harness";
import { SESSION_STORAGE_KEY } from "../../src/lib/api/session-key";

const sessionKey = SESSION_STORAGE_KEY;

/** 이 page 의 저장된 세션(앱과 같은 키). 없으면 null. 토큰을 로그에 싣지 않는다. */
export async function storedSession(page: Page): Promise<{ tokens: { access_token: string; refresh_token: string }; user: { organizationId: string; email: string } } | null> {
  return JSON.parse(await page.evaluate((key) => sessionStorage.getItem(key), sessionKey) ?? "null");
}
/** 이 page 의 저장된 세션을 바꾼다(만료·위조 토큰 시험용). */
export async function editStoredSession(page: Page, change: { access_token?: string; refresh_token?: string }) {
  await page.evaluate(({ key, change }) => {
    const saved = JSON.parse(sessionStorage.getItem(key)!);
    Object.assign(saved.tokens, change);
    sessionStorage.setItem(key, JSON.stringify(saved));
  }, { key: sessionKey, change });
}

/** 로그인 한 번을 pacer 에 맡긴다. 기다린 만큼 테스트 제한 시간을 늘린다 — 대기는 실패가 아니다. */
export async function paceSignIn(email: string) {
  const info = test.info();
  const waited = await paceLogin(email, (ms) => info.setTimeout(info.timeout + ms));
  if (waited > 0) info.annotations.push({ type: ANNOTATION.pacerWait, description: String(waited) });
}

/**
 * 테스트마다 자기 세션으로 로그인한다(세션·토큰을 테스트끼리 나누지 않는다). 로그인은 pacer 를 거친다.
 * 기본은 시드 로그인 어댑터를 Node 에서 불러 받은 `{tokens, user}`를 이 page 의 sessionStorage 에 **한 번만** 넣고(표식 키 —
 * 로그아웃 뒤 다시 살아나지 않는다), 로그인 화면이 가는 곳(온보딩 완료 여부)으로 이동한다.
 * `ui: true`는 로그인 화면 자체를 시험하는 테스트만 쓴다. 로그인 실패는 시험 대상이 아니므로 준비 실패로 보고한다.
 */
export async function signIn(page: Page, email: string, options: { ui?: boolean } = {}) {
  await paceSignIn(email);
  if (options.ui) {
    await page.goto("/login");
    await expect(page.getByLabel("비밀번호", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("조직 ID", { exact: true })).toHaveCount(0);
    await page.getByLabel("회사 이메일", { exact: true }).fill(email);
    const response = page.waitForResponse(response => response.url().endsWith("/api/dev/seed-login") && response.request().method() === "POST");
    await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
    const status = (await response).status();
    if (status !== 200) throw new PreparationError(`${email} 화면 로그인 → 시드 로그인 어댑터 HTTP ${status}`);
    await expect(page).toHaveURL(/\/(onboarding|overview)$/);
    return;
  }
  const origin = new URL(test.info().project.use.baseURL!).origin;
  let response: Response;
  try {
    response = await fetch(`${origin}/api/dev/seed-login`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email }), signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new PreparationError(`${email} 로그인 요청이 ${origin}/api/dev/seed-login 에 닿지 않았습니다.`);
  }
  if (response.status === 429) test.info().annotations.push({ type: ANNOTATION.observed429, description: "POST /api/dev/seed-login" });
  if (!response.ok) throw new PreparationError(`${email} 로그인 → 시드 로그인 어댑터 HTTP ${response.status}`);
  const session = await response.json();
  // 로그인 화면과 같은 곳으로 간다 — 온보딩을 마친 조직은 개요, 아니면 온보딩.
  const onboarding = await fetch(`${enrollmentBase()}/api/v1/organizations/${session.user.organizationId}/onboarding`, { headers: { Authorization: `Bearer ${session.tokens.access_token}` }, signal: AbortSignal.timeout(20_000) });
  if (!onboarding.ok) throw new PreparationError(`${email} 온보딩 조회 → HTTP ${onboarding.status}`);
  const landing = (await onboarding.json()).completed ? "/overview" : "/onboarding";
  await page.addInitScript(({ key, marker, value, origin }) => {
    if (location.origin !== origin || sessionStorage.getItem(marker)) return;
    sessionStorage.setItem(marker, "1");
    sessionStorage.setItem(key, value);
  }, { key: sessionKey, marker: `pulsemetry.e2e-session.${crypto.randomUUID()}`, value: JSON.stringify(session), origin });
  await page.goto(landing);
  await expect(page).toHaveURL(new RegExp(`${landing}$`));
  // 앱이 저장된 세션을 읽어 화면에 조직명을 그릴 때까지 기다린다. 그 전에 테스트가 저장된 세션을 바꾸면(만료 시험 등)
  // 아직 뜨는 화면과 다음 화면이 같은 갱신 토큰을 함께 써서 서버의 재사용 탐지가 세션을 폐기한다.
  await expect(page.getByText(session.user.organizationName).first()).toBeVisible();
}

export async function signOut(page: Page) {
  const response = page.waitForResponse(response => response.url().endsWith("/v1/auth/logout") && response.request().method() === "POST");
  await page.getByRole("link", { name: "로그아웃", exact: true }).click();
  expect((await response).status()).toBe(204);
  await expect(page).toHaveURL(/\/login$/);
}

/** 브라우저의 실제 세션으로 API 결과를 보조 검증한다. 토큰은 Node/로그로 반환하지 않는다. */
export function authenticatedRequest(page: Page, origin: string, path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return page.evaluate(async ({ origin, path, method, body, headers, key }) => {
    const session = JSON.parse(sessionStorage.getItem(key)!);
    const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${session.tokens.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }, { origin, path, method, body, headers, key: sessionKey });
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
      if (step === 119) throw new PreparationError("시드 기준일이 달력 탐색 범위를 벗어났습니다. E2E_SEED_DATE를 확인하세요.");
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
