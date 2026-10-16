import { expect, test } from "./fixtures";
import { saveOnboardingContract, signIn } from "./helpers";
import { serveSettings } from "./onboarding-fixture";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("온보딩 완료가 진행되는 동안 하위 명령을 잠그고 실패하면 초안을 복구한다", async ({
  page,
}, testInfo) => {
  serveSettings(page);
  await page.goto("/login");
  await signIn(page);
  await page.getByRole("radio", { name: /^수집하지 않음/ }).check();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await saveOnboardingContract(page);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "현재 팀 · 1개", exact: true }),
  ).toBeVisible();

  const teamName = page.getByLabel("팀 이름", { exact: true });
  const email = page.getByRole("textbox", { name: "초대할 이메일" });
  const create = page.getByRole("button", { name: "팀 생성", exact: true });
  const remove = page.getByRole("button", {
    name: "서버 팀 팀 제거",
    exact: true,
  });
  const invite = page.getByRole("button", {
    name: "1명 초대 코드 발급",
    exact: true,
  });
  await teamName.fill("완료 중 보존할 팀");
  await email.fill("admin@seed-a.example.test");
  await email.press("Enter");
  await expect(create).toBeEnabled();
  await expect(invite).toBeEnabled();

  const completion = gate();
  const started = gate();
  const done = gate();
  let completionRequests = 0;
  let childRequests = 0;
  const events: string[] = [];
  let pending: Record<string, unknown> | undefined;
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      /\/organizations\/[^/]+\/(teams(?:\/[^/]+)?|invitations\/batch)$/.test(
        new URL(request.url()).pathname,
      )
    ) {
      childRequests++;
    }
  });
  await page.route(
    "**/api/v1/organizations/*/onboarding/complete",
    async (route) => {
      completionRequests++;
      events.push("completion:held");
      started.release();
      try {
        await completion.promise;
        events.push("completion:released-as-conflict");
        await route.fulfill({
          status: 409,
          json: {
            error: {
              code: "onboarding_incomplete",
              message: "Required onboarding settings are incomplete.",
            },
          },
        });
      } finally {
        done.release();
      }
    },
  );
  try {
    await page.getByRole("button", { name: "완료", exact: true }).click();
    await started.promise;
    await expect(
      page.getByRole("button", { name: "저장 중…", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "건너뛰고 시작", exact: true }),
    ).toBeDisabled();
    pending = {
      teamNameDisabled: await teamName.isDisabled(),
      createDisabled: await create.isDisabled(),
      removeDisabled: await remove.isDisabled(),
      emailDisabled: await email.isDisabled(),
      inviteDisabled: await invite.isDisabled(),
      completionRequests,
      childRequests,
    };
    await page.screenshot({
      path: testInfo.outputPath("completion-pending-child-controls.png"),
      fullPage: true,
    });
    expect(pending).toEqual({
      teamNameDisabled: true,
      createDisabled: true,
      removeDisabled: true,
      emailDisabled: true,
      inviteDisabled: true,
      completionRequests: 1,
      childRequests: 0,
    });

    completion.release();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "수집 정책을 저장하고 벤더를 하나 이상 등록하세요.",
    );
    await expect(teamName).toHaveValue("완료 중 보존할 팀");
    await expect(
      page.getByRole("button", {
        name: "admin@seed-a.example.test 제거",
        exact: true,
      }),
    ).toBeVisible();
    for (const control of [teamName, create, remove, email, invite]) {
      await expect(control).toBeEnabled();
    }
    await expect(
      page.getByRole("button", { name: "완료", exact: true }),
    ).toBeEnabled();
    expect(completionRequests).toBe(1);
    expect(childRequests).toBe(0);
    events.push("completion-failed-drafts-preserved-controls-unlocked");
  } finally {
    completion.release();
    if (completionRequests) await done.promise;
    await testInfo.attach("completion-child-command-lock", {
      body: JSON.stringify(
        { events, pending, completionRequests, childRequests },
        null,
        2,
      ),
      contentType: "application/json",
    });
  }
});

