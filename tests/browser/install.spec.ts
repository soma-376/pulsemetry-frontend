import { test, expect } from "./fixtures";

test("설치 링크는 세션·BFF 없이 정규화한 코드로 운영체제별 명령을 보여준다", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.port === "3110")
      apiRequests.push(request.url());
  });
  const response = await page.goto("/install?code=abcdefghjkmn");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page).toHaveURL(/\/install\?code=abcdefghjkmn$/);
  await expect(page.getByRole("banner")).toContainText(
    "초대 코드 ABCD-EFGH-JKMN",
  );

  await page.getByRole("tab", { name: /macOS/ }).click();
  await expect(page.getByLabel("터미널 설치 명령", { exact: true })).toHaveText(
    "curl -fsSL 'http://localhost:3110/unix?code=ABCD-EFGH-JKMN' | sh",
  );
  await page.getByRole("tab", { name: /Windows/ }).click();
  await expect(
    page.getByLabel("PowerShell 설치 명령", { exact: true }),
  ).toHaveText("irm 'http://localhost:3110/windows?code=ABCD-EFGH-JKMN' | iex");
  await expect(page.getByRole("link")).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

test("코드가 없거나 형식이 틀리면 명령 대신 안내만 보여준다", async ({
  page,
}) => {
  await page.goto("/install");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "설치 링크에 초대 코드가 없습니다.",
  );
  await page.goto("/install?code=ABCD-EFGH-JKMO");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "초대 코드 형식이 올바르지 않습니다.",
  );
  await expect(page.getByText("ABCD-EFGH-JKMO")).toHaveCount(0);
  await expect(page.locator("code")).toHaveCount(0);
});
