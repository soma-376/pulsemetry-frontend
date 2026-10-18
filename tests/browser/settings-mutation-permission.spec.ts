import { expect, test } from "./fixtures";
import example from "../../docs/api/settings-response.example.json";
import { openDashboard } from "./helpers";

// Transport faults only: a denied write must neither expose cached settings nor
// be retried when the user explicitly rechecks read access.
for (const command of ["raw", "idle", "retention"] as const) {
  for (const status of [401, 403]) {
    test(`${command} policy save ${status} stays hidden until a successful explicit read`, async ({
      page,
    }) => {
      let reads = 0;
      let writes = 0;
      let settingsFailure = false;
      let catalogFailure = false;
      let catalogReads = 0;
      let readGate: Promise<void> | null = null;
      await page.route("**/api/v1/organizations/*/settings", async (route) => {
        reads++;
        if (readGate) await readGate;
        if (settingsFailure)
          return route.fulfill({
            status: 503,
            json: {
              error: { code: "unavailable", message: "isolated read failure" },
            },
          });
        const data = structuredClone(example);
        data.meta.organizationId = new URL(route.request().url()).pathname
          .split("/organizations/")[1]
          .split("/")[0];
        return route.fulfill({ json: data });
      });
      await openDashboard(page, "/settings");
      await page.route("**/api/v1/vendor-catalog?*", (route) => {
        catalogReads++;
        return catalogFailure
          ? route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "unavailable",
                  message: "isolated catalog failure",
                },
              },
            })
          : route.fallback();
      });
      const policy = page.getByRole("region", {
        name: "수집 정책",
        exact: true,
      });
      await expect(policy).toBeVisible();
      await page.route(
        "**/api/v1/organizations/*/collection-policy",
        (route) => {
          writes++;
          return route.fulfill({
            status,
            json: {
              error: {
                code: status === 401 ? "unauthenticated" : "forbidden",
                message: "isolated denied write",
              },
            },
          });
        },
      );
      if (command === "raw") {
        await page
          .getByRole("button", { name: "프롬프트 원문 수집", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "변경사항 저장", exact: true })
          .click();
      } else if (command === "idle") {
        await page
          .getByRole("combobox", { name: "좌석 회수 기준", exact: true })
          .selectOption("30");
      } else {
        await page
          .getByRole("combobox", { name: "집계 보존", exact: true })
          .selectOption("12");
        await page
          .getByRole("dialog")
          .getByRole("button", {
            name: "기록 삭제에 동의하고 저장",
            exact: true,
          })
          .click();
      }
      await expect.poll(() => writes).toBe(1);
      await expect(policy).toHaveCount(0);
      const deniedText =
        status === 401 ? "다시 로그인해 주세요." : "관리자 권한이 필요합니다.";
      const error = page.getByRole("alert").filter({ hasText: deniedText });
      await expect(error).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);

      settingsFailure = true;
      const beforeFailedRead = reads;
      await error
        .getByRole("button", { name: "다시 조회", exact: true })
        .click();
      await expect.poll(() => reads).toBeGreaterThan(beforeFailedRead);
      await expect(error).toContainText("서버에 연결하지 못했습니다.");
      await expect(policy).toHaveCount(0);

      settingsFailure = false;
      catalogFailure = true;
      const beforeFailedCatalog = catalogReads;
      await error
        .getByRole("button", { name: "다시 조회", exact: true })
        .click();
      await expect
        .poll(() => catalogReads)
        .toBeGreaterThan(beforeFailedCatalog);
      await expect(
        error.getByRole("button", { name: "조회 중…", exact: true }),
      ).toBeVisible();
      await expect(
        error.getByRole("button", { name: "다시 조회", exact: true }),
      ).toBeEnabled();
      await expect(error).toContainText("서버에 연결하지 못했습니다.");
      await expect(policy).toHaveCount(0);

      catalogFailure = false;
      let release!: () => void;
      readGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const beforeSuccessfulRead = reads;
      try {
        await page
          .getByRole("toolbar", { name: "공통 조회 도구" })
          .getByRole("button", { name: "새로고침", exact: true })
          .click();
        await expect.poll(() => reads).toBeGreaterThan(beforeSuccessfulRead);
        await expect(error).toBeVisible();
        await expect(policy).toHaveCount(0);
        await expect(
          page
            .getByRole("toolbar", { name: "공통 조회 도구" })
            .getByRole("button", { name: "조회 중…", exact: true }),
        ).toBeVisible();
      } finally {
        readGate = null;
        release();
      }
      await expect(error).toHaveCount(0);
      await expect(policy).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("combobox", { name: "좌석 회수 기준", exact: true }),
      ).toHaveValue("14");
      await expect(
        page.getByRole("combobox", { name: "집계 보존", exact: true }),
      ).toHaveValue("24");
      expect(writes).toBe(1);
    });
  }
}
