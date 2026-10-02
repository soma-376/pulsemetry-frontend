import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";
import { expect, test, dashboardBase, enrollmentBase, seedOrganizations } from "./fixtures";
import { authenticatedRequest, signIn } from "./helpers";
import { retentionBoundary, seoulToday } from "../../src/lib/policy-settings";
import { PreparationError } from "./harness";

// 설정의 회수 기준·집계 보존 저장과 보존 정리 작업(백엔드 ADR 0046·0047)을 실제 서버로 본다. 기대값은 백엔드 명세 §13.2의 규칙에서 쓴다:
// 회수 기준은 조직별로 저장되고 구성원 화면이 같은 기준을 쓴다, 보존을 줄이면 확인 뒤 정리 작업이 생기고, 보존 작업의 요청 모드가 실행하면
// 작업이 완료로 보인다(경계 = 저장한 날의 KST 날짜에서 N개월 전 자정). 시드 A의 저장값은 30일·24개월이다(dev-seed).
const A = seedOrganizations[0];

/** 보존 작업 요청 모드의 실행 명령(JSON 배열). 격리 스택의 DB·ClickHouse 설정은 환경 변수로 넘어간다. */
function workerCommand(): string[] {
  const value = process.env.E2E_RETENTION_WORKER_CMD;
  if (!value) throw new PreparationError("E2E_RETENTION_WORKER_CMD에 보존 작업 요청 모드의 실행 명령(JSON 배열, 예: [\"java\",\"-jar\",\"retention-worker.jar\",\"--requests\"])을 설정하세요.");
  const command = JSON.parse(value) as string[];
  if (!Array.isArray(command) || !command.length || !command.includes("--requests")) throw new PreparationError("E2E_RETENTION_WORKER_CMD는 --requests 를 포함한 JSON 배열이어야 합니다.");
  return command;
}

type Settings = { collectionPolicy: { version: number; settingsVersion: number; reclaimIdleDays: number; aggregateRetentionMonths: number | null; cleanupOperationId: string | null } };
const settingsOf = async (page: Page) => (await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/settings`)).body as Settings;

async function save(page: Page, action: () => Promise<unknown>) {
  const response = page.waitForResponse((response) => response.url() === `${enrollmentBase()}/api/v1/organizations/${A.id}/collection-policy` && response.request().method() === "PUT");
  await action();
  const result = await response;
  expect(result.status()).toBe(200);
  return await result.json() as { settingsVersion: number; cleanupOperationId: string | null; reclaimIdleDays: number | null; aggregateRetentionMonths: number | null };
}

test("POLICY-A @p0 @write 회수 기준을 저장하면 새로고침 뒤에도 남고 구성원 화면이 같은 기준을 쓴다", async ({ page }) => {
  await signIn(page, "owner@seed-a.example.test");
  await page.goto("/settings");
  const reclaim = page.getByRole("combobox", { name: "좌석 회수 기준", exact: true });
  await expect(reclaim).toBeEnabled();
  const original = (await settingsOf(page)).collectionPolicy.reclaimIdleDays;
  const next = original === 14 ? 60 : 14;
  try {
    const saved = await save(page, () => reclaim.selectOption(String(next)));
    expect(saved.reclaimIdleDays).toBe(next);
    expect(saved.cleanupOperationId).toBeNull();
    await page.reload();
    await expect(reclaim).toHaveValue(String(next));
    const members = await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/members/dashboard?startDate=2026-09-01&endDate=2026-09-07&timeZone=Asia/Seoul`);
    expect(members.body.policy).toEqual({ idleDays: next, version: saved.settingsVersion });
    await page.goto("/members");
    await expect(page.getByRole("region", { name: "좌석 회수 후보", exact: true })).toContainText(`회수 기준 ${next}일`);
  } finally {
    await page.goto("/settings");
    if ((await settingsOf(page)).collectionPolicy.reclaimIdleDays !== original) await save(page, () => reclaim.selectOption(String(original)));
  }
});

test("RETENTION-A @p0 @write 보존을 줄이면 확인 뒤 정리 작업이 생기고, 보존 작업 실행 뒤 완료로 보이며 새로고침 뒤에도 그 상태를 본다", async ({ page }) => {
  const command = workerCommand();
  await signIn(page, "owner@seed-a.example.test");
  await page.goto("/settings");
  const retention = page.getByRole("combobox", { name: "집계 보존", exact: true });
  await expect(retention).toBeEnabled();
  const original = (await settingsOf(page)).collectionPolicy.aggregateRetentionMonths;
  try {
    // 12개월보다 길게 두고 시작한다(늘리는 저장은 삭제가 없어 확인 없이 저장된다).
    if (original !== null && original <= 12) {
      const longer = await save(page, () => retention.selectOption("24"));
      expect(longer.cleanupOperationId).toBeNull();
    }
    await retention.selectOption("12");
    const dialog = page.getByRole("dialog", { name: "집계 보존 줄이기", exact: true });
    const boundary = retentionBoundary(seoulToday(), 12);
    await expect(dialog).toContainText(`${boundary} 00:00(KST) 이전`);
    const saved = await save(page, () => dialog.getByRole("button", { name: "기록 삭제에 동의하고 저장", exact: true }).click());
    expect(saved.aggregateRetentionMonths).toBe(12);
    const operationId = saved.cleanupOperationId!;
    expect(operationId).toBeTruthy();
    expect((await settingsOf(page)).collectionPolicy.cleanupOperationId).toBe(operationId);
    const status = page.getByRole("status", { name: "보존 정리 상태", exact: true });
    await expect(status).toHaveText("정리 대기 · 보존 작업이 실행되면 시작합니다");

    // 보존 작업의 요청 모드를 실제로 실행한다(격리 스택). 화면은 서버가 완료라고 할 때만 완료다.
    execFileSync(command[0], command.slice(1), { stdio: "pipe", timeout: 180_000 });
    const operation = (await authenticatedRequest(page, dashboardBase(), `/api/v1/organizations/${A.id}/operations/${operationId}`)).body;
    expect(operation.status).toBe("succeeded");
    expect(operation.retention.status).toBe("logically_deleted");
    // 요청 경계 = 저장한 날(KST)에서 12개월 전 자정.
    expect(new Date(operation.retention.requestedBefore).toISOString()).toBe(new Date(`${boundary}T00:00:00+09:00`).toISOString());
    const deleted = new Date(operation.retention.deletedBefore).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    await expect(status).toHaveText(`정리 완료 · ${deleted} 이전 분석 원본을 지웠습니다(논리 삭제)`, { timeout: 20_000 });
    await page.reload();
    await expect(status).toHaveText(`정리 완료 · ${deleted} 이전 분석 원본을 지웠습니다(논리 삭제)`);
  } finally {
    // 늘리는 저장이라 요청이 없다. 지운 기록과 경계는 되돌리지 않는다(격리 DB).
    if ((await settingsOf(page)).collectionPolicy.aggregateRetentionMonths !== original) {
      const restored = await save(page, () => retention.selectOption(original === null ? "" : String(original)));
      expect(restored.cleanupOperationId).toBeNull();
    }
  }
});
