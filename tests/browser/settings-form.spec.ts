import { openDashboard } from "./helpers";
import { expect, test, type Page } from "@playwright/test";

async function addVendor(page: Page, name: string, fee = "10") {
  await page.getByRole("button", { name: "벤더 추가", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("표시 이름", { exact: true }).fill(name);
  await dialog.getByLabel("좌석 수", { exact: true }).fill("2");
  await dialog.getByLabel("월 단가", { exact: true }).fill(fee);
  await dialog.getByRole("button", { name: "벤더 추가", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openDashboard(page, "/settings");
});

test("deleting a middle vendor then adding another keeps edit and delete targets separate", async ({ page }) => {
  for (const name of ["Review A", "Review B", "Review C"]) await addVendor(page, name);
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Review B 계약 설정 열기" }).click();
  await dialog.getByRole("button", { name: "벤더 삭제", exact: true }).click();
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await addVendor(page, "Review D");
  await page.getByRole("button", { name: "Review D 계약 설정 열기" }).click();
  await expect(dialog.getByLabel("표시 이름", { exact: true })).toHaveValue("Review D");
  await dialog.getByLabel("표시 이름", { exact: true }).fill("Review D renamed");
  await dialog.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Review C 계약 설정 열기" })).toHaveCount(1);
  await page.getByRole("button", { name: "Review D renamed 계약 설정 열기" }).click();
  await dialog.getByRole("button", { name: "벤더 삭제", exact: true }).click();
  await dialog.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Review C 계약 설정 열기" })).toHaveCount(1);
});

test("keeps invalid input, explains errors, blocks save and accepts a free contract", async ({ page }) => {
  await page.getByRole("button", { name: "벤더 추가", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const seats = dialog.getByLabel("좌석 수", { exact: true });
  const fee = dialog.getByLabel("월 단가", { exact: true });
  const save = dialog.getByRole("button", { name: "벤더 추가", exact: true });
  await dialog.getByLabel("표시 이름", { exact: true }).fill("Free contract");
  await fee.fill("0");
  for (const value of ["-5", "1e5", "1.2.3", "1.5", "9".repeat(400)]) {
    await seats.fill(value);
    await expect(seats).toHaveValue(value);
    await expect(seats).toHaveAttribute("aria-invalid", "true");
    await expect(seats).toHaveAccessibleDescription(/좌석 수/);
    await expect(save).toBeDisabled();
  }
  await seats.fill("2");
  for (const value of ["-5", "1e5", "1.2.3", "9".repeat(400)]) {
    await fee.fill(value);
    await expect(fee).toHaveValue(value);
    await expect(fee).toHaveAttribute("aria-invalid", "true");
    await expect(fee).toHaveAccessibleDescription(/월 단가/);
    await expect(save).toBeDisabled();
  }
  await fee.fill("0");
  await save.click();
  await expect(dialog).not.toBeVisible();
  const row = page.getByRole("button", { name: "Free contract 계약 설정 열기" });
  await expect(row).toContainText("설정됨");
  await expect(row).toContainText("$0.00");
  await row.click();
  await expect(dialog.getByRole("button", { name: "변경사항 없음" })).toBeDisabled();
  await fee.fill("12.345");
  await dialog.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(dialog).not.toBeVisible();
  await row.click();
  await expect(fee).toHaveValue("12.345");
});

test("product changes reset the plan and seats, and renamed Claude contracts keep their product", async ({ page }) => {
  await page.getByRole("button", { name: "벤더 추가", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const product = dialog.getByLabel("제품", { exact: true });
  const plan = dialog.getByLabel("플랜", { exact: true });
  await dialog.getByLabel("좌석 수", { exact: true }).fill("99");
  await product.selectOption("gemini");
  await expect(plan).toHaveValue("");
  await expect(plan.locator("option")).toHaveText(["선택하세요", "Standard", "Enterprise"]);
  await expect(dialog.getByRole("button", { name: "벤더 추가", exact: true })).toBeDisabled();
  await plan.selectOption("gemini_standard");
  await expect(dialog.getByLabel("좌석 수", { exact: true })).toHaveValue("");
  await product.selectOption("claude_team");
  await expect(plan.locator("option")).toHaveText(["선택하세요", "Team", "Enterprise"]);
  await plan.selectOption("team");
  await dialog.getByLabel("표시 이름", { exact: true }).fill("Research Claude");
  await dialog.getByLabel("좌석 수", { exact: true }).fill("3");
  await dialog.getByLabel("월 단가", { exact: true }).fill("20");
  await dialog.getByRole("button", { name: "+ 좌석 유형 추가" }).click();
  await dialog.getByLabel("좌석 수", { exact: true }).nth(1).fill("2");
  await dialog.getByLabel("월 단가", { exact: true }).nth(1).fill("100");
  await dialog.getByRole("button", { name: "벤더 추가", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Research Claude 계약 설정 열기" }).click();
  await expect(dialog.getByText("Claude (Anthropic)", { exact: true })).toBeVisible();
  await expect(plan).toHaveValue("team");
  await expect(dialog.getByLabel("좌석 수", { exact: true })).toHaveCount(2);
  await expect(dialog.getByLabel("좌석 유형", { exact: true }).nth(1)).toHaveValue("프리미엄");
  await dialog.getByLabel("월 단가", { exact: true }).nth(1).fill("105");
  await dialog.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Research Claude 계약 설정 열기" }).click();
  await expect(dialog.getByLabel("좌석 유형", { exact: true }).nth(1)).toHaveValue("프리미엄");
  await expect(dialog.getByLabel("월 단가", { exact: true }).nth(1)).toHaveValue("105");
});
