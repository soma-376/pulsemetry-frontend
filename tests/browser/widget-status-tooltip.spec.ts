import { expect, authenticatedTest as test } from "./fixtures";
import { mockOverview } from "./overview-fixture";

for (const width of [1440, 390]) {
  for (const kind of ["zero-models", "missing-trend"] as const) {
    test(`${kind} status reason stays near its header for keyboard and pointer at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await mockOverview(page, (data) => {
        if (kind === "zero-models") {
          for (const model of data.modelMix!.models) {
            model.equivalentCostUsd = {
              value: "0",
              status: "complete",
              reasons: [],
            };
            model.effectiveCostPerMillionTokensUsd = {
              value: "0",
              status: "complete",
              reasons: [],
            };
            model.costShare = {
              value: null,
              status: "unavailable",
              reasons: ["zero_denominator"],
            };
          }
        } else {
          data.trend!.points[0].observation = "unobserved";
          data.trend!.points[0].equivalentCostUsd = {
            value: null,
            status: "unavailable",
            reasons: ["coverage_gap"],
          };
        }
      });
      await page.goto(
        "/overview?startDate=2026-09-07&endDate=2026-09-13&compare=none",
      );
      const card = page.getByRole("region", {
        name:
          kind === "zero-models"
            ? "모델별 사용 환산액 비중"
            : "사용 환산액 추이",
        exact: true,
      });
      const badge = card.locator('[tabindex="0"][aria-label]').filter({
        hasText:
          kind === "zero-models" ? "일부 값 확인 불가" : "일부 날짜 확인 불가",
      });
      const tip = badge.locator('span[aria-hidden="true"]');
      await expect(badge).toBeVisible();
      await badge.scrollIntoViewIfNeeded();
      await page.keyboard.press("Tab");
      await badge.focus();
      await expect(tip).toBeVisible();
      const verifyPlacement = async () => {
        const [badgeBox, tipBox, cardBox] = await Promise.all([
          badge.boundingBox(),
          tip.boundingBox(),
          card.boundingBox(),
        ]);
        expect(badgeBox).not.toBeNull();
        expect(tipBox).not.toBeNull();
        expect(cardBox).not.toBeNull();
        expect(tipBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
        expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(
          cardBox!.x + cardBox!.width,
        );
        expect(tipBox!.y).toBeGreaterThanOrEqual(badgeBox!.y);
        expect(tipBox!.y - (badgeBox!.y + badgeBox!.height)).toBeLessThan(60);
        expect(tipBox!.y + tipBox!.height).toBeLessThanOrEqual(900);
      };
      await testInfo.attach("keyboard-reason", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
      await verifyPlacement();
      await badge.press("Tab");
      await expect(tip).toBeHidden();
      await badge.hover();
      await expect(tip).toBeVisible();
      await verifyPlacement();
      await page.mouse.move(0, 0);
      await expect(tip).toBeHidden();
    });
  }
}
