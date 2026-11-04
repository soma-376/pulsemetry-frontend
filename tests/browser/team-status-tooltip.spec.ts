import { expect, authenticatedTest as test } from "./fixtures";
import { mockTeams } from "./teams-fixture";
import { mockIngestStatus } from "./overview-fixture";

for (const width of [1440, 390]) {
  for (const kind of ["scatter", "total"] as const) {
    test(`team ${kind} does not repeat quality badges at ${width}px`, async ({
      page,
    }) => {
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
      await expect(card).toBeVisible();
      await expect(
        card
          .locator(":scope > div")
          .first()
          .locator('[tabindex="0"][aria-label]'),
      ).toHaveCount(0);
      await expect(
        card.getByText(/관측 근거 부족|일부 집계|비교 불가/, { exact: true }),
      ).toHaveCount(0);
    });
  }
}
