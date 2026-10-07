import { expect, test } from "./fixtures";
import { saveOnboardingContract, signIn } from "./helpers";
import { mockMembers } from "./members-fixture";

test("onboarding and team management reject emoji names and keep teams on the server", async ({
  page,
}) => {
  const api = await mockMembers(page);
  const teamCommands = () =>
    api.commands.filter((command) => command.path.startsWith("teams"));
  await page.goto("/login");
  await signIn(page);
  await page.getByRole("radio", { name: /^수집하지 않음/ }).check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await saveOnboardingContract(page);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const name = page.getByRole("textbox", { name: "팀 이름", exact: true });
  await name.fill("개발팀🚀");
  await page.getByRole("button", { name: "팀 생성", exact: true }).click();
  await expect(name).toHaveValue("개발팀🚀");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(/이모지와 허용되지 않은 문자/);
  await expect(
    page.getByRole("list", { name: "온보딩 팀 목록" }),
  ).not.toContainText("개발팀🚀");
  expect(teamCommands()).toHaveLength(0);
  await name.fill("R&D");
  await page.getByRole("button", { name: "팀 생성", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "온보딩 팀 목록" }),
  ).toContainText("R&D");
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await page.getByRole("link", { name: "구성원", exact: true }).click();
  await page.getByRole("button", { name: "팀 관리", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "팀 관리", exact: true });
  const list = drawer.getByRole("list", { name: "팀 목록" });
  // 온보딩에서 만든 팀이 같은 서버 목록에 있다.
  await expect(
    list.getByRole("button", { name: "R&D 팀 수정", exact: true }),
  ).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(4);

  // 이름 검증은 서버에 보내기 전에 한다.
  await list.getByRole("button", { name: "R&D 팀 수정", exact: true }).click();
  const editName = drawer.getByRole("textbox", {
    name: "팀 이름",
    exact: true,
  });
  await expect(editName).toHaveValue("R&D");
  await editName.fill("팀👩‍💻");
  await drawer.getByRole("button", { name: "변경 저장", exact: true }).click();
  await expect(editName).toHaveAttribute("aria-invalid", "true");
  expect(teamCommands()).toHaveLength(1);
  await drawer.getByRole("button", { name: "취소", exact: true }).click();
  await expect(
    list.getByRole("button", { name: "R&D 팀 수정", exact: true }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "팀 만들기", exact: true }).click();
  await editName.fill("---");
  await drawer.getByRole("button", { name: "팀 생성", exact: true }).click();
  await expect(editName).toHaveAccessibleDescription(/하나 이상 포함/);
  // 같은 이름은 서버가 거절한다. 입력은 그대로 둔다.
  await editName.fill("플랫폼");
  await drawer.getByRole("button", { name: "팀 생성", exact: true }).click();
  await expect(editName).toHaveAccessibleDescription(
    /같은 이름의 팀이 있습니다/,
  );
  await expect(editName).toHaveValue("플랫폼");
  await editName.fill("AI/ML");
  await drawer.getByRole("button", { name: "팀 생성", exact: true }).click();
  await expect(
    list.getByRole("button", { name: "AI/ML 팀 수정", exact: true }),
  ).toBeVisible();
  await expect(drawer.getByRole("status")).toContainText(
    "AI/ML 팀을 저장했습니다",
  );
  const created = api.teams.find((team) => team.teamName === "AI/ML")!;
  expect(teamCommands().at(-1)).toMatchObject({
    method: "POST",
    path: "teams",
    body: { teamName: "AI/ML" },
  });
  expect(teamCommands().at(-1)!.idempotencyKey).toMatch(
    /^[A-Za-z0-9_-]{8,128}$/,
  );

  // 이름 변경은 목록이 준 version을 보낸다.
  await list
    .getByRole("button", { name: "AI/ML 팀 수정", exact: true })
    .click();
  await editName.fill("AI Lab");
  await drawer.getByRole("button", { name: "변경 저장", exact: true }).click();
  await expect(
    list.getByRole("button", { name: "AI Lab 팀 수정", exact: true }),
  ).toBeVisible();
  expect(teamCommands().at(-1)).toMatchObject({
    method: "PATCH",
    path: `teams/${created.teamId}`,
    body: { teamName: "AI Lab", expectedVersion: 1 },
  });

  // 다른 곳에서 이름이 바뀐 팀은 덮어쓰지 않는다. 최신 이름을 읽은 뒤에 고친다.
  await list
    .getByRole("button", { name: "AI Lab 팀 수정", exact: true })
    .click();
  created.teamName = "AI 연구";
  created.version += 1;
  await editName.fill("AI Platform");
  await drawer.getByRole("button", { name: "변경 저장", exact: true }).click();
  await expect(editName).toHaveAccessibleDescription(
    /다른 곳에서 변경되었습니다/,
  );
  expect(created.teamName).toBe("AI 연구");
  await drawer
    .getByRole("button", { name: "최신 내용 불러오기", exact: true })
    .click();
  await expect(editName).toHaveValue("AI 연구");
  await editName.fill("AI Platform");
  await drawer.getByRole("button", { name: "변경 저장", exact: true }).click();
  await expect(
    list.getByRole("button", { name: "AI Platform 팀 수정", exact: true }),
  ).toBeVisible();
  expect(teamCommands().at(-1)).toMatchObject({
    method: "PATCH",
    body: { teamName: "AI Platform", expectedVersion: 3 },
  });

  // 삭제는 한 번 더 확인하고 If-Match로 보낸다. 그 팀의 구성원은 미배정이 된다.
  const before = api.members.filter(
    (member) => member.team.teamId === "team-data",
  ).length;
  expect(before).toBeGreaterThan(0);
  await list
    .getByRole("button", { name: "데이터 팀 수정", exact: true })
    .click();
  await expect(drawer.getByRole("region", { name: "팀 삭제" })).toContainText(
    `현재 구성원 ${before}명이 미배정이 됩니다`,
  );
  await drawer.getByRole("button", { name: "팀 삭제", exact: true }).click();
  await drawer.getByRole("button", { name: "되돌리기", exact: true }).click();
  expect(teamCommands().some((command) => command.method === "DELETE")).toBe(
    false,
  );
  await drawer.getByRole("button", { name: "팀 삭제", exact: true }).click();
  await drawer
    .getByRole("button", { name: "팀 삭제 확인", exact: true })
    .click();
  await expect(drawer.getByRole("status")).toContainText(
    "데이터 팀을 삭제했습니다",
  );
  await expect(
    list.getByRole("button", { name: "데이터 팀 수정", exact: true }),
  ).toHaveCount(0);
  expect(teamCommands().at(-1)).toMatchObject({
    method: "DELETE",
    path: "teams/team-data",
    ifMatch: '"team-1"',
  });
  await drawer.getByRole("button", { name: "상세 패널 닫기" }).click();
  await expect(
    page.getByRole("group", { name: "팀 미배정", exact: true }),
  ).toContainText(`${5 + before}명`);
});
