import { expect, test, type Page } from "./fixtures";
import { openDashboard } from "./helpers";
import { mockMembers } from "./members-fixture";
import { fixtureUser } from "./session-fixture";

// Isolated lifecycle injection. Actual Chrome tab switching is verified separately.
async function visibility(page: Page, state: DocumentVisibilityState) {
  await page.evaluate((next) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => next,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

for (const status of [200, 503]) {
  for (const order of ["mutation-first", "confirmation-first"] as const) {
    test(`same-account tab return preserves pending member save ${status} (${order})`, async ({
      page,
    }) => {
      const api = await mockMembers(page);
      const target = api.members.find(
        (member) => member.role === "member" && member.periodUsage,
      )!;
      await openDashboard(page, "/members");
      await page
        .getByRole("textbox", { name: "구성원 검색" })
        .fill(target.account);
      await page
        .getByRole("button", {
          name: `${target.account} 구성원 상세`,
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "구성원 상세",
        exact: true,
      });
      const team = dialog.getByLabel("팀", { exact: true });
      const destination =
        target.team.teamId === "team-data" ? "team-platform" : "team-data";
      await team.selectOption(destination);
      let releaseMutation!: () => void;
      let releaseConfirmation!: () => void;
      const pendingMutation = new Promise<void>(
        (resolve) => (releaseMutation = resolve),
      );
      const pendingConfirmation = new Promise<void>(
        (resolve) => (releaseConfirmation = resolve),
      );
      let mutations = 0;
      let confirmations = 0;
      let mutationResponseSent = false;
      await page.route(
        "**/api/bff/enrollment/api/v1/organizations/*/members/*",
        async (route) => {
          if (route.request().method() !== "PATCH") return route.fallback();
          const attempt = ++mutations;
          await pendingMutation;
          if (status === 503 && attempt === 1) {
            await route.fulfill({
              status,
              json: {
                error: { code: "unavailable", message: "isolated failure" },
              },
            });
          } else await route.fallback();
          mutationResponseSent = true;
        },
      );
      await page.route("**/api/bff/auth/session", async (route) => {
        confirmations++;
        await pendingConfirmation;
        await route.fulfill({ json: { user: fixtureUser } });
      });
      try {
        await dialog
          .getByRole("button", { name: "변경사항 저장", exact: true })
          .click();
        await expect.poll(() => mutations).toBe(1);
        await visibility(page, "hidden");
        await visibility(page, "visible");
        await expect.poll(() => confirmations).toBeGreaterThan(0);
        await expect(dialog).toBeHidden();
        if (order === "mutation-first") {
          releaseMutation();
          await expect.poll(() => mutationResponseSent).toBe(true);
          await expect(
            page.getByRole("dialog", {
              name: "구성원 상세",
              exact: true,
              includeHidden: true,
            }),
          ).toBeAttached();
          await expect(dialog).toBeHidden();
          releaseConfirmation();
        } else {
          releaseConfirmation();
          await expect(dialog).toBeVisible();
          await expect(team).toHaveValue(destination);
          await expect(team).toBeDisabled();
          releaseMutation();
        }
        if (status === 503) {
          await expect(dialog.getByRole("alert")).toContainText(
            "서버에 연결하지 못했습니다",
          );
          await expect(dialog).not.toContainText("계정이 변경되었습니다");
          await expect(team).toHaveValue(destination);
          await expect(team).toBeEnabled();
          await dialog
            .getByRole("button", { name: "변경사항 저장", exact: true })
            .click();
        }
        await expect(dialog).not.toBeVisible();
        expect(target.team.teamId).toBe(destination);
        expect(mutations).toBe(status === 503 ? 2 : 1);
        expect(
          api.commands.filter((command) => command.method === "PATCH"),
        ).toHaveLength(1);
      } finally {
        releaseMutation();
        releaseConfirmation();
      }
    });
  }
}
