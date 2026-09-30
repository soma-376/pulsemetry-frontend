import type { Page } from "@playwright/test";
import { expect, test, enrollmentBase } from "./fixtures";

// 로그인 전의 공개 문의 폼이다. 조직이나 계정을 만들지 않으므로 시드 조직은 그대로다.
// 서버의 출처별 요청 한도(local 프로필: 1분에 10회)보다 적게 보낸다 — 이 테스트는 세 번 보낸다.
async function inquire(page: Page, company: string, email: string) {
  await page.getByLabel("회사명", { exact: true }).fill(company);
  await page.getByLabel("회사 이메일", { exact: true }).fill(email);
  await page.getByRole("button", { name: "문의 내용 확인", exact: true }).click();
  const posted = page.waitForResponse((response) => response.request().method() === "POST" && response.url() === `${enrollmentBase()}/v1/inquiries`);
  await page.getByRole("region", { name: "문의 내용 확인", exact: true }).getByRole("button", { name: "문의 접수", exact: true }).click();
  return posted;
}

test("INQUIRY-01 @p0 @write 도입 문의를 실제로 접수하고 같은 입력의 재전송은 같은 접수 번호를 받는다", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const company = `E2E 문의 ${suffix}`, email = `e2e-inquiry-${suffix}@example.test`;
  const result = page.getByRole("region", { name: "접수 결과", exact: true });
  await page.goto("/contact");

  // 확인 단계까지는 서버로 아무것도 가지 않는다.
  let sent = 0;
  page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/v1/inquiries")) sent++; });
  await page.getByLabel("회사명", { exact: true }).fill(company);
  await page.getByLabel("회사 이메일", { exact: true }).fill(email);
  await page.getByRole("button", { name: "문의 내용 확인", exact: true }).click();
  await expect(page.getByRole("region", { name: "문의 내용 확인", exact: true })).toContainText("아직 접수되지 않았습니다");
  expect(sent).toBe(0);
  await page.getByRole("button", { name: "수정", exact: true }).click();

  const first = await inquire(page, company, email);
  expect(first.status()).toBe(201);
  expect(first.request().headers().authorization).toBeUndefined();
  expect(first.request().postDataJSON()).toEqual({ company, email });
  const receipt = await first.json();
  expect(Object.keys(receipt).sort()).toEqual(["inquiryId", "receivedAt", "status"]);
  expect(receipt.status).toBe("received");
  expect(receipt.inquiryId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  // 접수 시각은 서버가 방금 저장한 시각이다.
  expect(Math.abs(Date.now() - Date.parse(receipt.receivedAt))).toBeLessThan(60_000);
  await expect(page.getByRole("status")).toContainText("문의를 접수했습니다");
  await expect(result).toContainText(receipt.inquiryId);
  await expect(result).toContainText(company);
  await expect(result).toContainText(email);
  await expect(page).toHaveURL(/\/contact$/);

  // 같은 회사·이메일을 다시 보내면(대소문자·공백이 달라도) 새로 저장하지 않고 같은 접수를 돌려준다.
  await result.getByRole("button", { name: "새 문의 작성", exact: true }).click();
  const again = await inquire(page, `  ${company.toLowerCase()}  `, email.toUpperCase());
  expect(again.status()).toBe(201);
  expect(await again.json()).toEqual(receipt);
  await expect(result).toContainText(receipt.inquiryId);

  // 이메일이 다르면 다른 문의다.
  await result.getByRole("button", { name: "새 문의 작성", exact: true }).click();
  const other = await inquire(page, company, `other-${email}`);
  expect(other.status()).toBe(201);
  const otherReceipt = await other.json();
  expect(otherReceipt.inquiryId).not.toBe(receipt.inquiryId);
  await expect(result).toContainText(otherReceipt.inquiryId);
  await expect(result).not.toContainText(receipt.inquiryId);
  expect(sent).toBe(3);
});