for (const first of ["invitation", "team"] as const) {
  test(`온보딩에서 ${first}만 먼저 끝나도 다른 저장이 끝날 때까지 이동을 잠근다`, async ({
    page,
  }, testInfo) => {
    // Existing API-contract fixtures keep both requests local to this browser.
    // This is a pending-order regression, not a real telemetry/backend claim.
    serveSettings(page);
    await page.goto("/login");
    await signIn(page);
    await page.getByRole("radio", { name: /^수집하지 않음/ }).check();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await saveOnboardingContract(page);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "현재 팀 · 1개", exact: true }),
    ).toBeVisible();

    const team = gate();
    const invitation = gate();
    const teamStarted = gate();
    const invitationStarted = gate();
    const teamDone = gate();
    const invitationDone = gate();
    const events: string[] = [];
    let teamRequests = 0;
    let invitationRequests = 0;
    let completeRequests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/onboarding/complete")) completeRequests++;
    });
    await page.route("**/api/v1/organizations/*/teams", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      teamRequests++;
      events.push("team:held");
      teamStarted.release();
      try {
        await team.promise;
        events.push("team:released");
        await route.fallback();
      } finally {
        teamDone.release();
      }
    });
    await page.route(
      "**/api/v1/organizations/*/invitations/batch",
      async (route) => {
        invitationRequests++;
        events.push("invitation:held");
        invitationStarted.release();
        try {
          await invitation.promise;
          events.push("invitation:released");
          const entries = route.request().postDataJSON().invitations;
          expect(entries).toEqual([
            {
              email: "admin@seed-a.example.test",
              teamId: null,
              role: "member",
            },
          ]);
          await route.fulfill({
            json: {
              results: [
                {
                  email: entries[0].email,
                  status: "already_member",
                  invitationId: null,
                  reason: null,
                  expiresAt: null,
                  code: null,
                  delivery: null,
                },
              ],
            },
          });
        } finally {
          invitationDone.release();
        }
      },
    );

    const previous = page.getByRole("button", { name: "이전", exact: true });
    const skip = page.getByRole("button", {
      name: "건너뛰고 시작",
      exact: true,
    });
    const complete = page.getByRole("button", { name: "완료", exact: true });
    let midFlight: Record<string, unknown> | undefined;
    try {
      await page.getByLabel("팀 이름", { exact: true }).fill("동시 저장 팀");
      const email = page.getByRole("textbox", { name: "초대할 이메일" });
      await email.fill("admin@seed-a.example.test");
      await email.press("Enter");
      await page.getByRole("button", { name: "팀 생성", exact: true }).click();
      await teamStarted.promise;
      await expect(previous).toBeDisabled();
      await page
        .getByRole("button", { name: "1명 초대 코드 발급", exact: true })
        .click();
      await invitationStarted.promise;
      await expect(skip).toBeDisabled();
      await expect(complete).toBeDisabled();

      if (first === "invitation") {
        invitation.release();
        await expect(page.getByLabel("초대 코드 발급 결과")).toContainText(
          "이미 구성원입니다",
        );
        await expect(
          page.getByRole("button", { name: "저장 중…", exact: true }),
        ).toHaveAttribute("aria-busy", "true");
      } else {
        team.release();
        await expect(
          page.getByText("동시 저장 팀 팀을 만들었습니다", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "발급 중…", exact: true }),
        ).toHaveAttribute("aria-busy", "true");
      }
      midFlight = {
        first,
        previousDisabled: await previous.isDisabled(),
        skipDisabled: await skip.isDisabled(),
        completeDisabled: await complete.isDisabled(),
        teamRequests,
        invitationRequests,
        completeRequests,
      };
      events.push("first-result-rendered-other-command-still-held");
      await page.screenshot({
        path: testInfo.outputPath("mid-flight-footer.png"),
        fullPage: true,
      });
      expect(midFlight).toEqual({
        first,
        previousDisabled: true,
        skipDisabled: true,
        completeDisabled: true,
        teamRequests: 1,
        invitationRequests: 1,
        completeRequests: 0,
      });

      team.release();
      invitation.release();
      await expect(previous).toBeEnabled();
      await expect(skip).toBeEnabled();
      await expect(complete).toBeEnabled();
      await expect(page.getByLabel("팀 이름", { exact: true })).toHaveValue("");
      await expect(page.getByLabel("초대 코드 발급 결과")).toContainText(
        "이미 구성원입니다",
      );
    } finally {
      team.release();
      invitation.release();
      if (teamRequests) await teamDone.promise;
      if (invitationRequests) await invitationDone.promise;
      await testInfo.attach("concurrent-onboarding-command-order", {
        body: JSON.stringify({ events, midFlight }, null, 2),
        contentType: "application/json",
      });
    }
  });
}
