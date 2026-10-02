import { expect, test, type Page, type Route } from "@playwright/test";
import example from "../../docs/api/settings-response.example.json";
import { openDashboard } from "./helpers";

/**
 * 정책 적용 현황이 판정 근거를 구분해 말하는지(UI 테스트). 서버 명세("정책 적용 현황과 업데이트 안내")의 근거 셋 —
 * 최근 설치 보고·적용 확인 기록·근거 없음 — 을 흉내 낸 응답을 쓴다. 실제 서버 검증은 tests/e2e/ingest-and-rollout.spec.ts 가 한다.
 */
const row = (id: string, account: string, version: number | null, evidence: "heartbeat" | "applied_confirmation" | "none", at: { heartbeat?: string; confirmed?: string }) => ({
  installationId: id, memberId: `m-${id}`, account, team: { teamId: null, teamName: "미배정" }, agentVersion: "0.2.0", appliedPolicyVersion: version,
  lastHeartbeatAt: at.heartbeat ?? null, canNotify: false, appliedEvidence: evidence, appliedConfirmedAt: at.confirmed ?? null,
});
const ROWS = {
  applied: [
    row("aaaaaaaa-0000-4000-8000-000000000001", "reported@example.test", 4, "heartbeat", { heartbeat: "2026-09-30T15:00:00Z" }),
    row("aaaaaaaa-0000-4000-8000-000000000002", "confirmed@example.test", 4, "applied_confirmation", { confirmed: "2026-08-16T15:00:00Z" }),
  ],
  outdated: [row("aaaaaaaa-0000-4000-8000-000000000003", "old@example.test", 3, "applied_confirmation", { confirmed: "2026-07-01T15:00:00Z" })],
  unknown: [] as ReturnType<typeof row>[],
};

async function mockRollout(page: Page, evidence: { heartbeat: number; appliedConfirmation: number; none: number }) {
  const cors = { "access-control-allow-origin": new URL(test.info().project.use.baseURL!).origin, "access-control-allow-headers": "content-type,authorization" };
  const json = (route: Route, value: unknown) => route.fulfill({ headers: cors, json: value });
  await page.route("**/api/v1/organizations/*/settings", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const data = structuredClone(example);
    data.meta.organizationId = new URL(route.request().url()).pathname.split("/")[4];
    return json(route, { ...data, policyRollout: { ...data.policyRollout, evidence } });
  });
  await page.route("**/api/v1/organizations/*/installations?*", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(route.request().url());
    const items = ROWS[url.searchParams.get("policyStatus") as keyof typeof ROWS];
    return json(route, { meta: { organizationId: url.pathname.split("/")[4], snapshotId: "snap" }, desiredPolicyVersion: 4,
      installations: { items, totalCount: items.length, nextCursor: null } });
  });
}

test("설정의 적용 현황은 판정 근거별 수를 말하고, 목록은 행마다 근거와 그 시각을 보인다", async ({ page }) => {
  await mockRollout(page, { heartbeat: 1, appliedConfirmation: 2, none: 0 });
  await openDashboard(page, "/settings");
  await expect(page.getByText("적용 2대 · 미적용 1대 · 확인 불가 0대 · 근거: 설치 보고 1대 · 적용 확인 기록 2대", { exact: true })).toBeVisible();
  await expect(page.getByText(/설치 보고 기준/)).toHaveCount(0);
  await page.getByRole("button", { name: "정책 적용 현황 보기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "수집 정책 적용 현황", exact: true });
  await expect(dialog).toContainText("최근 보고가 아닙니다");
  const table = dialog.getByRole("table", { name: "설치 목록" });
  await expect(table.getByRole("columnheader")).toContainText(["근거", "근거 시각"]);
  // 기본은 미적용 — 적용 확인 기록이 근거인 설치다.
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator("tbody tr").first()).toContainText("적용 확인 기록 · 보고 없음");
  await expect(table.locator("tbody tr").first()).toContainText("2026. 7. 2.");
  await dialog.getByRole("button", { name: /^적용 2$/ }).click();
  const reported = table.locator("tbody tr").filter({ hasText: "reported@example.test" });
  await expect(reported).toContainText("최근 설치 보고");
  await expect(reported).toContainText("2026. 10. 1.");
  const confirmed = table.locator("tbody tr").filter({ hasText: "confirmed@example.test" });
  await expect(confirmed).toContainText("적용 확인 기록 · 보고 없음");
  await expect(confirmed).toContainText("2026. 8. 17.");
});

test("보고를 받은 설치가 하나도 없으면 그 사실을 숨기지 않는다", async ({ page }) => {
  await mockRollout(page, { heartbeat: 0, appliedConfirmation: 3, none: 0 });
  await openDashboard(page, "/settings");
  await expect(page.getByText("적용 2대 · 미적용 1대 · 확인 불가 0대 · 근거: 적용 확인 기록 3대 — 설치 보고를 받은 설치가 없습니다", { exact: true })).toBeVisible();
});
