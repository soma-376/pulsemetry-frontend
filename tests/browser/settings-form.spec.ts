import { openDashboard } from "./helpers";
import { serveSettings } from "./onboarding-fixture";
import { expect, test, type Page } from "@playwright/test";

/**
 * 설정의 벤더 드로어(서버 등록 제품). 응답은 `serveSettings` 가 백엔드 명세 §12 의 규칙대로 흉내 낸다 — 제품당 등록 하나,
 * 계약 정정은 시작일 유지, PATCH 는 표시 이름만. 온보딩이 GitHub Copilot 계약("Test contract")을 먼저 등록한다.
 */
async function addVendor(page: Page, product: string, name: string, fee = "10") {
  await page.getByRole("button", { name: "벤더 추가", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "벤더 추가", exact: true });
  await dialog.getByLabel("제품", { exact: true }).selectOption(product);
  await dialog.getByLabel("플랜", { exact: true }).selectOption("team");
  await dialog.getByLabel("표시 이름", { exact: true }).fill(name);
  await dialog.getByLabel("좌석 수", { exact: true }).fill("2");
  await dialog.getByLabel("월 단가", { exact: true }).fill(fee);
  await dialog.getByRole("button", { name: "벤더 추가", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

async function deleteOpenVendor(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "벤더 삭제", exact: true }).click();
  await dialog.getByRole("button", { name: "제품 삭제 확인", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test.beforeEach(async ({ page }) => {
  serveSettings(page);
  await openDashboard(page, "/settings");
});

test("deleting a middle vendor then adding another keeps edit and delete targets separate", async ({ page }) => {
  await addVendor(page, "server_only", "Review A");
  await addVendor(page, "claude_team", "Review B");
  const dialog = page.getByRole("dialog");
  // 가운데 행을 지우면 그 제품을 다시 등록할 수 있다(제품당 등록 하나).
  await page.getByRole("button", { name: "Review A 계약 설정 열기" }).click();
  await deleteOpenVendor(page);
  await addVendor(page, "server_only", "Review D");
  await page.getByRole("button", { name: "Review D 계약 설정 열기" }).click();
  await expect(dialog.getByLabel("표시 이름", { exact: true })).toHaveValue("Review D");
  await dialog.getByLabel("표시 이름", { exact: true }).fill("Review D renamed");
  await dialog.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Review B 계약 설정 열기" })).toHaveCount(1);
  await page.getByRole("button", { name: "Review D renamed 계약 설정 열기" }).click();
  await deleteOpenVendor(page);
  await expect(page.getByRole("button", { name: "Review B 계약 설정 열기" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Test contract 계약 설정 열기" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Review (A|D)/ })).toHaveCount(0);
});

test("keeps invalid input, explains errors, blocks save and accepts a free contract", async ({ page }) => {
  await page.getByRole("button", { name: "벤더 추가", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("제품", { exact: true }).selectOption("server_only");
  await dialog.getByLabel("플랜", { exact: true }).selectOption("team");
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
  await expect(row).toContainText("유효");
  await expect(row).toContainText("$0.00");
  await row.click();
  await expect(dialog.getByRole("button", { name: "변경사항 저장" })).toBeDisabled();
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
  await product.selectOption("server_only");
  await expect(plan).toHaveValue("");
  await expect(plan.locator("option")).toHaveText(["선택 안 함", "Team"]);
  // 플랜 없이 계약 정보를 넣으면 저장하지 못한다(계약 없이 제품만 등록하는 것은 된다 — 명세 §12).
  const term = dialog.getByLabel("계약 종료일", { exact: true });
  await term.fill("20301231");
  await expect(dialog.getByRole("button", { name: "벤더 추가", exact: true })).toBeDisabled();
  await expect(dialog.getByText("계약 정보를 저장하려면 플랜을 선택하세요")).toBeVisible();
  await plan.selectOption("team");
  await dialog.getByLabel("좌석 수", { exact: true }).fill("99");
  await product.selectOption("claude_team");
  // 제품을 바꾸면 플랜·종료일·좌석 구성을 비운다.
  await expect(plan).toHaveValue("");
  await expect(term).toHaveValue("");
  await expect(plan.locator("option")).toHaveText(["선택 안 함", "Team", "Enterprise"]);
  await plan.selectOption("team");
  await expect(dialog.getByLabel("좌석 수", { exact: true })).toHaveValue("");
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
  await expect(dialog.getByText("Claude (Anthropic)", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("좌석 유형", { exact: true }).nth(1)).toHaveValue("프리미엄");
  await expect(dialog.getByLabel("월 단가", { exact: true }).nth(1)).toHaveValue("105");
});
