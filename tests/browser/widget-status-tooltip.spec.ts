import { expect, authenticatedTest as test } from "./fixtures";
import { mockOverview } from "./overview-fixture";

for (const width of [1440, 390]) {
  for (const kind of ["zero-models", "missing-trend"] as const) {
    test(`${kind} does not repeat quality badges at ${width}px`, async ({
      page,
    }) => {
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
      await expect(card).toBeVisible();
      await expect(
        card.getByText(
          /일부 값 확인 불가|일부 날짜 확인 불가|관측 근거 부족|일부 집계|비교 불가/,
          { exact: true },
        ),
      ).toHaveCount(0);
      if (kind === "missing-trend")
        await expect(card.locator("svg").first()).toBeVisible();
    });
  }
}
