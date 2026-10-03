import { test, expect } from "./fixtures";
import { expectIdentityProvider, submitIdentityProvider } from "./helpers";

for (const scenario of ["wrong-organization", "missing-cookie", "wrong-password"] as const) {
  test(`OIDC-FAILURE-${scenario} @read 실제 IdP 실패에서 서비스 토큰을 발급하지 않는다`, async ({ page }) => {
    const errorSelector = process.env.E2E_OIDC_ERROR_SELECTOR;
    if (scenario === "wrong-password" && !errorSelector) throw new Error("잘못된 비밀번호 E2E에는 E2E_OIDC_ERROR_SELECTOR가 필요합니다.");
    let exchanges = 0;
    page.on("request", r => { if (r.url().endsWith("/api/bff/auth/token") && r.method() === "POST") exchanges++; });
    await page.goto("/login");
    await page.getByLabel("회사 이메일", { exact: true }).fill("owner@seed-a.example.test");
    await page.getByRole("button", { name: "회사 계정으로 계속", exact: true }).click();
    await expectIdentityProvider(page);
    if (scenario === "missing-cookie") await page.context().clearCookies({ name: "PULSEMETRY_OIDC" });
    await submitIdentityProvider(page, scenario === "wrong-organization" ? "owner@seed-b.example.test" : "owner@seed-a.example.test", scenario === "wrong-password");
    if (scenario === "wrong-password") {
      await expect(page.locator(errorSelector!)).toBeVisible();
      await expectIdentityProvider(page);
    } else {
      await expect(page.getByRole("main").getByRole("alert")).toContainText(scenario === "wrong-organization" ? "활성 회원" : "만료");
      await expect(page).toHaveURL("http://localhost:3000/auth/callback");
      expect(await page.evaluate(() => sessionStorage.getItem("pulsemetry.oidc.pending.v1"))).toBeNull();
      expect(await page.evaluate(() => sessionStorage.getItem("pulsemetry.seed-session.v1"))).toBeNull();
    }
    expect(exchanges).toBe(0);
  });
}
