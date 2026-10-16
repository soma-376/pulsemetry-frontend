import { expect, test, authenticatedTest } from "./fixtures";
import { mockAuthenticatedRoutes } from "./session-fixture";
import { mockOverview } from "./overview-fixture";

// 환경 분기만 검증하는 격리 회귀다. 실제 Chrome·수집 데이터 검증을 대체하지 않는다.
for (const systemTheme of ["light", "dark"] as const) {
  test(`system ${systemTheme} initializes the page and follows changes until a user selects a theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: systemTheme });
    await page.goto("/login");
    const html = page.locator("html");
    await expect(
      page.getByRole("heading", { name: "회사 계정으로 로그인" }),
    ).toBeVisible();
    await expect(html).toHaveAttribute("data-theme", systemTheme);
    await expect(html).toHaveCSS("color-scheme", systemTheme);
    expect(
      await page.evaluate(() => localStorage.getItem("pulsemetry.theme")),
    ).toBeNull();

    const changed = systemTheme === "light" ? "dark" : "light";
    await page.emulateMedia({ colorScheme: changed });
    await expect(html).toHaveAttribute("data-theme", changed);
    await page.getByRole("switch").click();
    await expect(html).toHaveAttribute("data-theme", systemTheme);
    await page.emulateMedia({ colorScheme: systemTheme });
    await page.emulateMedia({ colorScheme: changed });
    await expect(html).toHaveAttribute("data-theme", systemTheme);
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", systemTheme);
  });
}

test("theme read/write denial preserves the current-tab toggle and page", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    const storage = window.localStorage;
    for (const method of ["getItem", "setItem"] as const) {
      const original = Object.getOwnPropertyDescriptor(
        Storage.prototype,
        method,
      )!;
      Object.defineProperty(Storage.prototype, method, {
        ...original,
        value: function (this: Storage, key: string, ...args: string[]) {
          if (this === storage && key === "pulsemetry.theme") {
            throw new Error("isolated theme storage denial");
          }
          return original.value.call(this, key, ...args);
        },
      });
    }
  });
  await page.goto("/login");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.getByRole("switch", { name: "다크 테마로 전환" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.getByRole("switch", { name: "라이트 테마로 전환" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("textbox", { name: "회사 이메일" }),
  ).toBeEditable();
  expect(failures).toEqual([]);
});

authenticatedTest(
  "offline refresh preserves cached data, pauses retry, and recovers online",
  async ({ page, context }) => {
    await mockOverview(page);
    await page.goto("/overview");
    const users = page.getByRole("region", { name: "사용자 수", exact: true });
    await expect(users).toBeVisible();
    const before = await users.innerText();
    await context.setOffline(true);
    await page.getByRole("button", { name: "새로고침", exact: true }).click();
    const notice = page.getByRole("status", {
      name: "데이터 갱신 상태",
      exact: true,
    });
    await expect(notice).toContainText("연결을 기다리고 있습니다");
    await expect(
      notice.getByRole("button", { name: "다시 조회", exact: true }),
    ).toBeDisabled();
    await expect(users).toHaveText(before, { useInnerText: true });
    await context.setOffline(false);
    await expect(notice).toHaveCount(0);
    await expect(users).toHaveText(before, { useInnerText: true });
  },
);

authenticatedTest(
  "reduced motion disables loading pulses while data still loads",
  async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockOverview(page);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/analytics/overview?*", async (route) => {
      await held;
      await route.fallback();
    });
    await page.goto("/overview");
    const pulse = page.locator('[class*="motion-safe:animate-pulse"]');
    await expect(pulse.first()).toBeVisible();
    const animations = await pulse.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).animationName),
    );
    expect(animations.length).toBeGreaterThan(5);
    expect(animations.every((name) => name === "none")).toBe(true);
    release();
    await expect(
      page.getByRole("region", { name: "사용자 수", exact: true }),
    ).toBeVisible();
    await expect(pulse).toHaveCount(0);
  },
);

authenticatedTest(
  "auto refresh synchronizes between real pages in the same browser context",
  async ({ page, context }) => {
    await mockOverview(page);
    await page.goto("/overview");
    const second = await context.newPage();
    await mockAuthenticatedRoutes(second);
    await mockOverview(second);
    await second.goto("/overview");
    const firstToggle = page.getByRole("button", {
      name: "자동 갱신 5분",
      exact: true,
    });
    const secondToggle = second.getByRole("button", {
      name: "자동 갱신 5분",
      exact: true,
    });
    await expect(firstToggle).toHaveAttribute("aria-pressed", "false");
    await expect(secondToggle).toHaveAttribute("aria-pressed", "false");
    await firstToggle.click();
    await expect(secondToggle).toHaveAttribute("aria-pressed", "true");
    await secondToggle.click();
    await expect(firstToggle).toHaveAttribute("aria-pressed", "false");
    await second.close();
  },
);
