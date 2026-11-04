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
      modelId: `unknown/tool/${id}`,
      modelVendor: String(id).startsWith("claude-")
        ? { id: "anthropic", name: "Anthropic" }
        : { id: "openai", name: "OpenAI" },
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
  await expect(card.getByRole("button", { name: /gpt-6.1-sol/ })).toContainText(
    "75.0%",
  );
  await expect(card).not.toContainText("전체 환산액의");
  await expect(card).not.toContainText("모델을 선택하면");
  await expect(card).not.toContainText("모델을 클릭하면");
  await expect(card.getByRole("button", { name: /claude-haiku/ })).toHaveCount(
    0,
  );
  await card.getByRole("button", { name: /gpt-6.1-sol/ }).click();
  await expect(
    card.getByRole("button", { name: /gpt-6.1-sol/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const anthropic = badges.getByRole("button", {
    name: "Anthropic",
    exact: true,
  });
  await anthropic.focus();
  await page.keyboard.press("Enter");
  await expect(anthropic).toHaveAttribute("aria-pressed", "true");
  await expect(
    card.getByRole("button", { name: /claude-haiku/ }),
  ).toContainText("100.0%");
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

test("관측 벤더만 표시하고 새로고침으로 한 벤더가 남으면 배지와 필터를 해제한다", async ({
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
      modelId: `unknown/tool/${id}`,
      modelVendor: id.startsWith("claude-")
        ? { id: "anthropic", name: "Anthropic" }
        : id === "custom-model"
          ? null
          : { id: "openai", name: "OpenAI" },
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
  const badges = card.getByRole("group", { name: "모델 벤더" });
  await expect(badges.getByRole("button")).toHaveCount(3);
  await expect(badges.getByRole("button", { name: "기타·미확인" })).toHaveCount(
    0,
  );
  await badges.getByRole("button", { name: "OpenAI", exact: true }).click();
  ids = ["gpt-6-astra", "gpt-6.1-sol", "custom-model"];
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(badges).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: /custom-model/ }),
  ).toBeVisible();
  await expect(card.getByRole("button", { name: /gpt-6.1-sol/ })).toBeVisible();
  await expect(card).not.toContainText("전체 환산액의");
  await expect(card).not.toContainText("모델을 선택하면");
  ids = ["claude-haiku-5-5"];
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(card).toContainText("claude-haiku-5-5");
  await expect(badges).toHaveCount(0);
});
