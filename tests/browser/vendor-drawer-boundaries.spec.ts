import { expect, test, type Page } from "./fixtures";
import { openDashboard, saveOnboardingContract, signIn } from "./helpers";
import { serveSettings } from "./onboarding-fixture";

async function addContract(page: Page, name: string) {
  serveSettings(page);
  await openDashboard(page, "/settings");
  await page.getByRole("button", { name: "벤더 추가", exact: true }).click();
  const form = page.getByRole("dialog", { name: "벤더 추가", exact: true });
  await form.getByLabel("제품", { exact: true }).selectOption("server_only");
  await form.getByLabel("플랜", { exact: true }).selectOption("team");
  await form.getByLabel("표시 이름", { exact: true }).fill(name);
  await form.getByLabel("좌석 수", { exact: true }).fill("1");
  await form.getByLabel("월 단가", { exact: true }).fill("12.50");
  await form.getByRole("button", { name: "벤더 추가", exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.getByRole("button", { name: `${name} 계약 설정 열기` }).click();
  const editor = page.getByRole("dialog", {
    name: `${name} 계약 설정`,
    exact: true,
  });
  await expect(editor.getByLabel("월 단가", { exact: true })).toHaveValue(
    "12.50",
  );
  return editor;
}

test("a pending contract save rejects dismissal and preserves the draft after failure", async ({
  page,
}, testInfo) => {
  const editor = await addContract(page, "Pending contract");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempts = 0;
  await page.route(
    "**/api/bff/enrollment/api/v1/organizations/*/vendors/*/contract",
    async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      attempts++;
      await held;
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "unavailable",
            message: "Local isolated test failure",
          },
        },
      });
    },
  );
  const fee = editor.getByLabel("월 단가", { exact: true });
  await fee.fill("25");
  await editor
    .getByRole("button", { name: "변경사항 저장", exact: true })
    .click();
  const close = editor.getByRole("button", {
    name: "상세 패널 닫기",
    exact: true,
  });
  try {
    await expect.poll(() => attempts).toBe(1);
    await expect(fee).toBeDisabled();
    await expect(
      editor.getByRole("button", { name: "취소", exact: true }),
    ).toBeDisabled();
    // Record the affordance separately from the guarded behavior; this test does
    // not invent a new product rule from a source-review candidate.
    const closeEnabled = await close.isEnabled();
    await testInfo.attach("pending-close-affordance", {
      body: JSON.stringify({ closeEnabled, contractRequests: attempts }),
      contentType: "application/json",
    });
    if (closeEnabled) await close.click();
    await expect(editor).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editor).toBeVisible();
    await page.mouse.click(20, 200);
    await expect(editor).toBeVisible();
    expect(attempts).toBe(1);
  } finally {
    release();
  }
  await expect(editor.getByRole("alert")).toContainText(
    "서버에 연결하지 못했습니다",
  );
  await expect(fee).toBeEnabled();
  await expect(fee).toHaveValue("25");
  await close.click();
  await expect(editor).not.toBeVisible();
});

