import { expect, test } from "./fixtures";
import { signIn } from "./helpers";
import { PreparationError } from "./harness";

// 새 조직(시드 D — 조직과 오너뿐, 이 시험만 바꾼다)의 첫 수집 동선: 온보딩 완료 → 빈 개요 → 초대 딥링크 → 초대 메일의 설치 명령.
// 기대값은 백엔드 명세(온보딩 §13, 초대 메일 — 설치 명령은 부트스트랩 주소의 /unix·/windows 에 코드를 붙인 것)에서 쓴다. 설치·수신은 이 시험의 범위가 아니다.
function mailApi() {
  const value = process.env.E2E_MAIL_API_URL;
  if (!value) throw new PreparationError("E2E_MAIL_API_URL에 메일 수신 컨테이너의 조회 API 주소를 설정하세요.");
  return value.replace(/\/$/, "");
}
type Mail = { ID: string; Subject: string; To: { Address: string }[] };
async function mailsTo(email: string): Promise<Mail[]> {
  const response = await fetch(`${mailApi()}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  if (!response.ok) throw new PreparationError(`메일 수신 컨테이너 조회 실패: HTTP ${response.status}`);
  return ((await response.json()).messages as Mail[]).filter((mail) => mail.To.some((to) => to.Address === email));
}
async function bodyOf(mail: Mail): Promise<string> {
  return ((await (await fetch(`${mailApi()}/api/v1/message/${mail.ID}`)).json()).Text as string).replaceAll("\r\n", "\n");
}

test("FIRST-COLLECTION-D @p0 @write 빈 조직이 온보딩을 마치면 빈 개요가 초대로 이끌고, 초대 메일에 실제 설치 명령이 오며, 다시 로그인하면 개요로 간다", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "owner@seed-d.example.test");
  await expect(page).toHaveURL(/\/onboarding$/);
  // 1. 수집 정책
  await page.getByRole("radio", { name: /^수집하지 않음/ }).check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  // 2. 벤더·계약
  await page.getByLabel("제품", { exact: true }).selectOption("claude_team");
  await page.getByLabel("플랜", { exact: true }).selectOption("team");
  await page.getByLabel("표시 이름", { exact: true }).fill("D Claude");
  await page.getByLabel("좌석 수", { exact: true }).fill("2");
  await page.getByLabel("월 단가", { exact: true }).fill("30");
  await page.getByRole("button", { name: "벤더 등록", exact: true }).click();
  await expect(page.getByRole("region", { name: "등록한 벤더" })).toContainText("D Claude");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  // 3. 팀
  await page.getByRole("textbox", { name: "팀 이름", exact: true }).fill("D 개발팀");
  await page.getByRole("button", { name: "팀 생성", exact: true }).click();
  await expect(page.getByRole("list", { name: "온보딩 팀 목록" })).toContainText("D 개발팀");
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page).toHaveURL(/\/overview(?:\?.*)?$/);

  // 빈 개요 — 초대가 주 행동이고, 지어낸 설치 명령·MDM·이미 끝낸 계약 입력을 내세우지 않는다.
  const main = page.getByRole("main");
  await expect(main.getByText("아직 수집된 신호가 없습니다")).toBeVisible();
  await expect(main.getByRole("list", { name: "첫 수집 단계" })).toContainText("초대 메일의 설치 명령");
  await expect(main).not.toContainText(/MDM|설치 명령 ·|계약 정보 먼저 입력|telemetryctl login/);
  await expect(main.getByRole("button", { name: "복사" })).toHaveCount(0);
  await expect(main.getByText(/자동 갱신이 꺼져 있습니다/)).toBeVisible();

  // 초대 딥링크 — 구성원 화면의 초대 창이 바로 열린다.
  await main.getByRole("link", { name: "구성원 초대", exact: true }).click();
  await expect(page).toHaveURL(/\/members\?invite=1(?:&.*)?$/);
  const dialog = page.getByRole("dialog", { name: "구성원 초대", exact: true });
  const email = `e2e-first-${Date.now().toString(36)}@example.test`;
  const input = dialog.getByRole("textbox", { name: "초대할 이메일" });
  await input.fill(email);
  await input.press("Enter");
  await dialog.getByRole("button", { name: "1명 초대 코드 발급", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("초대 코드 1건을 발급했습니다");
  await dialog.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page).toHaveURL(/\/members(?:\?.*)?$/);

  // 초대 메일에 그 구성원의 설치 명령이 온다(코드 값은 실패 메시지에 싣지 않는다).
  await expect.poll(async () => (await mailsTo(email)).length, { timeout: 30_000, message: "초대 메일 도착" }).toBe(1);
  const text = await bodyOf((await mailsTo(email))[0]);
  expect(text.includes("CLI 설치"), "설치 안내").toBe(true);
  expect(/macOS·Linux: curl -fsSL '[^']+\/unix\?code=[0-9A-Z-]{14}' \| sh/.test(text), "macOS·Linux 설치 명령").toBe(true);
  expect(/Windows: irm '[^']+\/windows\?code=[0-9A-Z-]{14}' \| iex/.test(text), "Windows 설치 명령").toBe(true);

  // 다시 로그인하면 온보딩이 아니라 개요다(온보딩 완료가 서버에 남았다).
  await signIn(page, "owner@seed-d.example.test");
  await expect(page).toHaveURL(/\/overview(?:\?.*)?$/);
});
