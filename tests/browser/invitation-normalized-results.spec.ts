import { expect, authenticatedTest as test } from "./fixtures";
import { mockMembers } from "./members-fixture";
import { completedOnboarding } from "./session-fixture";

test("normalized duplicate invitation results remain distinct without React key errors", async ({
  page,
}) => {
  await mockMembers(page, { invitations: [] });
  await page.route("**/api/v1/organizations/*/onboarding", (route) =>
    route.fulfill({ json: completedOnboarding }),
  );
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route(
    "**/api/bff/enrollment/api/v1/organizations/*/invitations/batch",
    (route) =>
      route.fulfill({
        json: {
          results: [
            {
              email: "owner@example.test",
              invitationId: null,
              status: "already_member",
              reason: null,
              code: null,
              expiresAt: null,
              delivery: null,
            },
            {
              email: "owner@example.test",
              invitationId: null,
              status: "rejected",
              reason: "duplicate_email",
              code: null,
              expiresAt: null,
              delivery: null,
            },
          ],
        },
      }),
  );
  await page.goto("/members");
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  const form = page.getByRole("dialog", { name: "구성원 초대", exact: true });
  const input = form.getByRole("textbox", { name: "초대할 이메일" });
  for (const email of ["owner@example.test", "Owner@example.test"]) {
    await input.fill(email);
    await input.press("Enter");
  }
  await form
    .getByRole("button", { name: "2명 초대 코드 발급", exact: true })
    .click();
  const results = form.getByRole("list", { name: "초대 코드 발급 결과" });
  await expect(results.getByRole("listitem")).toHaveCount(2);
  await expect(results.getByRole("listitem").nth(0)).toContainText(
    "이미 구성원입니다",
  );
  await expect(results.getByRole("listitem").nth(1)).toContainText(
    "같은 이메일이 두 번 들어 있습니다",
  );
  expect(
    errors.filter((message) => /same key|unique.*key/i.test(message)),
  ).toEqual([]);
});
