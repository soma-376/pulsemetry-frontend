import { expect, test, type Page } from "@playwright/test";

const receipt = { inquiryId: "0b7a3c2e-0000-4000-8000-000000000001", status: "received", receivedAt: "2026-09-30T13:43:38Z" };
type Reply = { status: number; json?: unknown; headers?: Record<string, string>; abort?: boolean };

/** 문의 접수 경로만 흉내 낸다. 응답을 붙잡아 두면 접수 중 상태를 볼 수 있다. */
async function mockInquiries(page: Page, replies: Reply[]) {
  const cors = { "access-control-allow-origin": new URL(test.info().project.use.baseURL!).origin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST,OPTIONS", "access-control-expose-headers": "Retry-After" };
  const state = { requests: [] as { body: unknown; authorization: string | undefined }[], release: () => {}, hold: false };
  await page.route("**/v1/inquiries", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    state.requests.push({ body: request.postDataJSON(), authorization: request.headers().authorization });
    if (state.hold) await new Promise<void>((resolve) => { state.release = resolve; });
    const reply = replies.shift() ?? { status: 201, json: receipt };
    if (reply.abort) return route.abort("connectionrefused");
    return route.fulfill({ status: reply.status, headers: { ...cors, ...reply.headers }, json: reply.json });
  });
  return state;
}

test("confirming sends nothing, and the receipt appears only after the server accepts the inquiry", async ({ page }) => {
  const api = await mockInquiries(page, []);
  await page.goto("/contact");
  const company = page.getByLabel("회사명", { exact: true }), email = page.getByLabel("회사 이메일", { exact: true });
  await page.getByRole("button", { name: "문의 내용 확인", exact: true }).click();
  await expect(company).toHaveAttribute("aria-invalid", "true");
  await expect(company).toHaveAccessibleDescription("회사명을 입력하세요");
  await expect(email).toHaveAttribute("aria-invalid", "true");

  await company.fill("코드웍스");
  await email.fill(" Lead@Example.test ");
  await page.getByRole("button", { name: "문의 내용 확인", exact: true }).click();
  const confirm = page.getByRole("region", { name: "문의 내용 확인", exact: true });
  await expect(confirm).toContainText("아직 접수되지 않았습니다");
  await expect(confirm).toContainText("코드웍스");
  await expect(confirm).toContainText("lead@example.test");
  await expect(page.getByRole("status")).toHaveCount(0);
  // 확인은 접수가 아니다 — 서버로 아무것도 보내지 않았다.
  expect(api.requests).toHaveLength(0);

  // 수정으로 돌아가도 입력이 남아 있다.
  await confirm.getByRole("button", { name: "수정", exact: true }).click();
  await expect(company).toHaveValue("코드웍스");
  // 이메일 입력은 브라우저가 앞뒤 공백만 뗀다. 소문자 정규화는 확인·전송 값에만 한다.
  await expect(email).toHaveValue("Lead@Example.test");
  await company.fill("코드웍스 주식회사");
  await page.getByRole("button", { name: "문의 내용 확인", exact: true }).click();

  // 서버가 답하기 전에는 접수 완료를 보여 주지 않고, 다시 누를 수 없다.
  api.hold = true;
  await confirm.getByRole("button", { name: "문의 접수", exact: true }).click();
  const pending = confirm.getByRole("button", { name: "접수 중…", exact: true });
  await expect(pending).toBeDisabled();
  await expect(confirm.getByRole("button", { name: "수정", exact: true })).toBeDisabled();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByText("접수 번호")).toHaveCount(0);
  await expect.poll(() => api.requests.length).toBe(1);
  api.hold = false;
  api.release();

  const result = page.getByRole("region", { name: "접수 결과", exact: true });
  await expect(page.getByRole("status")).toContainText("문의를 접수했습니다");
  await expect(result).toContainText(receipt.inquiryId);
  // 접수 시각은 서버가 준 값을 서울 시간으로 보여 준다.
  await expect(result).toContainText("2026.09.30 22:43");
  await expect(result).toContainText("코드웍스 주식회사");
  expect(api.requests).toEqual([{ body: { company: "코드웍스 주식회사", email: "lead@example.test" }, authorization: undefined }]);
  await expect(page.getByText(/데모에서는 문의가 접수되지 않습니다/)).toHaveCount(0);
  await expect(result.getByRole("button", { name: "문의 접수", exact: true })).toHaveCount(0);
  // 접수 뒤에 로그인이나 온보딩으로 옮겨 가지 않는다.
  await expect(page).toHaveURL(/\/contact$/);

  await result.getByRole("button", { name: "새 문의 작성", exact: true }).click();
  await expect(company).toHaveValue("");
  await expect(email).toHaveValue("");
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(api.requests).toHaveLength(1);
});

test("a refused or failed submission explains why, keeps the input and can be retried", async ({ page }) => {
  const api = await mockInquiries(page, [
    { status: 429, json: { error: "rate_limited", message: "문의 요청이 너무 많습니다. 잠시 후 다시 시도하세요." }, headers: { "Retry-After": "42" } },
    { status: 503, json: { error: "inquiry_unavailable", message: "문의를 접수하지 못했습니다. 잠시 후 다시 시도하세요." }, headers: { "Retry-After": "1" } },
    { status: 0, abort: true },
    { status: 400, json: { error: "invalid_request", message: "회사 이메일 형식을 확인하세요." } },
  ]);
  await page.goto("/contact");
  await page.getByLabel("회사명", { exact: true }).fill("코드웍스");
  await page.getByLabel("회사 이메일", { exact: true }).fill("lead@example.test");
  await page.getByRole("button", { name: "문의 내용 확인", exact: true }).click();
  const confirm = page.getByRole("region", { name: "문의 내용 확인", exact: true });
  const submit = confirm.getByRole("button", { name: "문의 접수", exact: true });
  for (const message of [/42초 뒤에 다시 시도해 주세요/, /문의를 접수하지 못했습니다/, /서버에 연결하지 못했습니다/, /회사 이메일 형식을 확인하세요/]) {
    await submit.click();
    await expect(confirm.getByRole("alert")).toContainText(message);
    // 실패는 접수가 아니다. 입력은 그대로 남고 다시 보낼 수 있다.
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(confirm).toContainText("lead@example.test");
    await expect(submit).toBeEnabled();
  }
  expect(api.requests).toHaveLength(4);
  // 입력을 고치러 돌아가면 오류 안내는 사라지고 값은 남는다.
  await confirm.getByRole("button", { name: "수정", exact: true }).click();
  // 본문 안만 본다 — Next의 경로 안내 요소도 alert 역할이다.
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("회사 이메일", { exact: true })).toHaveValue("lead@example.test");
  await page.getByRole("button", { name: "문의 내용 확인", exact: true }).click();
  await submit.click();
  await expect(page.getByRole("status")).toContainText("문의를 접수했습니다");
  await expect(page.getByRole("region", { name: "접수 결과", exact: true })).toContainText(receipt.inquiryId);
  expect(api.requests).toHaveLength(5);
});
