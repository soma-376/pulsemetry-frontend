import { enrollmentBase, expect, test, seedOrganizations as organizations } from "./fixtures";
import { editStoredSession, paceSignIn, signIn, storedSession } from "./helpers";
import { SESSION_STORAGE_KEY } from "../../src/lib/api/session-key";
import { ANNOTATION } from "./harness";

for (const organization of organizations) {
  test(`SEED-AUTH-${organization.seed.toUpperCase()} @p0 @read 이메일만으로 실제 인증 후 조직별 개요 조회·새로고침·로그아웃`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await signIn(page, `owner@seed-${organization.seed}.example.test`, { ui: true });
    const overview = page.waitForResponse((response) => response.url().includes(`/organizations/${organization.id}/analytics/overview?`) && response.request().method() === "GET");
    await page.goto("/overview");
    const response = await overview;
    expect(response.status()).toBe(200);
    expect(response.request().headers().authorization).toMatch(/^Bearer /);
    const body = await response.json();
    expect(body.meta.organizationId).toBe(organization.id);
    await expect(page.getByRole("navigation")).toContainText(organization.name);
    if (organization.seed === "b") {
      expect(body.meta.dataState).toBe("never_observed");
      await expect(page.getByText("아직 수집된 신호가 없습니다")).toBeVisible();
    } else await expect(page.getByRole("region", { name: "사용 관측 인원", exact: true })).toBeVisible();
    const refreshed = page.waitForResponse((response) => response.url().includes(`/organizations/${organization.id}/analytics/overview?`) && response.status() === 200);
    await page.reload();
    await refreshed;
    await expect(page.getByRole("navigation")).toContainText(organization.name);
    const logout = page.waitForResponse((response) => response.url().endsWith("/v1/auth/logout"));
    await page.getByRole("link", { name: "로그아웃", exact: true }).click();
    expect((await logout).status()).toBe(204);
    await expect(page).toHaveURL(/\/login$/);
    expect(await storedSession(page)).toBeNull();
    expect(errors).toEqual([]);
  });
}
test("SEED-AUTH-UNKNOWN @p0 @read 등록되지 않은 이메일은 인증하지 않는다", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("회사 이메일", { exact: true }).fill("owner@seed-a.example.test.evil.com");
  const response = page.waitForResponse((response) => response.url().endsWith("/api/dev/seed-login"));
  await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
  expect((await response).status()).toBe(400);
  await expect(page.getByText(/등록된 조직을 찾지 못했습니다/)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("SEED-AUTH-SWITCH @p0 @read A 로그아웃 후 B의 데이터와 조직명만 표시한다", async ({ page }) => {
  await signIn(page, "admin@seed-a.example.test", { ui: true });
  await page.goto("/overview");
  await expect(page.getByRole("navigation")).toContainText(organizations[0].name);
  await expect(page.getByRole("region", { name: "사용 관측 인원", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  // B에는 오너 한 명만 있다.
  await signIn(page, "owner@seed-b.example.test", { ui: true });
  await page.goto("/overview");
  await expect(page.getByRole("navigation")).toContainText(organizations[1].name);
  await expect(page.getByRole("navigation")).not.toContainText(organizations[0].name);
  await expect(page.getByText("아직 수집된 신호가 없습니다")).toBeVisible();
  await expect(page.getByLabel("조직 수집 현황", { exact: true })).toContainText("수신 대기 · 아직 수집된 데이터가 없습니다");
  await page.getByRole("link", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("SEED-AUTH-REFRESH @p1 @read 유효하지 않은 AT의 401에서 실제 RT 회전 후 개요 조회를 복구한다", async ({ page }) => {
  await signIn(page, "admin@seed-c.example.test");
  // 서버 만료 시간 시험과는 별개로, 401 복구 경로만 검증한다.
  await editStoredSession(page, { access_token: "invalid-access-token-for-401-test" });
  let refreshCount = 0;
  page.on("request", (request) => { if (request.url().endsWith("/v1/auth/refresh")) refreshCount++; });
  const refreshed = page.waitForResponse((response) => response.url().endsWith("/v1/auth/refresh"));
  await page.goto("/overview");
  expect((await refreshed).status()).toBe(200);
  await expect(page.getByRole("region", { name: "사용 관측 인원", exact: true })).toBeVisible();
  expect(refreshCount).toBe(1);
});

test("SEED-AUTH-RATE-LIMIT @p1 @read 로그인·로그아웃의 429(주입)는 대기 안내 뒤 같은 입력으로 복구한다", async ({ page, baseURL }) => {
  test.info().annotations.push({ type: ANNOTATION.intended429, description: "429 안내 시험(page.route 주입)" });
  // 429 는 page.route 로 한 번씩만 주입한다 — 실제 요청 제한 버킷을 쓰지 않는다. 나머지는 실서버로 간다.
  let logins = 0;
  await page.route("**/api/dev/seed-login", async (route) => {
    logins++;
    if (logins === 1) return route.fulfill({ status: 429, headers: { "Retry-After": "2" }, json: { error: "rate_limited", message: "로그인 요청이 많아 잠시 제한되었습니다." } });
    return route.continue();
  });
  await page.goto("/login");
  await page.getByLabel("회사 이메일", { exact: true }).fill("owner@seed-b.example.test");
  await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
  await expect(page.locator("#login-message")).toHaveText("요청이 많아 잠시 제한되었습니다. 2초 뒤에 다시 시도해 주세요.");
  await expect(page.getByRole("button", { name: /초 뒤 다시 시도$/ })).toBeDisabled();
  const submit = page.getByRole("button", { name: "회사 계정으로 계속", exact: true });
  await expect(submit).toBeEnabled({ timeout: 5_000 });
  // 두 번째 시도만 실제 로그인이다 — pacer 를 거친다.
  await paceSignIn("owner@seed-b.example.test");
  const login = page.waitForResponse((response) => response.url().endsWith("/api/dev/seed-login") && response.status() === 200);
  await submit.click();
  await login;
  expect(logins).toBe(2);
  await page.goto("/overview");
  await expect(page.getByRole("navigation")).toContainText(organizations[1].name);

  let logouts = 0;
  await page.route("**/v1/auth/logout", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    logouts++;
    if (logouts > 1) return route.continue();
    return route.fulfill({ status: 429, json: { error: "rate_limited", message: "사용자 인증 요청을 처리할 수 없습니다." },
      headers: { "Retry-After": "2", "Access-Control-Allow-Origin": new URL(baseURL!).origin, "Access-Control-Expose-Headers": "Retry-After" } });
  });
  await page.getByRole("link", { name: "로그아웃", exact: true }).click();
  await expect(page.getByRole("navigation").getByRole("alert")).toHaveText("요청이 많아 잠시 제한되었습니다. 2초 뒤에 다시 시도해 주세요.");
  expect(await storedSession(page)).not.toBeNull();
  await page.getByRole("link", { name: /^로그아웃 · \d+초 뒤$/ }).click({ force: true });
  expect(logouts).toBe(1);
  const logout = page.waitForResponse((response) => response.url().endsWith("/v1/auth/logout") && response.request().method() === "POST" && response.status() === 204);
  await page.getByRole("link", { name: "로그아웃", exact: true }).click({ timeout: 5_000 });
  await logout;
  await expect(page).toHaveURL(/\/login$/);
  expect(await storedSession(page)).toBeNull();
});

test("SEED-AUTH-RETRY-AFTER @p1 @read 실서버의 세션 요청 제한 429에서 브라우저가 Retry-After를 읽는다", async ({ page }) => {
  test.info().annotations.push({ type: ANNOTATION.intended429, description: "세션 버킷의 실제 429 시험" });
  // 세션 단위 버킷(서버 ADR 0052)만 채운다 — IP 버킷은 로그인 한 번만 쓴다. 이 세션은 한도가 찬 채로 컨텍스트와 함께 버린다.
  await signIn(page, "owner@seed-b.example.test");
  const result = await page.evaluate(async ({ origin, key }) => {
    const session = JSON.parse(sessionStorage.getItem(key)!);
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) {
      const response = await fetch(`${origin}/v1/auth/me`, { headers: { Authorization: `Bearer ${session.tokens.access_token}` } });
      statuses.push(response.status);
      if (response.status === 429) return { statuses, retryAfter: response.headers.get("Retry-After"), contentType: response.headers.get("Content-Type"), body: await response.json() };
    }
    return { statuses, retryAfter: null, contentType: null, body: null };
  }, { origin: enrollmentBase(), key: SESSION_STORAGE_KEY });
  expect(result.statuses.at(-1)).toBe(429);
  expect(result.statuses.slice(0, -1).every((status) => status === 200)).toBe(true);
  expect(result.statuses.length).toBeLessThanOrEqual(31);
  expect(result.retryAfter).toMatch(/^[1-9]\d*$/);
  expect(Number(result.retryAfter)).toBeLessThanOrEqual(60);
  expect(result.contentType?.toLowerCase()).toContain("charset=utf-8");
  expect(result.body).toEqual({ error: "rate_limited", message: "사용자 인증 요청을 처리할 수 없습니다." });
});
