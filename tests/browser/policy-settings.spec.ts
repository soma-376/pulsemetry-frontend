import { expect, test, type Page, type Route } from "@playwright/test";
import example from "../../docs/api/settings-response.example.json";
import { openDashboard } from "./helpers";
import { retentionBoundary, seoulToday } from "../../src/lib/policy-settings";

/**
 * 설정의 좌석 회수 기준·집계 보존 저장과 보존 정리 작업 상태(UI 테스트). 서버 규칙(백엔드 ADR 0046·0047)을 흉내 낸 응답을 쓴다.
 * 실제 서버 검증은 tests/e2e/policy-settings.spec.ts가 한다.
 */
type Policy = Omit<typeof example.collectionPolicy, "cleanupOperationId" | "aggregateRetentionMonths"> & { cleanupOperationId: string | null; aggregateRetentionMonths: number | null };

async function mockPolicy(page: Page) {
  const cors = { "access-control-allow-origin": new URL(test.info().project.use.baseURL!).origin, "access-control-allow-headers": "content-type,authorization,idempotency-key", "access-control-allow-methods": "GET,PUT,OPTIONS", "access-control-expose-headers": "Retry-After" };
  const state = {
    policy: structuredClone(example.collectionPolicy) as Policy,
    saves: [] as Record<string, unknown>[],
    conflict: false,
    cleanup: "pending" as "pending" | "succeeded",
  };
  const json = (route: Route, value: unknown, status = 200, headers: Record<string, string> = {}) => route.fulfill({ status, headers: { ...cors, ...headers }, json: value });
  await page.route("**/api/v1/organizations/*/settings", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const data = structuredClone(example);
    data.meta.organizationId = new URL(route.request().url()).pathname.split("/organizations/")[1].split("/")[0];
    return json(route, { ...data, collectionPolicy: state.policy });
  });
  await page.route("**/api/v1/organizations/*/operations/*", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const done = state.cleanup === "succeeded";
    return json(route, {
      operationId: "cleanup-1", kind: "retention_cleanup", status: state.cleanup, createdAt: "2026-10-01T00:00:00Z", completedAt: done ? "2026-10-01T00:05:00Z" : null,
      results: [{ targetId: "analysis_source", status: done ? "succeeded" : "pending", reason: null, action: null }], canRestore: false, restoreUntil: null,
      retention: done ? { status: "logically_deleted", requestedBefore: "2025-09-30T15:00:00Z", deletedBefore: "2025-09-30T15:00:00Z", startedAt: "2026-10-01T00:01:00Z", finishedAt: "2026-10-01T00:05:00Z" } : null,
    }, 200, done ? {} : { "Retry-After": "1" });
  });
  return {
    state,
    /** 온보딩 fixture 다음에 건다(나중에 건 route 가 먼저 돈다). */
    async save() {
      await page.route("**/api/v1/organizations/*/collection-policy", async (route) => {
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        const body = route.request().postDataJSON();
        state.saves.push(body);
        if (state.conflict) return json(route, { error: { code: "version_conflict", message: "fixture" } }, 409);
        const policy = state.policy;
        if (body.expectedVersion !== policy.version || body.expectedSettingsVersion !== policy.settingsVersion) return json(route, { error: { code: "version_conflict", message: "fixture" } }, 409);
        const before = policy.aggregateRetentionMonths;
        if ("reclaimIdleDays" in body) Object.assign(policy, { reclaimIdleDays: body.reclaimIdleDays, reclaimIdleDaysSource: "organization" });
        if ("aggregateRetentionMonths" in body) policy.aggregateRetentionMonths = body.aggregateRetentionMonths;
        policy.settingsVersion += 1;
        const next = policy.aggregateRetentionMonths;
        const cleanupOperationId = "aggregateRetentionMonths" in body && next !== null && (before === null || next < before) ? "cleanup-1" : null;
        if (cleanupOperationId) policy.cleanupOperationId = cleanupOperationId;
        return json(route, { version: policy.version, collectRawContent: policy.collectRawContent, confirmedAt: null, application: "future_enrollments", existingInstallationsUpdated: false,
          reclaimIdleDays: policy.reclaimIdleDays, aggregateRetentionMonths: next, settingsVersion: policy.settingsVersion, settingsUpdatedAt: "2026-10-01T00:00:00Z", cleanupOperationId });
      });
    },
  };
}

test("회수 기준은 바로 저장하고, 보존 단축은 삭제 범위·경계를 확인한 뒤 저장해 정리 작업의 상태를 서버 값으로 보여 준다", async ({ page }) => {
  const api = await mockPolicy(page);
  await openDashboard(page, "/settings");
  await api.save();
  const reclaim = page.getByRole("combobox", { name: "좌석 회수 기준", exact: true });
  const retention = page.getByRole("combobox", { name: "집계 보존", exact: true });
  await expect(reclaim).toBeEnabled();
  await expect(reclaim).toHaveValue("14");

  // 회수 기준: 확인 없이 저장한다. manifest 판과 설정의 판을 함께 보낸다.
  await reclaim.selectOption("30");
  await expect.poll(() => api.state.saves.at(-1)).toEqual({ expectedVersion: 4, expectedSettingsVersion: 2, reclaimIdleDays: 30 });
  await expect(reclaim).toHaveValue("30");

  // 보존 단축: 확인 창이 경계 날짜와 범위를 알린다. 취소하면 아무것도 보내지 않는다.
  await retention.selectOption("12");
  const dialog = page.getByRole("dialog", { name: "집계 보존 줄이기", exact: true });
  await expect(dialog).toContainText("24개월에서 12개월로 줄입니다");
  await expect(dialog).toContainText(`${retentionBoundary(seoulToday(), 12)} 00:00(KST) 이전`);
  await expect(dialog).toContainText("분석 원본(팀·일·구성원 집계의 원천)");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(api.state.saves).toHaveLength(1);
  await expect(retention).toHaveValue("24");

  await retention.selectOption("12");
  await dialog.getByRole("button", { name: "기록 삭제에 동의하고 저장", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(api.state.saves.at(-1)).toEqual({ expectedVersion: 4, expectedSettingsVersion: 3, aggregateRetentionMonths: 12 });
  const status = page.getByRole("status", { name: "보존 정리 상태", exact: true });
  await expect(status).toHaveText("정리 대기 · 보존 작업이 실행되면 시작합니다");
  // 서버가 완료라고 할 때만 완료다(Retry-After 로 다시 조회한다).
  api.state.cleanup = "succeeded";
  await expect(status).toHaveText("정리 완료 · 2025-10-01 이전 분석 원본을 지웠습니다(논리 삭제)", { timeout: 10_000 });

  // 늘리면 삭제가 없어 확인 없이 저장한다.
  await retention.selectOption("36");
  await expect.poll(() => api.state.saves.at(-1)).toEqual({ expectedVersion: 4, expectedSettingsVersion: 4, aggregateRetentionMonths: 36 });
  await expect(dialog).not.toBeVisible();

  // 다른 곳에서 먼저 바꿨으면 오류를 보여 주고 최신 값을 다시 읽는다.
  api.state.conflict = true;
  await reclaim.selectOption("7");
  await expect(page.getByRole("region", { name: "수집 정책" }).or(page.locator("#collection"))).toContainText("다른 곳에서 변경되었습니다");
  await expect(reclaim).toHaveValue("30");
});
