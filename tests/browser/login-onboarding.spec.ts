import { expect, test } from "@playwright/test";
import { mockSeedAuth, saveOnboardingContract, signIn } from "./helpers";

test("login distinguishes invalid email, unknown organization and SSO failures", async ({ page }) => {
  await mockSeedAuth(page);
  await page.goto("/login");
  const email = page.getByLabel("회사 이메일", { exact: true });
  const submit = page.getByRole("button", { name: "회사 계정으로 계속", exact: true });
  await submit.click();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await email.fill("a@unknown.example");
  await submit.click();
  await expect(page.getByText(/등록된 조직을 찾지 못했습니다/)).toBeVisible();
  await email.fill("admin@seed-a.example.test");
  await page.getByText("데모 시나리오", { exact: true }).click();
  for (const scenario of ["cancelled", "configuration", "denied"]) {
    await page.getByLabel("회사 로그인 결과").selectOption(scenario);
    await submit.click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("link", { name: "조직 관리자에게 문의" })).toBeVisible();
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  }
  await page.getByLabel("회사 로그인 결과").selectOption("network");
  await submit.click();
  await expect(page.getByText(/로그인 정보를 확인하지 못했습니다/)).toBeVisible();
  await page.getByLabel("회사 로그인 결과").selectOption("success");
  await email.fill("developer@codeworks.io");
  await submit.click();
  await expect(page.getByText(/등록된 조직을 찾지 못했습니다/)).toBeVisible();
});

async function vendorsStep(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await signIn(page);
  await page.getByRole("radio", { name: /^수집하지 않음/ }).check();
  const saved = page.waitForResponse(r => r.url().endsWith("/collection-policy") && r.request().method() === "PUT");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  expect((await saved).request().postDataJSON()).toEqual({ expectedVersion: 1, collectRawContent: false });
  await expect(page.getByLabel("제품", { exact: true })).toBeEnabled();
}

test("server catalog, optional contract, persisted onboarding and completed login", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await vendorsStep(page);
  const product = page.getByLabel("제품", { exact: true });
  await expect(product.locator("option")).toHaveCount(4);
  await product.selectOption("server_only");
  const created = page.waitForResponse(r => r.url().endsWith("/vendors") && r.request().method() === "POST");
  await page.getByRole("button", { name: "벤더 등록", exact: true }).click();
  const request = (await created).request();
  expect(request.postDataJSON()).toEqual({ kind: "server_only", displayName: "서버 전용 제품" });
  expect(request.headers()["idempotency-key"]).toBeTruthy();
  await expect(page.getByRole("region", { name: "등록한 벤더" })).toContainText("서버 전용 제품");
  await page.reload();
  await expect(page.getByRole("heading", { name: "현재 팀 · 1개" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "초대할 이메일" })).toBeDisabled();
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(page.getByRole("region", { name: "등록한 벤더" })).toContainText("서버 전용 제품");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "건너뛰고 시작", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.getByRole("link", { name: "로그아웃", exact: true }).click();
  await signIn(page);
  await expect(page).toHaveURL(/\/overview$/);
  expect(errors).toEqual([]);
});

