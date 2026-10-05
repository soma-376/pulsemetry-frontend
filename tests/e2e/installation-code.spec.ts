import { expect, test, dashboardBase, enrollmentBase, seedOrganizations } from "./fixtures";
import { authenticatedRequest, paceSignIn, seedPeriod, signIn } from "./helpers";
import { PreparationError } from "./harness";

// 활성 구성원의 설치 코드(서버 ADR 0055) — 화면 발급 → 서버의 발송 작업 → SMTP → 메일 수신 컨테이너, 가입 거절, 새로고침 뒤의 상태.
// 설치(enroll) 자체는 원격 telemetryctl 하네스(TestVfixRemoteInstallationCode)가 fresh 조직에서 본다 — 시드 A 의 설치 수를 바꾸지 않는다.
const org = seedOrganizations[0];
const O = `/api/v1/organizations/${org.id}`;
const CODE_LINE = /설치 코드: ([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})/;

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
type Listed = { invitationId: string; memberId: string; createdAt: string; signupUsedAt: string | null; installationUsedAt: string | null; delivery: { status: string } };

test("INSTALL-CODE-A @p1 @write 활성 구성원에게 설치 코드를 내면 설치 경로만 담은 메일이 도착하고, 그 코드로는 가입할 수 없으며, 새로고침 뒤에도 발급·발송 상태가 남는다", async ({ page }) => {
  test.setTimeout(120_000);
  const { start, end } = seedPeriod();
  await signIn(page, `owner@seed-${org.seed}.example.test`);
  const roster = await authenticatedRequest(page, dashboardBase(), `${O}/members?startDate=${start}&endDate=${end}&timeZone=Asia/Seoul&limit=100`);
  const target = (roster.body.members.items as { memberId: string; account: string; role: string; status: string }[])
    .find((member) => member.status === "active" && member.role === "member");
  if (!target) throw new PreparationError("시드 A 에 활성 구성원(역할 member)이 없습니다 — 시드를 초기화하세요.");
  const earlier = (await mailsTo(target.account)).length;

  const openDetail = async () => {
    const members = page.getByRole("region", { name: "구성원 목록", exact: true });
    await members.getByRole("textbox", { name: "구성원 검색" }).fill(target.account);
    await members.getByRole("button", { name: `${target.account} 구성원 상세`, exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "구성원 상세", exact: true });
    await drawer.getByRole("button", { name: "설치 코드", exact: true }).click();
    return drawer.getByRole("region", { name: "설치 코드", exact: true });
  };
  await page.goto("/members");
  let panel = await openDetail();
  const waitingOf = () => panel.getByRole("status", { name: `${target.account} 쓰지 않은 설치 코드`, exact: true });
  await expect(waitingOf()).not.toContainText("확인하는 중");
  await panel.getByRole("button", { name: `${target.account} 설치 코드 발급`, exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("이전에 발급한 설치 코드는 더 이상 쓸 수 없습니다");
  await panel.getByRole("button", { name: "발급 확인", exact: true }).click();
  const result = panel.getByRole("status", { name: `${target.account} 설치 코드 발급 결과`, exact: true });
  await expect(result).toContainText("설치 코드를 발급했습니다");
  await expect(result).toContainText("계정 만들기 링크는 없습니다");
  const issuedCode = await result.getByLabel(`${target.account} 설치 코드`, { exact: true }).innerText();

  // 서버의 발송 작업이 보낸 메일이 수신 컨테이너에 도착한다. 설치 경로만 있고 계정 만들기 링크는 없다.
  await expect.poll(async () => (await mailsTo(target.account)).length, { timeout: 30_000, message: "설치 코드 메일 도착" }).toBe(earlier + 1);
  const mail = (await mailsTo(target.account)).at(-1)!;
  expect(mail.Subject).toBe("Pulsemetry 설치 코드");
  const text = await bodyOf(mail);
  const mailedCode = CODE_LINE.exec(text)?.[1] ?? "";
  // 코드 값을 실패 메시지에 싣지 않도록 참·거짓으로만 단언한다.
  expect(mailedCode === issuedCode, "메일의 코드는 발급 결과의 코드다").toBe(true);
  expect(text.includes(org.name), "조직 이름").toBe(true);
  expect(text.includes(`curl -fsSL '${enrollmentBase()}/unix?code=${mailedCode}' | sh`), "설치 명령").toBe(true);
  expect(text.includes("#code="), "계정 만들기 링크가 없다").toBe(false);
  expect(mail.Subject.includes(mailedCode), "제목에는 코드가 없다").toBe(false);
  // 발송 상태는 서버의 초대 목록 값으로 스스로 바뀐다.
  await expect(waitingOf().getByLabel(`${target.account} 설치 코드 메일 발송 상태`, { exact: true })).toContainText("메일 발송됨", { timeout: 20_000 });

  // 서버: 이 구성원의 새 초대는 설치만 남았고 가입은 발급 때 닫혔다(가입 소비 시각 = 발급 시각).
  const listed = await authenticatedRequest(page, enrollmentBase(), `${O}/invitations?limit=100&status=pending&memberStatus=active`);
  const installOnly = (listed.body.items as Listed[]).filter((item) => item.memberId === target.memberId && !item.installationUsedAt && item.signupUsedAt === item.createdAt);
  expect(installOnly).toHaveLength(1);
  expect(installOnly[0].delivery.status).toBe("sent");

  // 새로고침 뒤에도 쓰지 않은 설치 코드의 발급·발송 상태가 남는다. 코드 원문은 다시 보이지 않는다.
  await page.reload();
  panel = await openDetail();
  await expect(waitingOf()).toContainText("발급 ·");
  await expect(waitingOf().getByLabel(`${target.account} 설치 코드 메일 발송 상태`, { exact: true })).toContainText("메일 발송됨");
  await expect(panel.getByRole("status", { name: `${target.account} 설치 코드 발급 결과`, exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: `${target.account} 설치 코드 발급`, exact: true })).toHaveText("새 설치 코드 발급");

  // 폐기한 비밀번호 가입 API는 설치 코드 여부와 무관하게 410이다.
  await paceSignIn(target.account);
  const refused = await fetch(`${enrollmentBase()}/v1/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: issuedCode, email: target.account, password: "retired-password-flow" }) });
  expect(refused.status).toBe(410);
});
