import { openDashboard } from "./helpers";
import { expect, test, type Locator } from "@playwright/test";

async function addEmail(dialog: Locator, email: string, key = "Enter") {
  const input = dialog.getByRole("textbox", { name: "초대할 이메일" });
  await input.fill(email);
  await input.press(key);
  await expect(input).toHaveValue("");
}

test.beforeEach(async ({ page }) => {
  await openDashboard(page, "/members");
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "구성원 초대" })).toBeVisible();
});

test("validates email, rejects duplicates and prevents silently dropping a draft", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  const input = dialog.getByRole("textbox", { name: "초대할 이메일" });
  await expect(dialog.getByRole("button", { name: "초대 메일 발송", exact: true })).toBeDisabled();
  await input.fill("invalid");
  await input.press("Enter");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAccessibleDescription("이메일 형식이 아닙니다");

  await addEmail(dialog, "  first@example.com  ");
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await input.fill("first@example.com");
  await input.press(",");
  await expect(input).toHaveAccessibleDescription("이미 추가한 이메일입니다");
  await expect(dialog.getByRole("button", { name: "first@example.com 제거" })).toHaveCount(1);

  await input.fill("broken@");
  await dialog.getByRole("button", { name: "1명에게 초대 메일 발송", exact: true }).click();
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("status")).toHaveCount(0);

  await input.fill("second@example.com");
  await dialog.getByRole("button", { name: "1명에게 초대 메일 발송", exact: true }).click();
  await expect(input).toHaveAccessibleDescription("Enter 또는 쉼표로 이메일을 추가한 뒤 초대하세요");
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await input.press(",");
  await expect(input).toHaveValue("");
  await dialog.getByRole("button", { name: "2명에게 초대 메일 발송", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("데모 초대 2명을 추가했습니다");
});

test("inherits defaults, preserves explicit assignments and resets after submission", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  await dialog.getByRole("combobox", { name: "팀", exact: true }).selectOption({ label: "플랫폼" });
  await addEmail(dialog, "first@example.com");
  await addEmail(dialog, "second@example.com", ",");
  await expect(dialog.getByLabel("first@example.com 팀", { exact: true })).toHaveValue("team-1");
  await dialog.getByLabel("first@example.com 팀", { exact: true }).selectOption("");
  await dialog.getByLabel("first@example.com 역할", { exact: true }).selectOption("admin");
  await dialog.getByRole("combobox", { name: "팀", exact: true }).selectOption({ label: "데이터" });
  await dialog.getByRole("combobox", { name: "역할", exact: true }).selectOption("viewer");
  await expect(dialog.getByLabel("first@example.com 팀", { exact: true })).toHaveValue("");
  await expect(dialog.getByLabel("first@example.com 역할", { exact: true })).toHaveValue("admin");
  await expect(dialog.getByLabel("second@example.com 팀", { exact: true })).toHaveValue("team-2");
  await expect(dialog.getByLabel("second@example.com 역할", { exact: true })).toHaveValue("viewer");

  await dialog.getByRole("button", { name: "2명에게 초대 메일 발송", exact: true }).click();
  const result = dialog.getByRole("status");
  await expect(result).toContainText("팀 미배정 1명 · 데이터 1명 · 역할 2종");
  await expect(dialog.getByRole("textbox")).toHaveValue("");
  await expect(dialog.getByRole("textbox")).toHaveAttribute("aria-invalid", "false");
  await expect(dialog.getByRole("button", { name: "초대 메일 발송", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("combobox", { name: "팀", exact: true })).toHaveValue("team-2");
  await expect(dialog.getByRole("combobox", { name: "역할", exact: true })).toHaveValue("viewer");

  await addEmail(dialog, "first@example.com");
  await expect(result).toHaveCount(0);
  await dialog.getByRole("button", { name: "1명에게 초대 메일 발송", exact: true }).click();
  await expect(result).toContainText("데이터 1명 · 조회 전용");
});

test("removing and re-adding a recipient clears only their overrides", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  await addEmail(dialog, "first@example.com");
  await addEmail(dialog, "second@example.com");
  await dialog.getByLabel("first@example.com 팀", { exact: true }).selectOption({ label: "결제" });
  await dialog.getByLabel("first@example.com 역할", { exact: true }).selectOption("admin");
  await dialog.getByLabel("second@example.com 팀", { exact: true }).selectOption({ label: "데이터" });
  await dialog.getByLabel("second@example.com 역할", { exact: true }).selectOption("viewer");
  await dialog.getByRole("button", { name: "first@example.com 제거" }).last().click();
  await expect(dialog.getByLabel("second@example.com 팀", { exact: true })).toHaveCount(0);
  await addEmail(dialog, "first@example.com");
  await expect(dialog.getByLabel("first@example.com 팀", { exact: true })).toHaveValue("");
  await expect(dialog.getByLabel("first@example.com 역할", { exact: true })).toHaveValue("member");
  await expect(dialog.getByLabel("second@example.com 팀", { exact: true })).toHaveValue("team-2");
  await expect(dialog.getByLabel("second@example.com 역할", { exact: true })).toHaveValue("viewer");
  await dialog.getByRole("button", { name: "first@example.com 제거" }).first().click();
  await dialog.getByRole("button", { name: "1명에게 초대 메일 발송", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("데이터 1명 · 조회 전용");
});

test("closing and reopening preserves entered values and individual assignments", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  await addEmail(dialog, "first@example.com");
  await addEmail(dialog, "second@example.com");
  await dialog.getByLabel("first@example.com 팀", { exact: true }).selectOption({ label: "결제" });
  await dialog.getByRole("textbox").fill("draft@example.com");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  await expect(dialog.getByRole("textbox")).toHaveValue("draft@example.com");
  await expect(dialog.getByLabel("first@example.com 팀", { exact: true })).toHaveValue("team-3");
  await dialog.getByRole("textbox").press("Enter");
  await dialog.getByRole("button", { name: "3명에게 초대 메일 발송", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("결제 1명 · 팀 미배정 2명");
});
