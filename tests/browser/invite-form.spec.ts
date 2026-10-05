import { mockMembers, type MembersFixture } from "./members-fixture";
import { serveSettings } from "./onboarding-fixture";
import { openDashboard } from "./helpers";
import { expect, test, type Locator } from "./fixtures";

async function addEmail(dialog: Locator, email: string, key = "Enter") {
  const input = dialog.getByRole("textbox", { name: "초대할 이메일" });
  await input.fill(email);
  await input.press(key);
  await expect(input).toHaveValue("");
}
const batches = (api: MembersFixture) => api.commands.filter((command) => command.path === "invitations/batch");
const issue = (dialog: Locator, count: number) => dialog.getByRole("button", { name: `${count}명 초대 코드 발급`, exact: true });

let api: MembersFixture;
test.beforeEach(async ({ page }) => {
  serveSettings(page);
  api = await mockMembers(page);
  await openDashboard(page, "/members");
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "구성원 초대" })).toBeVisible();
});

test("validates email, rejects duplicates and prevents silently dropping a draft", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  const input = dialog.getByRole("textbox", { name: "초대할 이메일" });
  await expect(dialog.getByRole("button", { name: "초대 코드 발급", exact: true })).toBeDisabled();
  await input.fill("invalid");
  await input.press("Enter");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAccessibleDescription("이메일 형식이 아닙니다");

  await addEmail(dialog, "  first@example.test  ");
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await input.fill("first@example.test");
  await input.press(",");
  await expect(input).toHaveAccessibleDescription("이미 추가한 이메일입니다");
  await expect(dialog.getByRole("button", { name: "first@example.test 제거" })).toHaveCount(1);

  await input.fill("broken@");
  await issue(dialog, 1).click();
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("status")).toHaveCount(0);

  await input.fill("second@example.test");
  await issue(dialog, 1).click();
  await expect(input).toHaveAccessibleDescription("Enter 또는 쉼표로 이메일을 추가한 뒤 초대하세요");
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("status")).toHaveCount(0);
  // 검증을 통과하기 전에는 서버에 아무것도 보내지 않는다.
  expect(batches(api)).toHaveLength(0);
  await input.press(",");
  await expect(input).toHaveValue("");
  await issue(dialog, 2).click();

  // 결과는 서버가 발급을 확정한 것만 보여 준다. 코드는 발급된 항목마다 하나다.
  const result = dialog.getByRole("status");
  await expect(result).toContainText("초대 코드 2건을 발급했습니다");
  await expect(result.getByLabel("first@example.test 초대 코드", { exact: true })).toHaveText("FAKE-CODE-0001");
  await expect(result.getByLabel("second@example.test 초대 코드", { exact: true })).toHaveText("FAKE-CODE-0002");
  await expect(dialog).not.toContainText(/발송 완료|발송했습니다|보냈습니다/);
  expect(batches(api)).toHaveLength(1);
  expect(batches(api)[0].idempotencyKey).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  expect(batches(api)[0].body).toEqual({ invitations: [{ email: "first@example.test", teamId: null, role: "member" }, { email: "second@example.test", teamId: null, role: "member" }] });
  await expect(page.getByRole("region", { name: "초대 대기", exact: true })).toContainText("second@example.test");

  // 이미 초대한 사람과 이미 구성원인 사람은 발급하지 않고 이유를 보여 준다.
  await addEmail(dialog, "first@example.test");
  await addEmail(dialog, api.members[0].account);
  await issue(dialog, 2).click();
  await expect(result).toContainText("발급한 초대 코드가 없습니다 · 발급하지 않음 2건");
  await expect(result).toContainText("이미 초대한 이메일입니다");
  await expect(result).toContainText("이미 구성원입니다");
  await expect(result.locator("code")).toHaveCount(0);
});

