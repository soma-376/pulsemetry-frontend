import { expect, test } from "./fixtures";
import { openDashboard } from "./helpers";
import { serveSettings } from "./onboarding-fixture";

for (const width of [1440, 390]) {
  test(`a valid large contract amount stays readable without overlapping controls at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await serveSettings(page);
    await openDashboard(page, "/settings");
    await page.getByRole("button", { name: "벤더 추가", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "벤더 추가", exact: true });
    await editor
      .getByLabel("제품", { exact: true })
      .selectOption("server_only");
    await editor.getByLabel("플랜", { exact: true }).selectOption("team");
    await editor.getByLabel("좌석 수", { exact: true }).fill("1");
    await editor
      .getByLabel("월 단가", { exact: true })
      .fill("1000000000000000.01");
    const total = editor.getByText("1석 · $1,000,000,000,000,000.01 / 월", {
      exact: true,
    });
    await expect(total).toBeVisible();
    const subtotal = editor
      .getByLabel("좌석 수", { exact: true })
      .locator("..")
      .locator("span.tnum");
    if (width === 1440) {
      await expect(subtotal).toBeVisible();
      const bounds = await subtotal.evaluate((span) => {
        const cell = span.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(span);
        const text = [...range.getClientRects()].map((rect) => ({
          left: rect.left,
          right: rect.right,
        }));
        const control = span.nextElementSibling!.getBoundingClientRect();
        return {
          cell: { left: cell.left, right: cell.right },
          text,
          controlLeft: control.left,
        };
      });
      expect(bounds.text.length).toBeGreaterThan(0);
      for (const rect of bounds.text) {
        expect(rect.left).toBeGreaterThanOrEqual(bounds.cell.left - 1);
        expect(rect.right).toBeLessThanOrEqual(bounds.cell.right + 1);
        expect(rect.right).toBeLessThan(bounds.controlLeft);
      }
    } else await expect(subtotal).toBeHidden();
    const totalBounds = await total.evaluate((span) => {
      const range = document.createRange();
      range.selectNodeContents(span);
      return {
        viewport: innerWidth,
        rects: [...range.getClientRects()].map((r) => ({
          left: r.left,
          right: r.right,
        })),
      };
    });
    for (const rect of totalBounds.rects) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(totalBounds.viewport);
    }
    await expect(
      editor.getByRole("button", { name: "벤더 추가", exact: true }),
    ).toBeEnabled();
  });
}
