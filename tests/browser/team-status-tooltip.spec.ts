import { expect, authenticatedTest as test } from "./fixtures";
import { mockTeams } from "./teams-fixture";
import { mockIngestStatus } from "./overview-fixture";

for (const width of [1440, 390]) {
  for (const kind of ["scatter", "total"] as const) {
    test(`team ${kind} reason stays beside its header for focus and hover at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await mockIngestStatus(page);
      await mockTeams(page, {
        modify: (data) => {
          Object.assign(data.totals.equivalentCostUsd, {
            status: "partial",
            reasons: ["coverage_gap"],
          });
          Object.assign(data.modelScatter.data.models[0], {
            equivalentCostUsd: null,
            status: "unavailable",
            reasons: ["pricing_missing"],
          });
        },
      });
      await page.goto(
        "/teams?startDate=2026-09-07&endDate=2026-09-13&compare=none",
      );
      const card = page.getByRole("region", {
        name: kind === "scatter" ? "모델별 토큰 대비 비용" : "팀별 사용량 비교",
        exact: true,
      });
      const badge = card
        .locator(":scope > div")
        .first()
        .locator('[tabindex="0"][aria-label]')
        .first();
      const tip = badge.locator('span[aria-hidden="true"]');
      await expect(badge).toBeVisible();
      await badge.scrollIntoViewIfNeeded();
      await page.keyboard.press("Tab");
      await badge.focus();
      await expect(tip).toBeVisible();
      const verifyPlacement = async () => {
        const [b, t, c] = await Promise.all([
          badge.boundingBox(),
          tip.boundingBox(),
          card.boundingBox(),
        ]);
        expect(b).not.toBeNull();
        expect(t).not.toBeNull();
        expect(c).not.toBeNull();
        expect(t!.x).toBeGreaterThanOrEqual(c!.x);
        expect(t!.x + t!.width).toBeLessThanOrEqual(c!.x + c!.width);
        expect(t!.y).toBeGreaterThanOrEqual(b!.y);
        expect(t!.y - (b!.y + b!.height)).toBeLessThan(60);
        expect(t!.y + t!.height).toBeLessThanOrEqual(900);
      };
      await testInfo.attach("focused-reason", {
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
