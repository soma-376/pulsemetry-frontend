import { expect, authenticatedTest as test } from "./fixtures";
import {
  corsHeaders,
  mockOverviewSettings,
  overviewFixture,
  overviewUrl,
} from "./overview-fixture";

const complete = <T>(value: T) => ({
  value,
  status: "complete" as const,
  reasons: [],
});

function models(costs: number[]) {
  const total = costs.reduce((sum, cost) => sum + cost, 0);
  return costs.map((cost, index) => ({
    modelId: `refresh-model-${index}`,
    displayName: `Refresh Model ${index}`,
    equivalentCostUsd: complete(cost.toFixed(6)),
    totalTokens: complete(1_000_000),
    effectiveCostPerMillionTokensUsd: complete(cost.toFixed(6)),
    costShare: complete(cost / total),
  }));
}

for (const scenario of ["reorder", "removed"] as const) {
  test(`model selection follows identity after a same-period ${scenario} refresh`, async ({
    page,
  }, testInfo) => {
    await mockOverviewSettings(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let refreshed = false;
    await page.route(overviewUrl, async (route) => {
      const data = overviewFixture(route.request().url());
      data.modelMix!.models = models(
        refreshed
          ? scenario === "reorder"
            ? [50, 400, 30]
            : [50, 40]
          : [50, 40, 30, 20, 10, 5],
      );
      await route.fulfill({ json: data, headers: corsHeaders(page) });
    });
    await page.goto(
      "/overview?startDate=2026-10-01&endDate=2026-10-01&compare=none",
    );
    const card = page.getByRole("region", {
      name: "모델별 사용 환산액 비중",
      exact: true,
    });
    const selectedName =
      scenario === "reorder" ? "Refresh Model 0" : "기타 2개 모델";
    const selected = card.getByRole("button", {
      name: new RegExp(selectedName),
    });
    await selected.click();
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await testInfo.attach("before-refresh", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    refreshed = true;
    await page.getByRole("button", { name: "새로고침", exact: true }).click();
    await expect(
      card.getByRole("button", { name: /Refresh Model 1/ }),
    ).toContainText(scenario === "reorder" ? "$400.00/M" : "$40.00/M");
    await testInfo.attach("after-refresh", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    expect(errors).toEqual([]);
    if (scenario === "reorder") {
      await expect(selected).toHaveAttribute("aria-pressed", "true");
      await expect(card).toContainText("Refresh Model 0 선택됨");
      await expect(
        card.getByRole("button", { name: /Refresh Model 1/ }),
      ).toHaveAttribute("aria-pressed", "false");
    } else {
      await expect(card.locator('[aria-pressed="true"]')).toHaveCount(0);
      await expect(card).toContainText("모델을 클릭하면 선택이 유지됩니다");
      await expect(card.getByRole("button", { name: "선택 해제" })).toHaveCount(
        0,
      );
    }
  });
}
