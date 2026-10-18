import { expect, authenticatedTest as test } from "./fixtures";
import { mockTeams, teamsFixture } from "./teams-fixture";
import { mockIngestStatus } from "./overview-fixture";

for (const width of [1440, 390]) {
  test(`53 teams keep model points contained and vendor columns readable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockIngestStatus(page);
    await mockTeams(page);
    await page.route(
      (url) => url.pathname.endsWith("/analytics/teams"),
      async (route) => {
        const url = new URL(route.request().url());
        const data = teamsFixture(url);
        const template = data.teams.items[0];
        data.teams.items = Array.from({ length: 53 }, (_, index) => ({
          ...structuredClone(template),
          teamId: `density-team-${index}`,
          teamName: `팀 ${String(index + 1).padStart(2, "0")}`,
        }));
        data.teams.totalCount = data.teams.items.length;
        const offset = Number(url.searchParams.get("offset") ?? 0);
        data.teams.items = data.teams.items.slice(offset, offset + 50);
        data.modelScatter.data.models = [
          {
            ...data.modelScatter.data.models[0],
            usingTeamCount: 53,
          },
        ];
        await route.fulfill({
          json: {
            ...data,
            teams: { ...data.teams, nextOffset: offset === 0 ? 50 : null },
          },
        });
      },
    );
    await page.goto(
      "/teams?startDate=2026-09-07&endDate=2026-09-13&compare=none",
    );
    const scatter = page.getByRole("region", {
      name: "모델별 토큰 대비 비용",
      exact: true,
    });
    await scatter.scrollIntoViewIfNeeded();
    const dot = scatter.locator("span.rounded-full[title]");
    await expect(dot).toHaveCount(1);
    const [cardBox, dotBox] = await Promise.all([
      scatter.boundingBox(),
      dot.boundingBox(),
    ]);
    expect(cardBox).not.toBeNull();
    expect(dotBox).not.toBeNull();
    expect(dotBox!.width).toBeLessThanOrEqual(40);
    expect(Math.abs(dotBox!.width - dotBox!.height)).toBeLessThan(1);
    expect(dotBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
    expect(dotBox!.y).toBeGreaterThanOrEqual(cardBox!.y);
    expect(dotBox!.x + dotBox!.width).toBeLessThanOrEqual(
      cardBox!.x + cardBox!.width,
    );
    expect(dotBox!.y + dotBox!.height).toBeLessThanOrEqual(
      cardBox!.y + cardBox!.height,
    );

    const mix = page.getByRole("region", {
      name: "팀별 벤더 비중",
      exact: true,
    });
    const viewport = mix.getByRole("group", { name: "팀별 벤더 비중 차트" });
    await viewport.scrollIntoViewIfNeeded();
    const bars = mix.getByRole("img");
    await expect(bars).toHaveCount(54); // 53 teams and the unassigned group.
    const widths = await bars.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width),
    );
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(69);
    expect(
      await viewport.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true);
    await viewport.focus();
    await page.keyboard.press("End");
    await bars.last().scrollIntoViewIfNeeded();
    expect(
      await viewport.evaluate((element) => element.scrollLeft),
    ).toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
