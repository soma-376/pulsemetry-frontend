import type { Page } from "@playwright/test";
import { expect, test, enrollmentBase, seedOrganizations } from "./fixtures";
import { authenticatedRequest, signIn } from "./helpers";
import { PreparationError } from "./harness";

// 초대 → 서버의 발송 작업 → SMTP → 메일 수신 컨테이너까지의 실제 경로를 본다.
// 받은 메일은 수신 컨테이너의 조회 API로 확인한다. 밖으로 나가는 메일은 없다.
const org = seedOrganizations[0];
const O = `/api/v1/organizations/${org.id}`;
const CODE_LINE = /초대 코드: ([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})/;

function mailApi() {
  const value = process.env.E2E_MAIL_API_URL;
  if (!value) throw new PreparationError("E2E_MAIL_API_URL에 메일 수신 컨테이너의 조회 API 주소(예: http://127.0.0.1:8025)를 설정하세요. 백엔드의 Compose가 컨테이너를 띄웁니다.");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new PreparationError("메일 수신 컨테이너는 로컬 주소여야 합니다.");
  return value.replace(/\/$/, "");
}
type Mail = { ID: string; Subject: string; To: { Address: string }[] };
async function mailsTo(email: string): Promise<Mail[]> {
  const response = await fetch(`${mailApi()}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  if (!response.ok) throw new PreparationError(`메일 수신 컨테이너 조회 실패: HTTP ${response.status}`);
  // 최신 메일이 먼저 온다. 도착 순서로 돌려준다.
  return ((await response.json()).messages as Mail[]).filter((mail) => mail.To.some((to) => to.Address === email)).reverse();
}
async function bodyOf(mail: Mail): Promise<string> {
  const response = await fetch(`${mailApi()}/api/v1/message/${mail.ID}`);
  return ((await response.json()).Text as string).replaceAll("\r\n", "\n");
}
/** 코드 값을 실패 메시지에 싣지 않도록 본문에서 꺼내 참·거짓으로만 단언한다. */
const codeIn = (text: string) => CODE_LINE.exec(text)?.[1] ?? "";

async function waiting(page: Page, email: string) {
  const response = await authenticatedRequest(page, enrollmentBase(), `${O}/invitations?limit=100&status=pending&memberStatus=invited`);
  return (response.body.items as { invitationId: string; email: string; delivery: { status: string } }[]).filter((item) => item.email === email);
}

test("INVITE-MAIL-01 @p0 @write 초대 메일이 실제로 도착하고, 발송 상태가 목록에 반영되고, 다시 보내면 옛 코드는 쓸 수 없다", async ({ page, context }) => {
  const email = `e2e-mail-${Date.now().toString(36)}@example.test`;
  const base = new URL(test.info().project.use.baseURL!).origin;
  await signIn(page, "owner@seed-a.example.test");
  await page.goto("/members");
  const pending = page.getByRole("region", { name: "초대 대기", exact: true });
  const state = pending.getByLabel(`${email} 메일 발송 상태`, { exact: true });
  await expect(page.getByRole("region", { name: "구성원 목록", exact: true })).toBeVisible();
  try {
    expect(await mailsTo(email)).toHaveLength(0);
    // 초대 — 발급 직후에는 발송 대기다. 발송됨이라고 말하지 않는다.
    await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "구성원 초대", exact: true });
    const input = dialog.getByRole("textbox", { name: "초대할 이메일" });
    await input.fill(email);
    await input.press("Enter");
    await dialog.getByRole("button", { name: "1명 초대 코드 발급", exact: true }).click();
    const result = dialog.getByRole("status");
    await expect(result).toContainText("초대 코드 1건을 발급했습니다");
    await expect(result).toContainText("초대 메일을 발송 대기열에 넣었습니다");
    await expect(result).toContainText("메일 발송 대기");
    await expect(dialog).not.toContainText(/발송됨|발송 완료|보냈습니다/);
    const issuedCode = await result.getByLabel(`${email} 초대 코드`, { exact: true }).innerText();
    await dialog.getByRole("button", { name: "완료", exact: true }).click();

    // 서버의 발송 작업이 보낸 메일이 수신 컨테이너에 도착한다.
    await expect.poll(async () => (await mailsTo(email)).length, { timeout: 30_000, message: "초대 메일 도착" }).toBe(1);
    const [firstMail] = await mailsTo(email);
    expect(firstMail.Subject).toBe("Pulsemetry 초대 코드");
    const firstText = await bodyOf(firstMail);
    const firstCode = codeIn(firstText);
    expect(firstCode === issuedCode, "메일의 코드는 발급 결과의 코드다").toBe(true);
    expect(firstText.includes(org.name), "조직 이름").toBe(true);
    // 수락 링크는 코드를 fragment로 싣고, 설치 명령은 서버의 부트스트랩 주소다.
    expect(firstText.includes(`${base}/invite#code=${firstCode}`), "수락 링크").toBe(true);
    expect(firstText.includes(`${base}/invite?code=`), "코드를 쿼리에 싣지 않는다").toBe(false);
    expect(firstText.includes(`curl -fsSL '${enrollmentBase()}/unix?code=${firstCode}' | sh`), "설치 명령").toBe(true);
    expect(firstMail.Subject.includes(firstCode), "제목에는 코드가 없다").toBe(false);

    // 목록이 스스로 발송됨으로 바뀐다.
    await expect(state).toContainText("메일 발송됨", { timeout: 20_000 });
    expect((await waiting(page, email)).map((item) => item.delivery.status)).toEqual(["sent"]);

    // 다시 보내기 — 먼저 옛 링크가 무효가 됨을 알리고, 확인하면 새 코드의 두 번째 메일이 도착한다.
    await pending.getByRole("button", { name: `${email} 초대 다시 보내기`, exact: true }).click();
    await expect(pending.getByRole("alert")).toContainText("새 코드를 발급하고 초대 메일을 다시 보냅니다. 이전 메일의 코드와 링크는 더 이상 쓸 수 없습니다.");
    expect(await mailsTo(email)).toHaveLength(1);
    await pending.getByRole("button", { name: "다시 보내기 확인", exact: true }).click();
    await expect(pending.getByRole("status")).toContainText("새 코드의 초대 메일을 발송 대기열에 넣었습니다");
    await expect.poll(async () => (await mailsTo(email)).length, { timeout: 30_000, message: "두 번째 초대 메일 도착" }).toBe(2);
    const secondCode = codeIn(await bodyOf((await mailsTo(email))[1]));
    expect(secondCode.length > 0 && secondCode !== firstCode, "두 번째 메일은 새 코드다").toBe(true);
    await expect(state).toContainText("메일 발송됨", { timeout: 20_000 });
    expect(await waiting(page, email)).toHaveLength(1);

    // 첫 메일의 링크를 연다 — 코드가 채워지고 주소에서는 지워지지만, 폐기된 코드라 서버가 가입을 거절한다.
    const accept = await context.newPage();
    await accept.goto(`${base}/invite#code=${firstCode}`);
    const code = accept.getByLabel("초대 코드", { exact: true });
    await expect(code).not.toHaveValue("");
    expect((await code.inputValue()) === firstCode, "링크의 코드가 채워진다").toBe(true);
    await expect(accept).toHaveURL(`${base}/invite`);
    await accept.getByLabel("회사 이메일", { exact: true }).fill(email);
    await accept.getByLabel("비밀번호", { exact: true }).fill("e2e-password-123");
    await accept.getByLabel("비밀번호 확인", { exact: true }).fill("e2e-password-123");
    const refused = accept.waitForResponse((response) => response.request().method() === "POST" && response.url() === `${enrollmentBase()}/v1/auth/signup`);
    await accept.getByRole("button", { name: "계정 만들기", exact: true }).click();
    expect((await refused).status()).toBe(409);
    await expect(accept.getByRole("main").getByRole("alert")).toContainText("이 초대 코드로는 가입할 수 없습니다");
    await expect(accept.getByRole("status")).toHaveCount(0);
    // 코드가 보이는 화면을 실패 기록에 남기지 않는다.
    await accept.close();
  } finally {
    await page.reload();
    for (const item of await waiting(page, email)) {
      await authenticatedRequest(page, enrollmentBase(), `${O}/invitations/${item.invitationId}/revoke`, "POST", {}, { "Idempotency-Key": crypto.randomUUID() });
    }
  }
  expect(await waiting(page, email)).toHaveLength(0);
});
