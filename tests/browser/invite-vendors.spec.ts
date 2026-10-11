import { expect, authenticatedTest as test } from "./fixtures";
import { mockMembers } from "./members-fixture";
import { completedOnboarding, fixtureOrg } from "./session-fixture";
import settings from "../../docs/api/settings-response.example.json";

// 실제 좌석 API는 호출하지 않는다. 제품 선택은 초대 요청과 구성원 PATCH의 별도 필드다.
const products = [
  {
    ...settings.vendors.items[0],
    vendorId: "claude-planned",
    displayName: "Claude",
  },
  {
    ...settings.vendors.items[0],
    vendorId: "cursor-planned",
    displayName: "Cursor",
  },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/organizations/*/settings", (route) =>
    route.fulfill({
      json: {
        ...settings,
        meta: { ...settings.meta, organizationId: fixtureOrg },
        vendors: { items: products, totalCount: 2, nextCursor: null },
      },
    }),
  );
});

test("초대의 기본 복수 선택·개인별 해제·기본값 복원과 상세 재수정을 저장한다", async ({
  page,
}) => {
  const api = await mockMembers(page, { invitations: [] });
  await page.route("**/api/v1/organizations/*/onboarding", (route) =>
    route.fulfill({ json: completedOnboarding }),
  );
  await page.goto("/members");
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  const defaults = dialog.getByRole("group", {
    name: "사용 예정 제품 (선택)",
    exact: true,
  });
  await defaults.getByRole("checkbox", { name: "Claude", exact: true }).check();
  await defaults.getByRole("checkbox", { name: "Cursor", exact: true }).check();
  for (const email of ["one@example.test", "two@example.test"]) {
    await dialog.getByRole("textbox", { name: "초대할 이메일" }).fill(email);
    await dialog.getByRole("textbox", { name: "초대할 이메일" }).press("Enter");
  }
  const second = dialog.getByRole("group", {
    name: "two@example.test 사용 예정 제품",
    exact: true,
  });
  await second.getByRole("checkbox", { name: "Claude", exact: true }).uncheck();
  await second.getByRole("checkbox", { name: "Cursor", exact: true }).uncheck();
  await dialog
    .getByRole("button", { name: "기본 선택 사용", exact: true })
    .click();
  await expect(
    second.getByRole("checkbox", { name: "Claude", exact: true }),
  ).toBeChecked();
  await second.getByRole("checkbox", { name: "Claude", exact: true }).uncheck();
  await second.getByRole("checkbox", { name: "Cursor", exact: true }).uncheck();
  await dialog
    .getByRole("button", { name: "2명 초대 코드 발급", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("초대 코드 2건");
  const request = api.commands.find(
    (command) => command.path === "invitations/batch",
  )!;
  expect((request.body as { invitations: unknown[] }).invitations).toEqual([
    {
      email: "one@example.test",
      teamId: null,
      role: "member",
      plannedVendorIds: ["claude-planned", "cursor-planned"],
    },
    { email: "two@example.test", teamId: null, role: "member" },
  ]);
  await dialog.getByRole("button", { name: "완료", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "one@example.test 초대 팀/역할 수정" })
    .click();
  const drawer = page.getByRole("dialog", { name: "구성원 상세" });
  const picked = drawer.getByRole("group", {
    name: "사용 예정 제품 (선택)",
    exact: true,
  });
  await expect(
    picked.getByRole("checkbox", { name: "Claude", exact: true }),
  ).toBeChecked();
  await picked.getByRole("checkbox", { name: "Cursor", exact: true }).uncheck();
  await drawer
    .getByRole("button", { name: "변경사항 저장", exact: true })
    .click();
  await expect(drawer).not.toBeVisible();
  expect(
    api.commands.filter((command) => command.method === "PATCH").at(-1)?.body,
  ).toEqual({ expectedVersion: 1, plannedVendorIds: ["claude-planned"] });
  expect(
    api.invitations.find(
      (invitation) => invitation.email === "one@example.test",
    )?.plannedVendorIds,
  ).toEqual(["claude-planned"]);
  expect(api.commands.some((command) => command.path.includes("/seats"))).toBe(
    false,
  );
});

test("온보딩에서도 등록한 제품을 선택하여 초대한다", async ({ page }) => {
  const api = await mockMembers(page, { invitations: [] });
  await page.route("**/api/v1/organizations/*/onboarding", (route) =>
    route.fulfill({
      json: {
        ...completedOnboarding,
        completed: false,
        completedAt: null,
        nextStep: "team",
      },
    }),
  );
  await page.goto("/onboarding");
  const section = page.getByRole("region", {
    name: "구성원 초대",
    exact: true,
  });
  await section.getByRole("checkbox", { name: "Cursor", exact: true }).check();
  await section
    .getByRole("textbox", { name: "초대할 이메일" })
    .fill("onboard@example.test");
  await section.getByRole("textbox", { name: "초대할 이메일" }).press("Enter");
  await section
    .getByRole("button", { name: "1명 초대 코드 발급", exact: true })
    .click();
  await expect(section.getByRole("status")).toContainText("초대 코드 1건");
  expect(
    (
      api.commands.find((command) => command.path === "invitations/batch")!
        .body as { invitations: { plannedVendorIds: string[] }[] }
    ).invitations[0].plannedVendorIds,
  ).toEqual(["cursor-planned"]);
});

test("제품 조회 실패는 빈 목록으로 표시하지 않고 재시도한다", async ({
  page,
}) => {
  await mockMembers(page);
  let failed = true;
  await page.route("**/api/v1/organizations/*/settings", (route) =>
    failed
      ? route.fulfill({
          status: 403,
          json: { error: { code: "forbidden", message: "denied" } },
        })
      : route.fallback(),
  );
  await page.route("**/api/v1/organizations/*/onboarding", (route) =>
    route.fulfill({ json: completedOnboarding }),
  );
  await page.goto("/members");
  await page.getByRole("button", { name: "구성원 초대", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "구성원 초대" });
  await expect(dialog).toContainText("제품 목록을 불러오지 못했습니다.");
  await expect(dialog).not.toContainText("등록된 제품이 없습니다.");
  failed = false;
  await dialog.getByRole("button", { name: "다시 조회" }).click();
  await expect(
    dialog.getByRole("checkbox", { name: "Claude", exact: true }),
  ).toBeVisible();
});
