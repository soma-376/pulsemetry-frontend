import { expect, authenticatedTest as test } from "./fixtures";
import { mockMembers } from "./members-fixture";
import { completedOnboarding } from "./session-fixture";

for (const surface of ["modal", "onboarding"] as const) {
  test(`invitation ${surface} double click sends one batch and preserves a failed draft`, async ({
    page,
  }) => {
    const api = await mockMembers(page, { invitations: [] });
    await page.route("**/api/v1/organizations/*/onboarding", (route) =>
      route.fulfill({
        json:
          surface === "onboarding"
            ? {
                ...completedOnboarding,
                completed: false,
                completedAt: null,
                nextStep: "team",
              }
            : completedOnboarding,
      }),
    );
    let attempts = 0;
    let fail = true;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/api/bff/enrollment/api/v1/organizations/*/invitations/batch",
      async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        attempts++;
        if (!fail) return route.fallback();
        await pending;
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: "unavailable",
              message: "Isolated invitation batch test failure",
            },
          },
        });
      },
    );
    await page.goto(surface === "modal" ? "/members" : "/onboarding");
    if (surface === "modal")
      await page
        .getByRole("button", { name: "구성원 초대", exact: true })
        .click();
    const form = page.getByRole(surface === "modal" ? "dialog" : "region", {
      name: "구성원 초대",
      exact: true,
    });
    const email = "batch-lock@example.test";
    const input = form.getByRole("textbox", { name: "초대할 이메일" });
    await input.fill(email);
    await input.press("Enter");
    const submit = form.getByRole("button", {
      name: "1명 초대 코드 발급",
      exact: true,
    });
    try {
      await submit.dblclick();
      await expect.poll(() => attempts).toBeGreaterThan(0);
      await expect(input).toBeDisabled();
      await expect(
        form.getByRole("combobox", { name: "팀", exact: true }),
      ).toBeDisabled();
      if (surface === "modal") {
        await form.getByRole("button", { name: "닫기", exact: true }).click();
        await expect(form).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(form).toBeVisible();
      }
      await expect.poll(() => attempts).toBe(1);
    } finally {
      release();
    }
    await expect(form.getByRole("alert")).toContainText(
      "서버에 연결하지 못했습니다",
    );
    await expect(
      form.getByRole("button", { name: `${email} 제거` }),
    ).toBeVisible();
    await expect(input).toBeEnabled();
    fail = false;
    await submit.click();
    await expect(form.getByRole("status")).toContainText("초대 코드 1건");
    expect(attempts).toBe(2);
    expect(
      api.commands.filter((command) => command.path === "invitations/batch"),
    ).toHaveLength(1);
  });
}
