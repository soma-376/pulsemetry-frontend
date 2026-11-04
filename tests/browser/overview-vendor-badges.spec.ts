import { mockSession } from "./helpers";
import { expect, authenticatedTest as test } from "./fixtures";
import {
  mockOverviewSettings,
  overviewFixture,
  overviewUrl,
} from "./overview-fixture";

test("공급자 배지 없이 전체 모델 비중과 선택·키보드 조작을 유지한다", async ({
  page,
}, testInfo) => {
  await mockSession(page);
  await mockOverviewSettings(page);
  await page.route(overviewUrl, async (route) => {
    const data = overviewFixture(route.request().url());
    const template = data.modelMix!.models[0];
    data.modelMix!.models = [
      ["gpt-6.1-sol", 0.6],
      ["claude-haiku-5-5", 0.3],
      ["custom-model", 0.1],
    ].map(([id, share]) => ({
      ...template,
      modelId: `unknown/tool/${id}`,
      displayName: String(id),
      equivalentCostUsd: {
        ...template.equivalentCostUsd,
        value: String(Number(share) * 100),
      },
      costShare: { ...template.costShare, value: Number(share) },
    }));
    await route.fulfill({ json: data });
  });
  await page.goto("/overview");
  const card = page.getByRole("region", {
    name: "모델별 사용 환산액 비중",
    exact: true,
  });
  await expect(card.getByRole("group", { name: "모델 벤더" })).toHaveCount(0);
  for (const [name, share] of [
    ["gpt-6.1-sol", "60.0%"],
    ["claude-haiku-5-5", "30.0%"],
    ["custom-model", "10.0%"],
  ]) {
    await expect(
      card.getByRole("button", { name: new RegExp(name) }),
    ).toContainText(share);
  }
  const model = card.getByRole("button", { name: /claude-haiku-5-5/ });
  await model.focus();
  await page.keyboard.press("Enter");
  await expect(model).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(model).toHaveAttribute("aria-pressed", "false");
  await expect(card).not.toContainText("전체 환산액의");
  await expect(card).not.toContainText("모델을 선택하면");
  await expect(card).not.toContainText("unknown/");
  await card.screenshot({ path: testInfo.outputPath("models-desktop.png") });
  await page.setViewportSize({ width: 680, height: 900 });
  expect(
    await card.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await card.screenshot({ path: testInfo.outputPath("models-narrow.png") });
});

test("새로고침으로 모델 구성이 바뀌어도 필터 없이 모든 모델을 표시한다", async ({
  page,
}) => {
  await mockSession(page);
  await mockOverviewSettings(page);
  let ids = ["gpt-6-astra", "claude-haiku-5-5", "custom-model"];
  await page.route(overviewUrl, async (route) => {
    const data = overviewFixture(route.request().url());
    const template = data.modelMix!.models[0];
    data.modelMix!.models = ids.map((id) => ({
      ...template,
      modelId: id,
      displayName: id,
      costShare: { ...template.costShare, value: 1 / ids.length },
    }));
    await route.fulfill({ json: data });
  });
  await page.goto("/overview");
  const card = page.getByRole("region", {
    name: "모델별 사용 환산액 비중",
    exact: true,
  });
  await expect(
    card.getByRole("button", { name: /custom-model/ }),
  ).toBeVisible();
  ids = ["gpt-6-astra", "gpt-6.1-sol", "custom-model"];
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(card.getByRole("button", { name: /gpt-6.1-sol/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /claude-haiku/ })).toHaveCount(
    0,
  );
  ids = ["claude-haiku-5-5"];
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(card).toContainText("claude-haiku-5-5");
  await expect(card.getByRole("group", { name: "모델 벤더" })).toHaveCount(0);
});
