import { expect, authenticatedTest as test } from "./fixtures";
import {
  mockOverview,
  mockOverviewSettings,
  overviewFixture,
  overviewUrl,
} from "./overview-fixture";
import { mockSession } from "./helpers";

test("벤더 배지 전환·모델 선택 초기화·키보드·좁은 화면", async ({
  page,
}, testInfo) => {
  await mockSession(page);
  await mockOverviewSettings(page);
  await mockOverview(page);
  await page.route(overviewUrl, async (route) => {
    const data = overviewFixture(route.request().url());
    const template = data.modelMix!.models[0];
    data.modelMix!.models = [
      ["gpt-6.1-sol", 0.6],
      ["gpt-6-astra", 0.2],
      ["claude-haiku-5-5", 0.2],
    ].map(([id, share]) => ({
      ...template,
      modelId: String(id),
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
  const badges = card.getByRole("group", { name: "모델 벤더" });
  await expect(
    badges.getByRole("button", { name: "전체", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await badges.getByRole("button", { name: "OpenAI", exact: true }).click();
  await expect(card).toContainText("OpenAI 환산액의 75.0%");
  await expect(card.getByRole("button", { name: /claude-haiku/ })).toHaveCount(
    0,
  );
  await card.getByRole("button", { name: /gpt-6.1-sol/ }).click();
  await expect(card).toContainText("gpt-6.1-sol 선택됨");
  const anthropic = badges.getByRole("button", {
    name: "Anthropic",
    exact: true,
  });
  await anthropic.focus();
  await page.keyboard.press("Enter");
  await expect(anthropic).toHaveAttribute("aria-pressed", "true");
  await expect(card).toContainText("Anthropic 환산액의 100.0%");
  await expect(card).not.toContainText("gpt-6.1-sol 선택됨");
  await expect(card.locator("svg")).toHaveCount(1);
  await expect(card.locator("svg circle").last()).toHaveCSS(
    "stroke-dasharray",
    /237\.16/,
  );
  await page.setViewportSize({ width: 680, height: 900 });
  await expect(anthropic).toBeVisible();
  expect(
    await card.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await card.screenshot({ path: testInfo.outputPath("vendor-narrow.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await badges.getByRole("button", { name: "전체", exact: true }).click();
  await card.screenshot({ path: testInfo.outputPath("vendor-desktop.png") });
});
