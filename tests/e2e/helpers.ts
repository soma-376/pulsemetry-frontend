import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("조직 ID", { exact: true })).toHaveCount(0);
  await page.getByLabel("회사 이메일", { exact: true }).fill(email);
  const response = page.waitForResponse(response => response.url().endsWith("/api/dev/seed-login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/(onboarding|overview)$/);
}

export async function signOut(page: Page) {
  const response = page.waitForResponse(response => response.url().endsWith("/v1/auth/logout") && response.request().method() === "POST");
  await page.getByRole("link", { name: "로그아웃", exact: true }).click();
  expect((await response).status()).toBe(204);
  await expect(page).toHaveURL(/\/login$/);
}

/** 브라우저의 실제 세션으로 API 결과를 보조 검증한다. 토큰은 Node/로그로 반환하지 않는다. */
export function authenticatedRequest(page: Page, origin: string, path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return page.evaluate(async ({ origin, path, method, body, headers }) => {
    const session = JSON.parse(sessionStorage.getItem("pulsemetry.seed-session.v1")!);
    const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${session.tokens.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }, { origin, path, method, body, headers });
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
    throw new Error(".env.local의 E2E_SEED_DATE를 현재 DB 시드의 생성 기준일(YYYY-MM-DD)로 설정하세요. 시드를 초기화할 필요는 없습니다.");
  }
  const offset = (days: number) => new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return { start: offset(-28), end: offset(-1) };
}
