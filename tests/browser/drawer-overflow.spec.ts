import { expect, test, type Page } from "@playwright/test";

async function sampleOverflow(page: Page) {
  return page.evaluate(async () => {
    const failures: { element: string; width: number; scrollWidth: number; overflow: string }[] = [];
    const until = performance.now() + 700;
    await new Promise<void>((resolve) => {
      const sample = () => {
        const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
        const elements = [document.documentElement, ...(dialog ? [dialog] : [])];
        for (const element of elements) {
          const overflow = getComputedStyle(element).overflowX;
          if (element.scrollWidth > element.clientWidth + 1 && overflow !== "hidden" && overflow !== "clip") {
            failures.push({ element: element.tagName, width: element.clientWidth, scrollWidth: element.scrollWidth, overflow });
          }
        }
        if (performance.now() < until) requestAnimationFrame(sample);
        else resolve();
      };
      requestAnimationFrame(sample);
    });
    return failures.slice(0, 3);
  });
}

for (const width of [1440, 390]) {
  test(`drawer does not create horizontal scrollbars during opening or closing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/teams");
    if (width < 600) await page.getByRole("button", { name: "내비게이션 접기/펼치기" }).click();
    const trigger = page.getByRole("region", { name: "팀별 사용량 비교" }).getByRole("button", { name: "플랫폼", exact: true });
    await trigger.scrollIntoViewIfNeeded();
    const opening = sampleOverflow(page);
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "플랫폼 팀" });
    await expect(dialog).toBeVisible();
    expect(await opening).toEqual([]);
    await expect(dialog).toHaveCSS("width", `${width}px`);
    const closing = sampleOverflow(page);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    expect(await closing).toEqual([]);
    await expect(trigger).toBeFocused();
  });
}