test("inherits defaults, preserves explicit assignments and resets after submission", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  const team = dialog.getByRole("combobox", { name: "팀", exact: true });
  const role = dialog.getByRole("combobox", { name: "역할", exact: true });
  // 지정할 수 있는 역할은 서버의 두 가지뿐이다.
  await expect(role.getByRole("option")).toHaveText(["구성원", "관리자"]);
  // 역할 설명은 서버 인가와 같다 — 구성원은 대시보드에 접근하지 않는다(읽기 전용 역할은 없다).
  await expect(dialog).toContainText("구성원은 웹 대시보드에 접근하지 않습니다. CLI를 설치해 자기 사용량을 수집하는 대상입니다");
  await expect(dialog).not.toContainText("조회만");
  await role.selectOption("admin");
  await expect(dialog).toContainText("관리자는 웹 대시보드를 보고 계약·수집 정책·팀·구성원을 변경합니다");
  await role.selectOption("member");
  await team.selectOption({ label: "플랫폼" });
  await addEmail(dialog, "first@example.test");
  await addEmail(dialog, "second@example.test", ",");
  await expect(dialog.getByLabel("first@example.test 팀", { exact: true })).toHaveValue("team-platform");
  await dialog.getByLabel("first@example.test 팀", { exact: true }).selectOption("");
  await dialog.getByLabel("first@example.test 역할", { exact: true }).selectOption("admin");
  await team.selectOption({ label: "데이터" });
  await role.selectOption("admin");
  await expect(dialog.getByLabel("first@example.test 팀", { exact: true })).toHaveValue("");
  await expect(dialog.getByLabel("first@example.test 역할", { exact: true })).toHaveValue("admin");
  await expect(dialog.getByLabel("second@example.test 팀", { exact: true })).toHaveValue("team-data");
  await expect(dialog.getByLabel("second@example.test 역할", { exact: true })).toHaveValue("admin");
  await role.selectOption("member");
  await expect(dialog.getByLabel("first@example.test 역할", { exact: true })).toHaveValue("admin");
  await expect(dialog.getByLabel("second@example.test 역할", { exact: true })).toHaveValue("member");

  await issue(dialog, 2).click();
  const result = dialog.getByRole("status");
  await expect(result).toContainText("초대 코드 2건을 발급했습니다");
  expect(batches(api)[0].body).toEqual({ invitations: [{ email: "first@example.test", teamId: null, role: "admin" }, { email: "second@example.test", teamId: "team-data", role: "member" }] });
  await expect(dialog.getByRole("textbox")).toHaveValue("");
  await expect(dialog.getByRole("textbox")).toHaveAttribute("aria-invalid", "false");
  await expect(dialog.getByRole("button", { name: "초대 코드 발급", exact: true })).toBeDisabled();
  await expect(team).toHaveValue("team-data");
  await expect(role).toHaveValue("member");
  const pending = page.getByRole("region", { name: "초대 대기", exact: true });
  await expect(pending).toContainText("팀 미배정 · 관리자");
  await expect(pending).toContainText("데이터 · 구성원");

  await addEmail(dialog, "third@example.test");
  await expect(result).toHaveCount(0);
  await issue(dialog, 1).click();
  await expect(result).toContainText("초대 코드 1건을 발급했습니다");
  expect(batches(api)[1].body).toEqual({ invitations: [{ email: "third@example.test", teamId: "team-data", role: "member" }] });
  // 새 동작은 새 멱등 키를 쓴다.
  expect(batches(api)[1].idempotencyKey).not.toBe(batches(api)[0].idempotencyKey);
});

test("removing and re-adding a recipient clears only their overrides", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  await addEmail(dialog, "first@example.test");
  await addEmail(dialog, "second@example.test");
  await dialog.getByLabel("first@example.test 팀", { exact: true }).selectOption({ label: "제품" });
  await dialog.getByLabel("first@example.test 역할", { exact: true }).selectOption("admin");
  await dialog.getByLabel("second@example.test 팀", { exact: true }).selectOption({ label: "데이터" });
  await dialog.getByLabel("second@example.test 역할", { exact: true }).selectOption("admin");
  await dialog.getByRole("button", { name: "first@example.test 제거" }).last().click();
  await expect(dialog.getByLabel("second@example.test 팀", { exact: true })).toHaveCount(0);
  await addEmail(dialog, "first@example.test");
  await expect(dialog.getByLabel("first@example.test 팀", { exact: true })).toHaveValue("");
  await expect(dialog.getByLabel("first@example.test 역할", { exact: true })).toHaveValue("member");
  await expect(dialog.getByLabel("second@example.test 팀", { exact: true })).toHaveValue("team-data");
  await expect(dialog.getByLabel("second@example.test 역할", { exact: true })).toHaveValue("admin");
  await dialog.getByRole("button", { name: "first@example.test 제거" }).first().click();
  await issue(dialog, 1).click();
  await expect(dialog.getByRole("status")).toContainText("초대 코드 1건을 발급했습니다");
  expect(batches(api)[0].body).toEqual({ invitations: [{ email: "second@example.test", teamId: "team-data", role: "admin" }] });
});

test("closing and reopening preserves entered values but never the issued codes", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  await addEmail(dialog, "first@example.test");
  await addEmail(dialog, "second@example.test");
  await dialog.getByLabel("first@example.test 팀", { exact: true }).selectOption({ label: "제품" });
  await dialog.getByRole("textbox").fill("draft@example.test");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  await expect(dialog.getByRole("textbox")).toHaveValue("draft@example.test");
  await expect(dialog.getByLabel("first@example.test 팀", { exact: true })).toHaveValue("team-product");
  await dialog.getByRole("textbox").press("Enter");
  await issue(dialog, 3).click();
  await expect(dialog.getByRole("status")).toContainText("초대 코드 3건을 발급했습니다");
  expect((batches(api)[0].body as { invitations: { teamId: string | null }[] }).invitations.map((item) => item.teamId)).toEqual(["team-product", null, null]);
  await expect(dialog.getByRole("status").locator("code")).toHaveCount(3);

  // 코드는 발급 직후에만 본다. 닫았다 열면 남아 있지 않다.
  await dialog.getByRole("button", { name: "완료", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await expect(dialog.locator("code")).toHaveCount(0);
});