for (const width of [1440, 390]) {
  test(`a permitted 100-character planned product label stays within default and individual pickers at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    serveSettings(page);
    await page.goto("/login");
    await signIn(page);
    await page.getByRole("radio", { name: /^수집하지 않음/ }).check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    const name = "W".repeat(100);
    await saveOnboardingContract(page, name);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    const defaults = page.getByRole("group", {
      name: "사용 예정 제품 (선택)",
      exact: true,
    });
    await defaults.getByRole("checkbox", { name, exact: true }).check();
    for (const email of ["mock-only@example.test", "second@example.test"]) {
      await page.getByRole("textbox", { name: "초대할 이메일" }).fill(email);
      await page.getByRole("textbox", { name: "초대할 이메일" }).press("Enter");
    }
    const individual = page.getByRole("group", {
      name: "mock-only@example.test 사용 예정 제품",
      exact: true,
    });
    for (const [scope, group] of [
      ["default", defaults],
      ["individual", individual],
    ] as const) {
      const checkbox = group.getByRole("checkbox", { name, exact: true });
      await expect(checkbox).toBeChecked();
      const bounds = await checkbox.evaluate((input) => {
        const label = input.closest("label")!;
        const fieldset = input.closest("fieldset")!.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(label);
        return {
          viewport: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          fieldset: { left: fieldset.left, right: fieldset.right },
          text: [...range.getClientRects()].map((rect) => ({
            left: rect.left,
            right: rect.right,
          })),
        };
      });
      await testInfo.attach(`long-product-${scope}-bounds`, {
        body: JSON.stringify(bounds),
        contentType: "application/json",
      });
      expect.soft(bounds.documentWidth).toBeLessThanOrEqual(width);
      for (const rect of bounds.text) {
        expect.soft(rect.left).toBeGreaterThanOrEqual(bounds.fieldset.left);
        expect.soft(rect.right).toBeLessThanOrEqual(bounds.fieldset.right);
      }
    }
    await individual.getByRole("checkbox", { name, exact: true }).uncheck();
    await expect(
      defaults.getByRole("checkbox", { name, exact: true }),
    ).toBeChecked();
  });

  test(`a permitted 100-character vendor registration status wraps within the onboarding form at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await signIn(page);
    await page.getByRole("radio", { name: /^수집하지 않음/ }).check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    const name = "W".repeat(100);
    await saveOnboardingContract(page, name);
    const status = page
      .getByRole("status")
      .filter({ hasText: `${name} 벤더를 등록했습니다` });
    await expect(status).toHaveText(`${name} 벤더를 등록했습니다`);
    const bounds = await status.evaluate((element) => {
      const form = element.closest("form")!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        form: { left: form.left, right: form.right },
        text: [...range.getClientRects()].map((rect) => ({
          left: rect.left,
          right: rect.right,
        })),
      };
    });
    await testInfo.attach("long-status-bounds", {
      body: JSON.stringify(bounds),
      contentType: "application/json",
    });
    expect(bounds.documentWidth).toBeLessThanOrEqual(width);
    for (const rect of bounds.text) {
      expect(rect.left).toBeGreaterThanOrEqual(bounds.form.left);
      expect(rect.right).toBeLessThanOrEqual(bounds.form.right);
    }
    await expect(
      page.getByRole("button", { name: "다음", exact: true }),
    ).toBeEnabled();
  });

  test(`a permitted 100-character contract title and its close control remain within the drawer at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    const name = "W".repeat(100);
    const editor = await addContract(page, name);
    const title = editor.getByRole("heading", {
      name: `${name} 계약 설정`,
      exact: true,
    });
    await expect(title).toHaveText(`${name} 계약 설정`);
    const close = editor.getByRole("button", {
      name: "상세 패널 닫기",
      exact: true,
    });
    const bounds = await title.evaluate((heading) => {
      const panel = heading.closest("section")!.getBoundingClientRect();
      const button = heading
        .closest("header")!
        .querySelector("button")!
        .getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(heading);
      return {
        viewport: innerWidth,
        transform: getComputedStyle(heading.closest("section")!).transform,
        dialogScrollLeft: heading.closest("dialog")!.scrollLeft,
        panel: { left: panel.left, right: panel.right },
        close: { left: button.left, right: button.right },
        text: [...range.getClientRects()].map((rect) => ({
          left: rect.left,
          right: rect.right,
        })),
      };
    });
    await testInfo.attach("long-title-bounds", {
      body: JSON.stringify(bounds),
      contentType: "application/json",
    });
    expect(bounds.transform).toBe("none");
    expect(bounds.close.left).toBeGreaterThanOrEqual(bounds.panel.left);
    expect(bounds.close.right).toBeLessThanOrEqual(bounds.panel.right);
    expect(bounds.close.right).toBeLessThanOrEqual(width);
    for (const rect of bounds.text) {
      expect(rect.left).toBeGreaterThanOrEqual(bounds.panel.left);
      expect(rect.right).toBeLessThanOrEqual(bounds.close.left);
    }
    await close.click();
    await expect(editor).not.toBeVisible();
  });
}
