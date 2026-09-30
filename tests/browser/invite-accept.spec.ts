import { expect, test, type Page } from "@playwright/test";

type Reply = { status: number; json?: unknown; headers?: Record<string, string> };
async function mockSignup(page: Page, replies: Reply[]) {
  const cors = { "access-control-allow-origin": new URL(test.info().project.use.baseURL!).origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST,OPTIONS", "access-control-expose-headers": "Retry-After" };
  const requests: unknown[] = [];
  await page.route("**/v1/auth/signup", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    requests.push(route.request().postDataJSON());
    const reply = replies.shift() ?? { status: 201 };
    return route.fulfill({ status: reply.status, headers: { ...cors, ...reply.headers }, ...(reply.json ? { json: reply.json } : { body: "" }) });
  });
  return requests;
}

test("the invitation link fills the code from the fragment, removes it from the address and creates the account", async ({ page }) => {
  const requests = await mockSignup(page, [{ status: 409, json: { error: "signup_unavailable", message: "사용자 인증 요청을 처리할 수 없습니다." } }]);
  await page.goto("/invite#code=abcd-efgh-jkmn");
  const code = page.getByLabel("초대 코드", { exact: true });
  await expect(code).toHaveValue("ABCD-EFGH-JKMN");
  // 코드는 주소와 브라우저 기록에 남기지 않는다.
  await expect(page).toHaveURL(/\/invite$/);
  expect(await page.evaluate(() => window.location.hash)).toBe("");

  const submit = page.getByRole("button", { name: "계정 만들기", exact: true });
  await submit.click();
  await expect(page.getByLabel("회사 이메일", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("회사 이메일", { exact: true }).fill("New@Example.test");
  await page.getByLabel("비밀번호", { exact: true }).fill("short");
  await page.getByLabel("비밀번호 확인", { exact: true }).fill("short");
  await submit.click();
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveAccessibleDescription("비밀번호는 12글자 이상이어야 합니다");
  await page.getByLabel("비밀번호", { exact: true }).fill("correct-password-123");
  await submit.click();
  await expect(page.getByLabel("비밀번호 확인", { exact: true })).toHaveAccessibleDescription("비밀번호가 서로 다릅니다");
  expect(requests).toHaveLength(0);

  // 서버가 거절하면 이유와 다음 행동을 알리고 입력을 남긴다.
  await page.getByLabel("비밀번호 확인", { exact: true }).fill("correct-password-123");
  await submit.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("이 초대 코드로는 가입할 수 없습니다");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(code).toHaveValue("ABCD-EFGH-JKMN");
  // 다시 보내면 서버가 받는다. 계정은 서버가 201을 준 뒤에만 만들어졌다고 말한다.
  await submit.click();
  await expect(page.getByRole("status")).toContainText("계정을 만들었습니다");
  expect(requests).toEqual([
    { code: "ABCD-EFGH-JKMN", email: "new@example.test", password: "correct-password-123" },
    { code: "ABCD-EFGH-JKMN", email: "new@example.test", password: "correct-password-123" },
  ]);
  await expect(page.getByRole("link", { name: "로그인으로 이동", exact: true })).toHaveAttribute("href", "/login");
  // 가입 뒤에 자동으로 로그인하거나 옮겨 가지 않는다.
  await expect(page).toHaveURL(/\/invite$/);
});

test("without a usable code in the link the code is typed by hand", async ({ page }) => {
  const requests = await mockSignup(page, []);
  await page.goto("/invite#code=not-a-code");
  const code = page.getByLabel("초대 코드", { exact: true });
  await expect(code).toHaveValue("");
  expect(await page.evaluate(() => window.location.hash)).toBe("");
  await page.getByLabel("회사 이메일", { exact: true }).fill("new@example.test");
  await page.getByLabel("비밀번호", { exact: true }).fill("correct-password-123");
  await page.getByLabel("비밀번호 확인", { exact: true }).fill("correct-password-123");
  await page.getByRole("button", { name: "계정 만들기", exact: true }).click();
  await expect(code).toHaveAccessibleDescription("초대 코드는 XXXX-XXXX-XXXX 형식입니다");
  expect(requests).toHaveLength(0);
  await code.fill("abcd-efgh-jkmn");
  await page.getByRole("button", { name: "계정 만들기", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("계정을 만들었습니다");
  expect(requests).toEqual([{ code: "ABCD-EFGH-JKMN", email: "new@example.test", password: "correct-password-123" }]);
});