test("vendor change clears old plan and contract amounts, contract keeps zero fee and decimal strings", async ({ page }) => {
  await vendorsStep(page);
  await page.getByLabel("제품", { exact: true }).selectOption("claude_team");
  await page.getByLabel("플랜", { exact: true }).selectOption("team");
  await page.getByLabel("좌석 수", { exact: true }).fill("2");
  await page.getByLabel("월 단가", { exact: true }).fill("12.123456789012");
  await page.getByLabel("제품", { exact: true }).selectOption("copilot");
  await expect(page.getByLabel("플랜", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("좌석 수", { exact: true })).toHaveCount(0);
  await page.getByLabel("플랜", { exact: true }).selectOption("copilot_business");
  await expect(page.getByLabel("좌석 수", { exact: true })).toHaveValue("");
  await page.getByLabel("좌석 수", { exact: true }).fill("2.5");
  await page.getByLabel("월 단가", { exact: true }).fill("0");
  await expect(page.getByRole("button", { name: "벤더 등록", exact: true })).toBeDisabled();
  await page.getByLabel("좌석 수", { exact: true }).fill("2");
  const request = page.waitForRequest(r => r.url().endsWith("/vendors") && r.method() === "POST");
  await page.getByRole("button", { name: "벤더 등록", exact: true }).click();
  const body = (await request).postDataJSON();
  expect(body.contract).toMatchObject({ planId: "copilot_business", effectiveTo: null, tiers: [{ label: "Team", seats: 2, monthlyFeePerSeatUsd: "0" }] });
  expect(body.contract.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("deletion sends version and prevents next step; refresh resumes saved policy", async ({ page }) => {
  await vendorsStep(page);
  await saveOnboardingContract(page, "삭제 대상");
  const request = page.waitForRequest(r => r.method() === "DELETE" && r.url().includes("/vendors/"));
  await page.getByRole("button", { name: "삭제 대상 벤더 삭제", exact: true }).click();
  expect((await request).headers()["if-match"]).toBe('"vendor-1"');
  await expect(page.getByRole("button", { name: "다음", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("제품", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(page.getByRole("radio", { name: /^수집하지 않음/ })).toBeChecked();
});

test("team create/delete uses server IDs and versions; invite API is not called", async ({ page }) => {
  const invitations: string[] = [];
  page.on("request", r => { if (r.url().includes("/invitations")) invitations.push(r.url()); });
  await vendorsStep(page);
  await saveOnboardingContract(page);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("list", { name: "온보딩 팀 목록" })).toContainText("서버 팀");
  await page.getByLabel("팀 이름", { exact: true }).fill("새 프로젝트");
  await page.getByRole("button", { name: "팀 생성", exact: true }).click();
  await expect(page.getByRole("list", { name: "온보딩 팀 목록" })).toContainText("새 프로젝트");
  const request = page.waitForRequest(r => r.method() === "DELETE" && r.url().includes("/teams/"));
  await page.getByRole("button", { name: "서버 팀 팀 제거", exact: true }).click();
  expect((await request).headers()["if-match"]).toBe('"team-7"');
  await expect(page.getByRole("list", { name: "온보딩 팀 목록" })).not.toContainText("서버 팀");
  await expect(page.getByRole("button", { name: "초대 메일 발송", exact: true })).toBeDisabled();
  expect(invitations).toEqual([]);
});

test("503 retries keep idempotency key and policy version conflict requires explicit retry", async ({ page }) => {
  await vendorsStep(page);
  const keys: string[] = [];
  await page.route("**/api/v1/organizations/*/vendors", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length > 1) return route.fallback();
    return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "http://localhost:3000", "retry-after": "1" }, json: { error: { code: "unavailable", message: "retry" } } });
  });
  await saveOnboardingContract(page);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.getByRole("button", { name: "이전", exact: true }).click();
  let writes = 0;
  await page.route("**/collection-policy", route => {
    if (route.request().method() !== "PUT") return route.fallback();
    writes++;
    return route.fulfill({ status: 409, headers: { "access-control-allow-origin": "http://localhost:3000" }, json: { error: { code: "version_conflict", message: "conflict" } } });
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "다른 곳에서 변경" })).toBeVisible();
  expect(writes).toBe(1);
  await expect(page.getByRole("radio", { name: /^수집하지 않음/ })).toBeChecked();
});

test("mobile preserves original layout and catalog failure has no hardcoded fallback", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await vendorsStep(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/onboarding-server-mobile.png", fullPage: true });
  await saveOnboardingContract(page);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("catalog failure blocks select instead of using local mock options", async ({ page }) => {
  await mockSeedAuth(page);
  await page.route("**/api/v1/vendor-catalog?*", route => route.fulfill({ status: 403, headers: { "access-control-allow-origin": "http://localhost:3000" }, json: { error: { code: "forbidden", message: "denied" } } }));
  await page.goto("/login");
  await signIn(page);
  await page.getByRole("radio", { name: /^수집하지 않음/ }).check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "관리자 권한" })).toBeVisible();
  await expect(page.getByLabel("제품", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("제품", { exact: true }).locator("option")).toHaveCount(1);
});
