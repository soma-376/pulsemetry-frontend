import { test, expect } from "./fixtures";
test("과거 초대 링크는 비밀번호 가입 없이 SSO로 안내하고 설치 코드를 주소에서 지운다", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/auth/signup")) requests.push(request.url()); });
  await page.goto("/invite#code=ABCD-EFGH-JKMN");
  await expect(page).toHaveURL(/\/invite$/);
  await expect(page.getByRole("link", { name: "회사 계정으로 로그인", exact: true })).toHaveAttribute("href", "/login");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(requests).toEqual([]);
});
