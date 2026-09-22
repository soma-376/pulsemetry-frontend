import { openDashboard } from "./helpers";
import { expect, test, type Locator, type Page } from "@playwright/test";

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

// Sample the visible panel itself: opacity on its parent used to hide the exit slide.
async function sampleSlide(trigger: Locator) {
  return trigger.evaluate(async (element) => {
    const frames: { x: number; width: number; opacity: string; parentOpacity: string }[] = [];
    (element as HTMLElement).focus();
    (element as HTMLElement).click();
    const until = performance.now() + 550;
    await new Promise<void>((resolve) => {
      const sample = () => {
        const panel = document.querySelector<HTMLElement>("dialog[open] > div > section");
        if (panel) {
          const style = getComputedStyle(panel);
          frames.push({
            x: style.transform === "none" ? 0 : new DOMMatrixReadOnly(style.transform).m41,
            width: panel.getBoundingClientRect().width,
            opacity: style.opacity,
            parentOpacity: getComputedStyle(panel.parentElement!).opacity,
          });
        }
        if (performance.now() < until) requestAnimationFrame(sample);
        else resolve();
      };
      requestAnimationFrame(sample);
    });
    return frames;
  });
}

for (const route of ["teams", "settings"]) {
  test(`${route} drawer slides left on entry and right on exit without fading the panel`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openDashboard(page, `/${route}`);
    const trigger = route === "teams"
      ? page.getByRole("region", { name: "팀별 사용량 비교" }).getByRole("button", { name: "플랫폼", exact: true })
      : page.getByRole("button", { name: "벤더 추가", exact: true });
    const opening = await sampleSlide(trigger);
    expect(opening.some((frame) => frame.x > 5 && frame.x < frame.width)).toBe(true);
    expect(opening.at(-1)!.x).toBeCloseTo(0);
    expect(opening.every((frame) => frame.opacity === "1" && frame.parentOpacity === "1")).toBe(true);
    const dialog = page.getByRole("dialog", { name: route === "teams" ? "플랫폼 팀" : "벤더 추가", exact: true });
    const closing = await sampleSlide(dialog.getByRole("button", { name: "상세 패널 닫기" }));
    expect(closing.length).toBeGreaterThan(2);
    expect(closing.at(-1)!.x).toBeGreaterThan(closing[0].x + 50);
    expect(closing.every((frame) => frame.opacity === "1" && frame.parentOpacity === "1")).toBe(true);
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test(`${route} drawer closes with reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDashboard(page, `/${route}`);
    const trigger = route === "teams"
      ? page.getByRole("region", { name: "팀별 사용량 비교" }).getByRole("button", { name: "플랫폼", exact: true })
      : page.getByRole("button", { name: "벤더 추가", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: route === "teams" ? "플랫폼 팀" : "벤더 추가", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(":scope > div > section")).toHaveCSS("transform", "none");
    await dialog.getByRole("button", { name: "상세 패널 닫기" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
}

test("settings save and delete keep the drawer mounted until its exit ends", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openDashboard(page, "/settings");
  await page.getByRole("button", { name: "벤더 추가", exact: true }).click();
  const addDialog = page.getByRole("dialog", { name: "벤더 추가", exact: true });
  await addDialog.getByLabel("표시 이름", { exact: true }).fill("Animation vendor");
  await addDialog.getByLabel("좌석 수", { exact: true }).fill("5");
  await addDialog.getByLabel("월 단가", { exact: true }).fill("10");
  await expect(addDialog.locator(":scope > div > section")).toHaveCSS("transform", "none");
  const saving = await sampleSlide(addDialog.getByRole("button", { name: "벤더 추가", exact: true }));
  expect(saving.length).toBeGreaterThan(2);
  expect(saving.at(-1)!.x).toBeGreaterThan(saving[0].x + 50);
  await expect(addDialog).not.toBeVisible();

  const trigger = page.getByRole("button", { name: "Animation vendor 계약 설정 열기" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Animation vendor 계약 설정", exact: true });
  await expect(dialog.getByLabel("좌석 수", { exact: true })).toHaveValue("5");
  await dialog.getByLabel("좌석 수", { exact: true }).fill("9");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await trigger.click();
  await expect(dialog.getByLabel("좌석 수", { exact: true })).toHaveValue("5");
  await dialog.getByRole("button", { name: "벤더 삭제", exact: true }).click();
  const deleting = await sampleSlide(dialog.getByRole("button", { name: "삭제", exact: true }));
  expect(deleting.length).toBeGreaterThan(2);
  expect(deleting.at(-1)!.x).toBeGreaterThan(deleting[0].x + 50);
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

for (const width of [1440, 390]) {
  test(`drawer does not create horizontal scrollbars during opening or closing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openDashboard(page, "/teams");
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
